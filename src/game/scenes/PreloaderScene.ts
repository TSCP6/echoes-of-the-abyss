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

export class PreloaderScene extends Scene {
    private retryCount = 0;

    constructor() { super('Preloader'); }

    init(): void {
        this.add.image(512, 384, 'background');
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
        this.load.spritesheet('player_idle', 'gen/player_idle.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_run', 'gen/player_run.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_jump', 'gen/player_jump.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_fall', 'gen/player_fall.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player_hit', 'gen/player_hit.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('checkpoint_flag', 'gen/checkpoint_flag.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('goal_idle', 'gen/goal_idle.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('fruit_apple', 'gen/fruit_apple.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('fruit_collected', 'gen/fruit_collected.png', { frameWidth: 64, frameHeight: 64 });
        this.load.image('bg_green', 'gen/bg_green.png');
        // 关卡地图按关懒加载（NF-03）：M2 仅 1-1
        this.load.tilemapTiledJSON('map_1-1', 'levels/1-1.json');
    }

    create(): void {
        if (this.registry.get('configInvalid') === true) { return; }
        this.registerPlaceholderTextures();
        this.registerAnimations();
        // M2：新档基线（FR-13 规则 7：主菜单"继续游戏"置灰由 AppBoot 结果驱动；SaveSystem P3）
        progressService.reset();
        inventoryStore.initNewGame();
        weaponService.initNewGame();
        AppBoot.resolve({ save: null, configErrors: [] });
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
    }
}
