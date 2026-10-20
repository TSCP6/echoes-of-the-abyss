/**
 * LevelScene（ARCH-17）—— 承载 12 关（FR-11）含 Boss 战（FR-03 规则 4）。
 * ARCH-13 帧管线：1 输入 → 2 玩家 → 3 弹丸/技能 → 5 战斗 → 6 敌人 → 7 拾取 → 8 资源 → 9 相机 → 10 HUD。
 * 死亡：player:died → 0.8 s → 检查点重生 + 敌人重置 + 存档写入点（FR-11 规则 7 / FR-13）。
 * 终点：level:cleared → RecordStore.submitResult + ProgressService 首通 SKP + 存档写入点（FR-13 规则 2）。
 * Boss：阶段切换锁相机（FR-02 规则 5）+ HUD 血条（FR-14 规则 5）；召唤/危险区技能经 EnemyEvents。
 */
import { Geom, Scene, Tilemaps } from 'phaser';
import { LevelLoader, type LevelContext } from '../systems/levelLoader';
import { PlayerController } from '../systems/playerController';
import { CameraRig } from '../systems/cameraRig';
import { InputGateway } from '../systems/inputGateway';
import { PickupSystem } from '../systems/pickupSystem';
import { EnemyAI, type ArenaHazard } from '../systems/enemyAI';
import { ProjectilePool } from '../systems/projectilePool';
import { CombatResolver } from '../systems/combatResolver';
import { WorldFxLayer } from '../systems/worldFxLayer';
import { sceneDirector } from '../systems/sceneDirector';
import { hudViewModel } from '../domain/hudViewModel';
import { resourceSystem } from '../domain/resourceSystem';
import { economyService } from '../domain/economyService';
import { progressService } from '../domain/progressService';
import { weaponService } from '../domain/weaponService';
import { skillService } from '../domain/skillService';
import { recordStore } from '../domain/recordStore';
import { saveSystem } from '../domain/saveSystem';
import { ConfigRegistry } from '../domain/configRegistry';
import { EventBus } from '../EventBus';
import { emitEvent, onEvent, offEvent } from '../events';
import { audioDirector } from '../systems/audioDirector';
import { TutorialDirector } from '../systems/tutorialDirector';

const DEATH_PAUSE_MS = 800; // FR-16 规则 3
const DASH_SPEED_PX_S = 900; // 回响冲刺 180px / 0.2s

export class LevelScene extends Scene {
    private levelId = '1-1';
    private ctx!: LevelContext;
    private gateway!: InputGateway;
    private player!: PlayerController;
    private cameraRig!: CameraRig;
    private pickups!: PickupSystem;
    private enemies!: EnemyAI;
    private projectiles!: ProjectilePool;
    private combat!: CombatResolver;
    private fx!: WorldFxLayer;
    private hud = hudViewModel;
    private elapsedSec = 0;
    private kills = 0;
    private dead = false;
    private activeCheckpoint = 'cp_1';
    private overlayOpen = false;
    private hazards: ArenaHazard[] = [];
    private dashTimer = 0;
    private tutorial: TutorialDirector | null = null;
    private bossWoken = false;
    /** create 完成前置位；preload 窗口期（同关重启）update 跳过管线（防旧 player/combat 空引用，EXD-4） */
    private ready = false;
    private onPlayerDamaged = (p: { amount: number; sourceId: string; hp: number }): void => {
        void p;
        audioDirector.playSfx('hit_taken');
        this.fx.hitFlash(this.player.sprite); // FR-16 规则 3：受击闪白 0.08 s
        this.cameraRig.shake(4, 120); // FR-16 规则 3：4 px / 0.12 s（AT-57 震屏开关旁路）
    };
    private onOverlay = (p: { name: string; open: boolean }): void => {
        if (!sceneDirector.isGameplay(this)) { return; }
        this.overlayOpen = p.open;
        // 切换期非活动场景不 pause/resume（消除 Phaser 警告）；resume 仅在已暂停时
        if (p.open) { if (this.scene.isActive()) { this.scene.pause(); } }
        else if (this.scene.isPaused()) { this.scene.resume(); }
    };
    private onEnemyKilled = (p: { enemyId: string; coins: number; position: { x: number; y: number } }): void => {
        this.kills += 1;
        recordStore.addKill();
        resourceSystem.notifyKill(); // FR-06 规则 5
        this.pickups.spawnCoinBurst(p.position, p.coins); // FR-09 掉落
    };

    /** NF-03：地图按关懒加载（进关时 load，不随首屏） */
    preload(): void {
        this.load.setPath('assets');
        this.load.tilemapTiledJSON(`map_${this.levelId}`, `levels/${this.levelId}.json`);
    }

    constructor() { super('Level'); }

    init(data: { levelId?: string }): void {
        this.levelId = data.levelId ?? '1-1';
        this.ready = false; // 重建期旧管线停摆（preload 窗口期 update 跳过）
    }
    create(): void {
        const loader = new LevelLoader(this);
        const result = loader.load(this.levelId);
        if (!result.ok) {
            console.error(`[LevelScene] ${result.code}: ${result.message}`);
            sceneDirector.gotoMenu();
            return;
        }
        this.ctx = result.value;
        progressService.setCurrentLevel(this.levelId);

        const bg = this.add.tileSprite(512, 384, 1024, 768, 'bg_green');
        bg.setScrollFactor(0.2);
        bg.setDepth(-20);

        this.gateway = new InputGateway(this);
        this.player = new PlayerController(this, this.gateway);
        this.player.teleportTo(this.ctx.spawn.x, this.ctx.spawn.y);

        this.cameraRig = new CameraRig(this, this.player);
        this.cameraRig.setMapSize(this.ctx.mapWidth, this.ctx.mapHeight);

        this.physics.add.collider(this.player.sprite, this.ctx.collisionGroup);
        this.physics.add.collider(
            this.player.sprite, this.ctx.onewayGroup, undefined,
            (p, t) => loader.onewayProcess((p as { body: Phaser.Physics.Arcade.Body }).body, t as Tilemaps.Tile),
            this
        );
        const collisionLayer = this.ctx.collisionGroup;
        const groundProbe = (x: number, y: number): boolean => {
            const tile = (collisionLayer as Tilemaps.TilemapLayer).getTileAtWorldXY(x, y, true);
            return tile !== null && tile.index > 0;
        };

        this.fx = new WorldFxLayer(this);
        this.enemies = new EnemyAI(this, this.ctx, this.player, groundProbe);
        this.projectiles = new ProjectilePool(this, this.ctx);
        this.enemies.projectiles = this.projectiles;
        this.enemies.events = {
            onBossPhase: (enemy, phaseIndex) => {
                // FR-02 规则 5：Boss 战锁相机至场地；FR-14 规则 5 血条由每帧 setBossBar 驱动
                const arena = new Geom.Rectangle(enemy.spawnPos.x - 400, enemy.spawnPos.y - 300, 800, 600);
                this.cameraRig.lockTo(arena);
                audioDirector.setBossPhase(phaseIndex); // FR-16 规则 1：紧张变体
            },
            onBossSkill: (enemy, kind, params) => {
                if (kind === 'summon') {
                    const count = Math.floor(params.count ?? 2);
                    const ref = params.enemyRef ?? 0;
                    const defIds = ['enm_patrol', 'enm_chaser', 'enm_flyer'];
                    const defId = defIds[Math.min(ref, defIds.length - 1)] as string;
                    for (let i = 0; i < count; i++) {
                        this.enemies.summonAt(enemy.sprite.x + (i % 2 === 0 ? -60 : 60), enemy.sprite.y, defId);
                    }
                } else if (kind === 'arenaHazard') {
                    const count = Math.floor(params.count ?? 3);
                    const dur = params.durationSec ?? 2;
                    for (let i = 0; i < count; i++) {
                        const hx = this.player.sprite.x + (i - (count - 1) / 2) * 96;
                        this.hazards.push({
                            rect: new Geom.Rectangle(hx - 32, this.player.sprite.y - 16, 64, 48),
                            untilSec: this.elapsedSec + dur,
                            damage: params.damage ?? 14
                        });
                    }
                }
            }
        };
        this.combat = new CombatResolver(this, this.player, this.enemies, this.projectiles, this.fx);
        this.combat.onPlayerDied = () => this.onPlayerDeath();
        this.combat.onEnemyHit = () => audioDirector.playSfx('hit_melee'); // AT-56 命中音效
        // 攻击发起音效（TutorialDirector 在其后链式追加完成判定，6.2.3）
        this.combat.onAttackBegan = () => {
            const eq = weaponService.getEquippedDefs();
            const ranged = eq.main?.type === 'ranged' || eq.sub?.type === 'ranged';
            audioDirector.playSfx(ranged ? 'shoot' : 'swing');
        };
        for (const e of this.enemies.getEntities()) {
            this.physics.add.collider(e.sprite, collisionLayer);
        }

        // DEV 测试接缝（13.2）：暴露 EnemyAI/CombatResolver 供自动化验证 AT-08~11
        if (import.meta.env.DEV) {
            const devScene = this as unknown as { __enemies?: EnemyAI; __combat?: CombatResolver };
            devScene.__enemies = this.enemies;
            devScene.__combat = this.combat;
        }

        for (const cp of this.ctx.checkpoints) {
            this.add.sprite(cp.x, cp.y, 'checkpoint_flag', 0).setScale(0.5).setDepth(4);
        }
        this.add.sprite(this.ctx.goal.x + 32, this.ctx.goal.y + 48, 'goal_idle', 0).setScale(0.5).setDepth(4);
        for (const sh of this.ctx.shards) {
            if (!progressService.isShardCollected(this.levelId, sh.id)) {
                this.add.sprite(sh.x, sh.y, 'fruit_apple', 0).setScale(0.5).setDepth(4).setName(`shard_${sh.id}`);
            }
        }

        this.pickups = new PickupSystem(this, this.player, this.ctx, {
            onCheckpoint: (id) => {
                this.activeCheckpoint = id;
                this.hud.setContext(this.levelId, this.pickups.checkpointsActive);
                audioDirector.playSfx('checkpoint');
                this.fx.checkpointParticles(this.ctx.checkpoints.find((c) => c.id === id));
            },
            onShard: (key) => {
                this.children.getByName(`shard_${key}`)?.destroy();
                skillService.grantShardSkp(); // 1 枚 = 1 SKP（附录 A）
                audioDirector.playSfx('pickup_item');
            },
            onChest: () => { audioDirector.playSfx('pickup_item'); },
            onGoal: () => this.onGoalReached(),
            onHint: (id, action) => {
                this.tutorial?.onHintEnter(id, action, this.hintText(action));
            }
        });
        // MOD-09 教学（仅 1-1 新档）；钩子链在 Director 内保留音效钩子
        this.tutorial = new TutorialDirector(this.levelId, this.gateway, this.player, this.combat, this.pickups);
        // 玩家动作音效（6.2.3 场景内直调；链式保留 TutorialDirector 已挂钩子）
        const prevJump = this.player.onJumped;
        this.player.onJumped = () => { prevJump?.(); audioDirector.playSfx('jump'); };
        this.player.onLanded = () => { this.cameraRig.onLanded(); audioDirector.playSfx('land'); };
        const prevCoin = this.pickups.onCoinPicked;
        this.pickups.onCoinPicked = () => { prevCoin?.(); audioDirector.playSfx('coin'); };
        const prevChest = this.pickups.onChestOpened;
        this.pickups.onChestOpened = () => { prevChest?.(); audioDirector.playSfx('buy'); };
        audioDirector.playBgm('level');
        onEvent('player:damaged', this.onPlayerDamaged);

        this.hud.setContext(this.levelId, 0);
        this.elapsedSec = 0;
        this.kills = 0;
        this.dead = false;
        this.hazards = [];
        onEvent('ui:overlay', this.onOverlay);
        onEvent('enemy:killed', this.onEnemyKilled);

        this.ready = true;
        this.cameras.main.fadeIn(400, 0, 0, 0);
        sceneDirector.setActiveGameplay(this);
        EventBus.emit('current-scene-ready', this);
    }

    private hintText(action: string): string {
        const map: Record<string, string> = {
            move: '← → 或 A D 移动',
            jump: 'Space 跳跃（短按控制高度）',
            attack: 'J / 鼠标左键 攻击',
            pickup: '靠近金币自动拾取',
            interact: 'E 交互（宝箱/传送门）'
        };
        return map[action] ?? action;
    }

    /** 技能释放（FR-07 规则 4/6）：决策与执行分离（4.3.5） */
    private tryCastSlot(slot: 0 | 1 | 2 | 3): void {
        const id = skillService.getLoadout()[slot];
        if (id === null) { return; }
        const decision = skillService.tryCast(id);
        if (!decision.ok) { return; } // SP 不足/冷却：不消耗（FR-07 边界）
        const p = this.player.getMotionState();
        const ef = decision.value.effect;
        audioDirector.playSfx(ef.heal !== undefined ? 'heal' : 'skill'); // AT-56 技能/治疗音效
        if (ef.damage !== undefined && ef.radius !== undefined) {
            this.combat.areaDamage(p.x, p.y, ef.radius, ef.damage);
        } else if (ef.projectileCount !== undefined) {
            const def = weaponService.getEquippedDefs().main;
            const count = ef.projectileCount;
            const spread = ef.spreadDeg ?? 15;
            for (let i = 0; i < count; i++) {
                const angle = (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
                if (def !== null && def.type === 'ranged') {
                    this.combat.spawnProjectile({ ...def, baseDamage: ef.damage ?? def.baseDamage }, angle);
                }
            }
        } else if (ef.dashDistance !== undefined) {
            this.dashTimer = 0.2;
            this.player.iFrameUntil = this.time.now + (ef.invincibleMs ?? 200);
            this.player.body.setVelocityX(p.facing * DASH_SPEED_PX_S);
        } else if (ef.heal !== undefined) {
            resourceSystem.heal(ef.heal);
        }
    }

    private onPlayerDeath(): void {
        if (this.dead) { return; }
        this.dead = true;
        recordStore.addDeath();
        audioDirector.playSfx('death');
        this.player.die(this.activeCheckpoint, this.levelId);
        this.time.delayedCall(DEATH_PAUSE_MS, () => {
            this.respawn();
            saveSystem.markDirty(); // FR-13：死亡重生后写入点（检查点进度）
            saveSystem.queueWrite();
        });
    }

    private onGoalReached(): void {
        const shards = this.ctx.shards.filter((s) => progressService.isShardCollected(this.levelId, s.id)).length;
        audioDirector.playSfx('clear');
        const res = progressService.completeLevel(this.levelId);
        // FR-19：最佳成绩（AT-64 新纪录判定）
        recordStore.submitResult(this.levelId, this.elapsedSec, shards);
        recordStore.setShardsTotal(progressService.toSnapshot().collectedShards.length);
        // 首通奖励：Boss 关 +2 SKP（附录 A）；碎片 SKP 已在采集时发放
        if (res.firstClear && this.ctx.bossId !== null) {
            skillService.grantBossSkp(ConfigRegistry.bossSkpReward());
        }
        emitEvent('level:cleared', {
            levelId: this.levelId,
            timeSec: Math.round(this.elapsedSec * 10) / 10,
            kills: this.kills,
            shards,
            coins: economyService.getCoins()
        });
        // FR-13 规则 2：关卡结算完成 = 写入点
        saveSystem.markDirty();
        saveSystem.queueWrite();
        sceneDirector.gotoMenu();
    }

    /** Boss 唤醒（进入场地）→ 紧张 BGM 变体（FR-16 规则 1，订阅 BossBrain 的呈现侧落实） */
    private bossWakeCheck(): void {
        if (this.bossWoken) { return; }
        const boss = this.enemies.getBoss();
        if (boss === null || boss.sleeping) { return; }
        this.bossWoken = true;
        audioDirector.setBossPhase(boss.phaseIndex);
    }

    private respawn(): void {
        const cp = this.ctx.checkpoints.find((c) => c.id === this.activeCheckpoint) ?? this.ctx.checkpoints[0];
        resourceSystem.refill(); // FR-11 规则 7
        this.enemies.resetAll();
        this.hazards = [];
        this.cameraRig.lockTo(null);
        this.player.teleportTo(cp.x, cp.y);
        this.dead = false;
        this.hud.setContext(this.levelId, this.pickups.checkpointsActive);
    }

    update(_time: number, deltaMs: number): void {
        const dt = Math.min(deltaMs / 1000, 0.1); // 冻结/切回单帧巨型 dt 钳制（防物理爆冲，EX-05 精神）
        audioDirector.tick(dt); // MOD-08：合并窗口时钟 + 交叉淡化斜坡
        if (this.overlayOpen || !this.ready) { return; }

        // 阶段 1：输入
        this.gateway.poll();

        // 攻击（FR-05）
        if (!this.dead && !weaponService.isSwitchLocked()) {
            if (this.gateway.justPressed('attackMain')) {
                const def = weaponService.getEquippedDefs().main;
                if (def !== null && this.player.beginAttack()) {
                    this.combat.activeWeaponId = def.id;
                    if (def.type === 'melee') { this.combat.beginMelee(def); }
                    else if (weaponService.consumeAmmo(def.id).ok) { this.combat.spawnProjectile(def, 0); }
                }
            }
            if (this.gateway.justPressed('attackSub')) {
                const def = weaponService.getEquippedDefs().sub;
                if (def !== null && def.type === 'ranged' && this.player.beginAttack()) {
                    this.combat.activeWeaponId = def.id;
                    if (weaponService.consumeAmmo(def.id).ok) { this.combat.spawnProjectile(def, 0); }
                }
            }
        }
        // 技能 1~4（FR-07 规则 6）
        if (!this.dead) {
            if (this.gateway.justPressed('skill1')) { this.tryCastSlot(0); }
            if (this.gateway.justPressed('skill2')) { this.tryCastSlot(1); }
            if (this.gateway.justPressed('skill3')) { this.tryCastSlot(2); }
            if (this.gateway.justPressed('skill4')) { this.tryCastSlot(3); }
        }

        // 阶段 2：玩家
        this.player.update(deltaMs);
        this.tutorial?.update(dt); // MOD-09：move 完成判定 + 8 s 超时
        this.bossWakeCheck();
        if (this.dashTimer > 0) { this.dashTimer -= dt; }

        // 阶段 3：弹丸
        this.projectiles.update(dt);

        // 阶段 5：战斗
        this.combat.update(dt);

        // 阶段 6：敌人
        this.enemies.update(dt, this.time.now);

        // Boss 血条（FR-14 规则 5）
        const boss = this.enemies.getBoss();
        this.hud.setBossBar(boss !== null ? { name: boss.def.id, ratio: Math.max(0, boss.hp / boss.def.hp) } : null);

        // 即死区 + Boss 危险区
        if (!this.dead) {
            const b = this.player.body;
            const pb = new Geom.Rectangle(b.x, b.y, b.width, b.height);
            let died = false;
            for (const hz of this.ctx.hazards) {
                if (Geom.Rectangle.Overlaps(pb, hz)) { died = true; break; }
            }
            if (!died) {
                this.hazards = this.hazards.filter((h) => h.untilSec > this.elapsedSec);
                for (const hz of this.hazards) {
                    if (Geom.Rectangle.Overlaps(pb, hz.rect)) {
                        const applied = resourceSystem.applyDamage(hz.damage);
                        if (applied.ok && applied.value.died) { this.onPlayerDeath(); }
                        died = true;
                        break;
                    }
                }
            }
            if (died && !this.dead) { this.onPlayerDeath(); }
        }

        // 阶段 7：拾取
        this.pickups.update(dt);

        // 阶段 8：资源/冷却/切换锁/FX
        resourceSystem.tick(dt);
        skillService.tickCooldowns(dt);
        weaponService.tickSwitchLock(dt);
        this.fx.tick(dt);

        // 阶段 9：相机
        this.cameraRig.update(deltaMs);

        // 阶段 10：HUD + 计时
        this.hud.tick(dt);
        this.elapsedSec += dt;
        recordStore.addPlayTime(dt);

        if (this.gateway.justPressed('pause')) {
            emitEvent('game:requestPause', { reason: 'esc' });
        }
        if (this.gateway.justPressed('inventory')) {
            emitEvent('game:requestInventory', { open: true });
        }
        if (this.gateway.justPressed('skillTree')) {
            emitEvent('game:requestSkillTree', { open: true });
        }
    }

    shutdown(): void {
        offEvent('ui:overlay', this.onOverlay);
        offEvent('enemy:killed', this.onEnemyKilled);
        offEvent('player:damaged', this.onPlayerDamaged);
        sceneDirector.setActiveGameplay(null);
        this.combat.destroy();
        this.projectiles.destroy();
        this.enemies.destroy();
        this.fx.destroy();
        this.pickups.destroy();
    }
}
