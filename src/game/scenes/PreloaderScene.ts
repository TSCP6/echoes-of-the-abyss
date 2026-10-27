/**
 * PreloaderScene（ARCH-17 / FLOW-R1）：配置校验 → 资源加载（进度条）→ 读档 → AppBoot.resolve。
 * 配置校验先于资源加载（避免加载 30MB 后才发现配置非法）；失败停留本场景 + 错误清单 + 重试（EX-03）。
 * M1/M2：SaveSystem 于 P3 接入，此处新档基线（inventory/weapon initNewGame）+ resolve({save:null})。
 */
import { Scene } from 'phaser';
import { validateAll, markValidated } from '../domain/configRegistry';
import { progressService } from '../domain/progressService';
import { inventoryStore } from '../domain/inventoryStore';
import { weaponService } from '../domain/weaponService';
import { AppBoot } from '../domain/appBoot';
import { emitEvent } from '../events';
import { bootstrapSave, syncSkpFromProgress } from '../domain/saveBootstrap';
import { saveSystem } from '../domain/saveSystem';
import type { SaveData } from '../domain/saveSchema';
import { audioDirector } from '../systems/audioDirector';
import { bindViewportLayout, centerDesignCamera } from '../systems/viewportLayout';
import { loadEnemyArt, registerEnemyAnimations } from '../systems/enemyVisuals';

export class PreloaderScene extends Scene {
    private retryCount = 0;
    private failedAssets: string[] = [];

    constructor() { super('Preloader'); }

    init(): void {
        centerDesignCamera(this);
        const bg = this.add.image(0, 0, 'background').setScrollFactor(0);
        bindViewportLayout(this, (width, height) => {
            bg.setPosition(width / 2, height / 2).setScale(Math.max(width / bg.width, height / bg.height));
        });
        this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);
        const bar = this.add.rectangle(512 - 230, 384, 4, 28, 0xffffff);
        this.load.on('progress', (progress: number) => {
            bar.width = 4 + 460 * progress;
            emitEvent('load:progress', { percent: Math.round(progress * 100) });
        });
    }

    preload(): void {
        // DD-02：配置校验先行（fail-fast，EX-03 语义扩展到配置域）
        const check = validateAll();
        if (!check.ok) {
            this.load.on('complete', () => this.showConfigError(check.errors ?? []));
            return;
        }
        markValidated();

        this.load.setPath('assets');
        this.load.image('terrain32', 'gen/terrain32.png');
        // CC0 美术（Pixel Adventure 1 / SunnyLand Woods，docs/素材许可清单.md）；帧网格与占位一致（DD-11 换帧不改代码）
        this.load.spritesheet('player_idle', 'art/player_idle.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_run', 'art/player_run.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_jump', 'art/player_jump.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_fall', 'art/player_fall.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_hit', 'art/player_hit.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('checkpoint_flag', 'art/checkpoint_flag.png', { frameWidth: 128, frameHeight: 128 });
        this.load.image('goal_idle', 'art/goal_idle.png');
        this.load.spritesheet('fruit_apple', 'art/fruit_apple.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('fruit_collected', 'art/fruit_collected.png', { frameWidth: 64, frameHeight: 64 });
        this.load.image('bg_green', 'art/bg_green.png');
        loadEnemyArt(this);
        // DD-11 音频清单（双格式 ogg/m4a：Safari ≥17 不解 Vorbis，NFR-06）
        const audioFiles = [
            'sfx_jump', 'sfx_land', 'sfx_swing', 'sfx_hit_melee', 'sfx_shoot', 'sfx_hit_taken',
            'sfx_coin', 'sfx_pickup_item', 'sfx_checkpoint', 'sfx_death', 'sfx_skill', 'sfx_dash',
            'sfx_heal', 'sfx_clear', 'sfx_ui_click', 'sfx_ui_open', 'sfx_ui_close', 'sfx_ui_error', 'sfx_buy',
            'bgm_scene1', 'bgm_scene2', 'bgm_boss1_tense', 'bgm_boss2_tense', 'bgm_boss3_tense'
        ];
        for (const f of audioFiles) {
            this.load.audio(f, [`audio/${f}.ogg`, `audio/${f}.m4a`]);
        }
        // EX-03：资源加载失败 → 错误清单 + 重试（≤3 次后提示刷新）
        this.load.on('loaderror', (file: { key?: string; url?: string }) => {
            const name = file.key ?? file.url ?? 'unknown';
            if (!this.failedAssets.includes(name)) { this.failedAssets.push(name); }
        });
    }

    create(): void {
        if (this.registry.get('configInvalid') === true) { return; }
        if (this.failedAssets.length > 0) {
            this.showAssetError(this.failedAssets);
            return;
        }
        audioDirector.attach(this.game); // MOD-08：音频资源已加载，绑定 game（解锁经 UiLayer 手势）
        this.registerPlaceholderTextures();
        this.registerAnimations();
        registerEnemyAnimations(this);
        // FLOW-R1：存档装配 → 读档（checksum/迁移/损坏处置）→ 各 store 恢复
        bootstrapSave();
        const loadResult = saveSystem.load(0);
        let save: SaveData | null = null;
        if (loadResult.ok) {
            save = loadResult.value;
            if (save === null) {
                progressService.reset();
                inventoryStore.initNewGame();
                weaponService.initNewGame();
            } else {
                syncSkpFromProgress();
                inventoryStore.restoreMissingInitialWeapons(weaponService.getOwned().map((w) => w.itemId));
            }
        } else {
            // EX-02：损坏已备份并新建（handleCorrupt 内完成）；新档基线
            console.warn(`[Preloader] 读档失败 ${loadResult.code}，新建存档`);
            progressService.reset();
            inventoryStore.initNewGame();
            weaponService.initNewGame();
        }
        AppBoot.resolve({ save, configErrors: [] });
        this.scene.start('Menu');
    }

    private showConfigError(errors: Array<{ table: string; id: string; field: string; rule: string; actual: unknown }>): void {
        this.registry.set('configInvalid', true);
        this.add.text(512, 200, '配置校验失败（EX-03）', { fontSize: '32px', color: '#ff5555' }).setOrigin(0.5);
        const lines = errors.slice(0, 12).map((e) => `${e.table}/${e.id}.${e.field}: ${e.rule}（实际 ${String(e.actual)}）`);
        this.add.text(512, 260, lines.join('\n'), { fontSize: '16px', color: '#ffffff', align: 'center' }).setOrigin(0.5, 0);
        const btn = this.add.text(512, 620, '[ 重试 ]', { fontSize: '24px', color: '#88ff88' }).setOrigin(0.5).setInteractive();
        btn.on('pointerdown', () => {
            this.retryCount += 1;
            this.registry.set('configInvalid', false);
            this.scene.restart();
        });
        AppBoot.reject(new Error(`CONFIG_INVALID: ${errors.length} 项`));
    }

    /** EX-03：资源加载失败清单 + 重试按钮（连续 3 次提示刷新） */
    private showAssetError(failed: string[]): void {
        this.add.text(512, 200, '资源加载失败（EX-03）', { fontSize: '32px', color: '#ff5555' }).setOrigin(0.5);
        const lines = failed.slice(0, 10).map((f) => `· ${f}`);
        this.add.text(512, 260, lines.join('\n'), { fontSize: '16px', color: '#ffffff', align: 'center' }).setOrigin(0.5, 0);
        const label = this.retryCount >= 3 ? '[ 重试 ]（多次失败请刷新页面）' : '[ 重试 ]';
        const btn = this.add.text(512, 620, label, { fontSize: '24px', color: '#88ff88' }).setOrigin(0.5).setInteractive();
        btn.on('pointerdown', () => {
            this.retryCount += 1;
            this.failedAssets = [];
            this.scene.restart();
        });
        AppBoot.reject(new Error(`ASSET_MISSING: ${failed.length} 项`));
    }

    /** M2 程序化占位纹理（零许可风险）；P4 换 CC0 图集帧（DD-11 换帧不改代码） */
    private registerPlaceholderTextures(): void {
        const make = (key: string, color: number): void => {
            if (this.textures.exists(key)) { return; }
            const g = this.make.graphics(); // creator 默认不加入场景
            g.fillStyle(color, 1);
            g.fillRect(6, 8, 36, 36);
            g.fillStyle(0x000000, 1);
            g.fillRect(14, 18, 6, 6);
            g.fillRect(28, 18, 6, 6);
            g.generateTexture(key, 48, 48);
            g.destroy();
        };
        make('enemy_patrol', 0xb05656);
        make('enemy_chaser', 0xd07830);
        make('enemy_flyer', 0x8060c0);
        make('enemy_boss', 0x606080);
    }

    /** 挥击 4 帧程序化纹理（64×64 网格，剑弧旋转；零许可风险） */
    private registerSwingTexture(): void {
        if (this.textures.exists('player_swing_0')) { return; }
        for (let f = 0; f < 4; f++) {
            const g = this.make.graphics();
            g.fillStyle(0xf4f4f4, 1);
            // 剑弧：随帧旋转的扇形近似（4 段矩形），-60° → 60°
            const angle = -60 + f * 40;
            for (let s = 0; s < 4; s++) {
                const a = ((angle + s * 8) * Math.PI) / 180;
                const r = 18 + s * 4;
                g.fillRect(32 + Math.cos(a) * r - 2, 32 + Math.sin(a) * r - 2, 5, 5);
            }
            g.generateTexture(`player_swing_${f}`, 64, 64);
            g.destroy();
        }
    }

    /** 保留角色本体，叠加弩与短暂枪口闪光；和挥剑动作区分。 */
    private registerShootTextures(): void {
        if (this.textures.exists('player_shoot_0')) { return; }
        const base = this.textures.getFrame('player_idle', 0);
        for (let f = 0; f < 3; f++) {
            const texture = this.textures.createCanvas(`player_shoot_${f}`, 64, 64);
            if (texture === null) { continue; }
            const ctx = texture.getContext();
            ctx.imageSmoothingEnabled = false;
            const recoil = f === 0 ? -2 : 0;
            ctx.drawImage(base.source.image as HTMLImageElement,
                base.cutX, base.cutY, base.cutWidth, base.cutHeight, recoil, 0, 64, 64);
            ctx.fillStyle = '#75482e';
            ctx.fillRect(38 + recoil, 30, 19, 5);
            ctx.fillStyle = '#d8e4e8';
            ctx.fillRect(49 + recoil, 23, 3, 19);
            ctx.fillRect(39 + recoil, 32, 22, 2);
            if (f === 0) {
                ctx.fillStyle = '#ffe066';
                ctx.fillRect(58, 28, 5, 9);
                ctx.fillRect(55, 31, 9, 3);
            }
            texture.refresh();
        }
    }

    private registerAnimations(): void {
        const a = this.anims;
        if (!a.exists('player-idle')) {
            a.create({ key: 'player-idle', frames: a.generateFrameNumbers('player_idle', { start: 0, end: 10 }), frameRate: 8, repeat: -1 });
        }
        if (!a.exists('player-run')) {
            a.create({ key: 'player-run', frames: a.generateFrameNumbers('player_run', { start: 0, end: 11 }), frameRate: 12, repeat: -1 });
        }
        if (!a.exists('player-jump')) {
            a.create({ key: 'player-jump', frames: a.generateFrameNumbers('player_jump', { start: 0, end: 0 }), frameRate: 1 });
        }
        if (!a.exists('player-fall')) {
            a.create({ key: 'player-fall', frames: a.generateFrameNumbers('player_fall', { start: 0, end: 0 }), frameRate: 1 });
        }
        if (!a.exists('player-hit')) {
            a.create({ key: 'player-hit', frames: a.generateFrameNumbers('player_hit', { start: 0, end: 6 }), frameRate: 12, repeat: 0 });
        }
        // FR-16 规则 3：死亡 6 帧（0.8 s 停顿由 LevelScene DEATH_PAUSE_MS 承担）
        if (!a.exists('player-dead')) {
            a.create({ key: 'player-dead', frames: a.generateFrameNumbers('player_hit', { start: 0, end: 5 }), frameRate: 8, repeat: 0 });
        }
        // FR-16 规则 3：挥击 4 帧（程序化剑弧，零许可风险）
        this.registerSwingTexture();
        if (!a.exists('player-swing')) {
            a.create({
                key: 'player-swing', frameRate: 24, repeat: 0,
                frames: [{ key: 'player_swing_0' }, { key: 'player_swing_1' }, { key: 'player_swing_2' }, { key: 'player_swing_3' }]
            });
        }
        this.registerShootTextures();
        if (!a.exists('player-shoot')) {
            a.create({
                key: 'player-shoot', frameRate: 24, repeat: 0,
                frames: [{ key: 'player_shoot_0' }, { key: 'player_shoot_1' }, { key: 'player_shoot_2' }]
            });
        }
    }
}
