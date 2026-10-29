/**
 * LevelScene（ARCH-17）—— 承载 12 关（FR-11）含 Boss 战（FR-03 规则 4）。
 * ARCH-13 帧管线：1 输入 → 2 玩家 → 3 弹丸/技能 → 5 战斗 → 6 敌人 → 7 拾取 → 8 资源 → 9 相机 → 10 HUD。
 * 死亡：player:died → 0.8 s → 检查点重生 + 敌人重置 + 存档写入点（FR-11 规则 7 / FR-13）。
 * 终点：level:cleared → RecordStore.submitResult + ProgressService 首通 SKP + 存档写入点（FR-13 规则 2）。
 * Boss：阶段切换锁相机（FR-02 规则 5）+ HUD 血条（FR-14 规则 5）；召唤/危险区技能经 EnemyEvents。
 */
import { Geom, Scene, Scenes, Tilemaps } from 'phaser';
import { LevelLoader, type LevelContext } from '../systems/levelLoader';
import { PlayerController } from '../systems/playerController';
import { PlayerCombatFx } from '../systems/playerCombatFx';
import { CameraRig } from '../systems/cameraRig';
import { InputGateway } from '../systems/inputGateway';
import { PickupSystem } from '../systems/pickupSystem';
import { EnemyAI, type ArenaHazard } from '../systems/enemyAI';
import { ProjectilePool } from '../systems/projectilePool';
import { CombatResolver } from '../systems/combatResolver';
import { NormalEnemyFx } from '../systems/normalEnemyFx';
import { WorldFxLayer } from '../systems/worldFxLayer';
import { sceneDirector } from '../systems/sceneDirector';
import { hudViewModel } from '../domain/hudViewModel';
import { resourceSystem } from '../domain/resourceSystem';
import { economyService } from '../domain/economyService';
import { enemyRewardItems, grantChestReward } from '../domain/rewardService';
import { ENEMY_MATERIAL_COUNTS, FIRST_CLEAR_COINS } from '../data/rewardDefaults';
import { progressService } from '../domain/progressService';
import { weaponService } from '../domain/weaponService';
import { skillService } from '../domain/skillService';
import { recordStore } from '../domain/recordStore';
import { saveSystem } from '../domain/saveSystem';
import { ConfigRegistry } from '../domain/configRegistry';
import { EventBus } from '../EventBus';
import { emitEvent, onEvent, offEvent } from '../events';
import { audioDirector } from '../systems/audioDirector';
import { regionBgm } from '../data/audioCatalog';
import { warnThrottled } from '../domain/warn';
import { TutorialDirector } from '../systems/tutorialDirector';
import { createRegionBackdrop } from '../systems/regionBackdrop';
import { LevelDeviceSystem } from '../systems/levelDeviceSystem';
import { createLevelScenery } from '../systems/levelScenery';
import { bindViewportLayout } from '../systems/viewportLayout';
import { BossDangerFx } from '../systems/bossDangerFx';
import { bossPalette, bossSummonPositions } from '../systems/bossSkillPresentation';
import { BossArena } from '../systems/bossArena';
import { BossAbilitySystem } from '../systems/bossAbilitySystem';
import { PICKUP_TEXTURES } from '../systems/pickupVisuals';

const DEATH_PAUSE_MS = 800; // FR-16 规则 3

export class LevelScene extends Scene {
    private levelId = '1-1';
    private ctx!: LevelContext;
    private gateway!: InputGateway;
    private player!: PlayerController;
    private playerCombatFx!: PlayerCombatFx;
    private cameraRig!: CameraRig;
    private pickups!: PickupSystem;
    private enemies!: EnemyAI;
    private normalEnemyFx!: NormalEnemyFx;
    private projectiles!: ProjectilePool;
    private combat!: CombatResolver;
    private fx!: WorldFxLayer;
    private dangerFx!: BossDangerFx;
    private arena: BossArena | null = null;
    private bossAbilities: BossAbilitySystem | null = null;
    private devices: LevelDeviceSystem | null = null;
    private hud = hudViewModel;
    private elapsedSec = 0;
    private kills = 0;
    private earnedCoins = 0;
    private resumeRequested = false;
    private dead = false;
    private activeCheckpoint: string | null = null;
    private overlayOpen = false;
    private hazards: ArenaHazard[] = [];
    private tutorial: TutorialDirector | null = null;
    private bossWoken = false;
    /** create 完成前置位；preload 窗口期（同关重启）update 跳过管线（防旧 player/combat 空引用，EXD-4） */
    private ready = false;
    /** TT-06（DEV）：管线阶段打点，超预算 console.warn（生产 tree-shake） */
    private stageMarks: number[] = [];
    private stageWarnAt = 0;
    private mark(): void {
        if (!import.meta.env.DEV) { return; }
        this.stageMarks.push(performance.now());
    }
    private stageReport(): void {
        if (!import.meta.env.DEV || this.stageMarks.length < 2) { this.stageMarks.length = 0; return; }
        const names = ['input', 'player', 'projectiles', 'combat', 'enemies', 'hazards', 'pickups', 'resources', 'camera', 'hud'];
        const budgets = [2, 2, 1, 2, 3, 1, 1, 1, 2, 1]; // ms 阶段预算（TT-06 设计参数）
        const now = performance.now();
        if (now - this.stageWarnAt < 5000) { this.stageMarks.length = 0; return; }
        for (let i = 1; i < this.stageMarks.length; i++) {
            const cost = this.stageMarks[i] - (this.stageMarks[i - 1] ?? 0);
            const b = budgets[i - 1] ?? 2;
            if (cost > b) {
                this.stageWarnAt = now;
                console.warn(`[TT-06] 管线阶段 ${names[i - 1] ?? i} 超预算：${cost.toFixed(2)} ms > ${b} ms`);
            }
        }
        this.stageMarks.length = 0; // 每帧重置（NF-04 零累积）
    }
    private ex11Count = 0;
    /** 未激活检查点时使用本关出生点，不提前解锁后续检查点。 */
    private respawnPoint(): { x: number; y: number } {
        return this.ctx.checkpoints.find((c) => c.id === this.activeCheckpoint) ?? this.ctx.spawn;
    }

    /** EX-11：掉出地图（y > 地图高 + 512）→ 返回已激活检查点或出生点，不判死亡不扣金币；连续 3 次警告 */
    private ex11Rescue(): void {
        this.ex11Count += 1;
        if (this.ex11Count >= 3) {
            warnThrottled(`ex11-${this.levelId}`, `关卡 ${this.levelId} 连续掉出地图 ${this.ex11Count} 次`);
        }
        const point = this.respawnPoint();
        this.cameras.main.fadeOut(150, 0, 0, 0);
        this.player.teleportTo(point.x, point.y);
        this.cameras.main.fadeIn(150, 0, 0, 0);
    }
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
    private onEnemyKilled = (p: { enemyId: string; coins: number; position: { x: number; y: number }; rewardKey?: string | null }): void => {
        if (p.enemyId === this.ctx.bossId) { this.playRegionMusic(); }
        this.kills += 1;
        recordStore.addKill();
        resourceSystem.notifyKill(); // FR-06 规则 5
        // 召唤物无奖励；地图敌人同轮只认领一次，死亡/重进/续关不刷新。
        if (!p.rewardKey || !progressService.claimRunReward(this.levelId, p.rewardKey)) { return; }
        saveSystem.markDirty(); saveSystem.queueWrite();
        this.pickups.spawnCoinBurst(p.position, p.coins); // FR-09 掉落
        const guaranteed = ENEMY_MATERIAL_COUNTS[p.enemyId] ?? 0;
        if (guaranteed > 0) {
            economyService.addMaterial('itm_relic_shard', guaranteed);
            this.fx.message(p.position.x, p.position.y - 48, `强化残片 +${guaranteed}`);
        }
        for (const item of enemyRewardItems(p.enemyId, Math.random)) {
            this.pickups.spawnItemDrop(p.position, item.itemId, item.count);
        }
    };

    /** NF-03：地图按关懒加载（进关时 load，不随首屏） */
    preload(): void {
        this.load.setPath('assets');
        this.load.tilemapTiledJSON(`map_${this.levelId}`, `levels/${this.levelId}.json`);
    }

    constructor() { super('Level'); }

    init(data: { levelId?: string; resume?: boolean }): void {
        this.levelId = data.levelId ?? '1-1';
        this.resumeRequested = data.resume === true;
        this.earnedCoins = 0;
        this.ready = false; // 重建期旧管线停摆（preload 窗口期 update 跳过）
        this.overlayOpen = false;
        this.activeCheckpoint = null;
        this.bossWoken = false;
        this.ex11Count = 0;
        this.stageMarks.length = 0;
    }
    create(): void {
        this.events.once(Scenes.Events.SHUTDOWN, this.shutdown, this);
        const loader = new LevelLoader(this);
        const result = loader.load(this.levelId);
        if (!result.ok) {
            console.error(`[LevelScene] ${result.code}: ${result.message}`);
            sceneDirector.gotoMenu();
            return;
        }
        this.ctx = result.value;
        this.activeCheckpoint = progressService.beginLevel(this.levelId, this.resumeRequested, this.ctx.checkpoints.map(c => c.id));

        const regionId = ConfigRegistry.levels().find(l => l.id === this.levelId)!.sceneId;
        createRegionBackdrop(this, regionId === 2 ? 2 : regionId === 3 ? 3 : 1,
            Number(this.levelId.split('-')[1]) - 1);
        createLevelScenery(this, this.ctx, regionId === 2 ? 2 : regionId === 3 ? 3 : 1);
        const title = this.add.text(0, 150, `${this.levelId}  ${this.ctx.title}`, {
            fontSize: '28px', color: '#f4e8c3', stroke: '#142130', strokeThickness: 5
        }).setOrigin(0.5).setScrollFactor(0).setDepth(55);
        const subtitle = this.add.text(0, 190, this.ctx.subtitle, {
            fontSize: '16px', color: '#d0dfdf', stroke: '#142130', strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(55);
        bindViewportLayout(this, (width) => { title.setX(width / 2); subtitle.setX(width / 2); });
        this.tweens.add({ targets: [title, subtitle], alpha: 0, delay: 2800, duration: 700 });

        this.gateway = new InputGateway(this);
        this.player = new PlayerController(this, this.gateway);
        const start = this.respawnPoint();
        this.player.teleportTo(start.x, start.y);
        if (this.resumeRequested || resourceSystem.getSnapshot().hp <= 0) { resourceSystem.refill(); }
        this.devices = new LevelDeviceSystem(this, this.player, this.ctx.devices);

        this.cameraRig = new CameraRig(this, this.player);
        this.cameraRig.setMapSize(this.ctx.mapWidth, this.ctx.mapHeight);
        this.arena = this.ctx.bossArena === null ? null : new BossArena(this, this.ctx.bossArena, this.ctx.mapHeight);

        this.physics.add.collider(this.player.sprite, this.ctx.collisionGroup);
        this.physics.add.collider(
            this.player.sprite, this.ctx.onewayGroup, undefined,
            (p, t) => {
                const tile = t as Tilemaps.Tile;
                if (!this.player.canCollideOneway(tile.pixelY)) { return false; }
                const separate = loader.onewayProcess((p as { body: Phaser.Physics.Arcade.Body }).body, tile);
                if (separate) { this.player.noteOnewaySupport(tile.pixelY, tile.height); }
                return separate;
            },
            this
        );
        const collisionLayer = this.ctx.collisionGroup;
        const groundProbe = (x: number, y: number): boolean => {
            const tile = (collisionLayer as Tilemaps.TilemapLayer).getTileAtWorldXY(x, y, true);
            return tile !== null && tile.index > 0;
        };

        this.fx = new WorldFxLayer(this);
        this.dangerFx = new BossDangerFx(this);
        this.enemies = new EnemyAI(this, this.ctx, this.player, groundProbe);
        this.normalEnemyFx = new NormalEnemyFx(this);
        this.projectiles = new ProjectilePool(this, this.ctx);
        this.enemies.projectiles = this.projectiles;
        this.enemies.events = {
            onBossPhase: (enemy, phaseIndex) => {
                this.bossAbilities?.reset();
                // FR-02 规则 5：Boss 战锁相机至场地；FR-14 规则 5 血条由每帧 setBossBar 驱动
                if (this.ctx.bossArena !== null) {
                    this.arena?.activate([this.player.body, enemy.body]);
                    this.cameraRig.lockTo(this.ctx.bossArena);
                }
                audioDirector.setBossPhase(phaseIndex); // FR-16 规则 1：紧张变体
            },
            onBossAttackBegan: (enemy, attack) => { if (!this.dead) { this.bossAbilities?.begin(enemy, attack); } },
            onBossSkill: (enemy, kind, params) => {
                if (kind === 'summon') {
                    const count = Math.floor(params.count ?? 2);
                    const ref = params.enemyRef ?? 0;
                    const defIds = ['enm_patrol', 'enm_chaser', 'enm_flyer'];
                    const defId = defIds[Math.min(ref, defIds.length - 1)] as string;
                    const positions = bossSummonPositions(enemy.sprite.x, enemy.sprite.y, count);
                    this.dangerFx.summonBurst(positions, enemy.def.id);
                    for (const pos of positions) {
                        const visualId = enemy.def.id === 'enm_boss_echo' ? 'echo_spirit'
                            : enemy.def.id === 'enm_boss_spider' ? 'spiderling' : defId;
                        this.enemies.summonAt(pos.x, pos.y, defId, visualId);
                    }
                } else if (kind === 'arenaHazard') {
                    const count = Math.floor(params.count ?? 3);
                    const dur = params.durationSec ?? 2;
                    for (let i = 0; i < count; i++) {
                        const hx = this.player.sprite.x + (i - (count - 1) / 2) * 96;
                        const layer = this.ctx.collisionGroup as Tilemaps.TilemapLayer;
                        let floorY = this.player.body.bottom;
                        for (let y = floorY; y < this.ctx.mapHeight; y += 16) {
                            const tile = layer.getTileAtWorldXY(hx, y, true);
                            if (tile !== null && tile.index > 0) { floorY = tile.getTop(); break; }
                        }
                        this.hazards.push({
                            rect: new Geom.Rectangle(hx - 32, floorY - 48, 64, 48),
                            startsAtSec: this.elapsedSec + 0.85,
                            untilSec: this.elapsedSec + 0.85 + dur,
                            damage: params.damage ?? 14,
                            sourceId: enemy.def.id
                        });
                    }
                }
            }
        };
        this.combat = new CombatResolver(this, this.player, this.enemies, this.projectiles, this.fx);
        this.playerCombatFx = new PlayerCombatFx(this, this.player);
        this.combat.onWeaponVisual = (def, rect, skillId) => {
            this.playerCombatFx.weapon(def, rect);
            if (skillId === undefined) { audioDirector.playWeapon(def.id); }
        };
        this.bossAbilities = this.ctx.bossArena === null ? null
            : new BossAbilitySystem(this, this.ctx, this.enemies, this.player, this.combat);
        this.combat.onPlayerDied = () => this.onPlayerDeath();
        this.combat.onEnemyHit = () => audioDirector.playSfx('hit_melee'); // AT-56 命中音效
        // 音色由已接受的真实武器动作触发；TutorialDirector 继续独立监听 onAttackBegan。
        this.combat.onAttackRejected = (message) => {
            this.fx.message(this.player.sprite.x - 32, this.player.sprite.y - 48, message);
            audioDirector.playSfx('ui_error');
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
                this.add.sprite(sh.x, sh.y, PICKUP_TEXTURES.skillShard).setScale(0.5).setDepth(4).setName(`shard_${sh.id}`);
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
            onChest: (id) => {
                const reward = grantChestReward(this.levelId, id);
                this.earnedCoins += reward.coins;
                this.fx.message(this.player.sprite.x, this.player.sprite.y - 48,
                    `金币 +${reward.coins} · 强化残片 +${reward.materials.itm_relic_shard ?? 0}`);
                audioDirector.playSfx('pickup_item');
            },
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
        this.pickups.onCoinPicked = (amount) => { this.earnedCoins += amount; prevCoin?.(amount); audioDirector.playSfx('coin'); };
        const prevChest = this.pickups.onChestOpened;
        this.pickups.onChestOpened = () => { prevChest?.(); audioDirector.playSfx('buy'); };
        this.playRegionMusic();
        onEvent('player:damaged', this.onPlayerDamaged);
        onEvent('skill:unlocked', this.onSkillUnlocked);

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
            jump: 'Space 跳跃（短按控制高度）；S / ↓ + 跳跃可下穿单向平台',
            attack: 'J / 左键 主手攻击；K / 右键 副手攻击（远程消耗弹药）',
            pickup: '金色圆币可在营地购物；青色晶体增加技能点（Y 学习）',
            interact: 'E 交互（宝箱/传送门）'
        };
        return map[action] ?? action;
    }

    /** 技能释放（FR-07 规则 4/6）：决策与执行分离（4.3.5） */
    private tryCastSlot(slot: 0 | 1 | 2 | 3): void {
        const id = skillService.getLoadout()[slot];
        if (id === null) { this.combat.onAttackRejected?.(`技能 ${slot + 1} 未绑定，请按 Y 学习并绑定`); return; }
        const equipped = weaponService.getEquippedDefs();
        const rangedHand = equipped.main?.type === 'ranged' ? 'main' : equipped.sub?.type === 'ranged' ? 'sub' : null;
        const def = rangedHand === null ? null : equipped[rangedHand];
        if (ConfigRegistry.skills()[id]?.effect.projectileCount !== undefined && def === null) {
            this.combat.onAttackRejected?.('此技能需要主手或副手装备远程武器'); return;
        }
        const decision = skillService.tryCast(id);
        if (!decision.ok) { this.combat.onAttackRejected?.(decision.message); return; }
        const p = this.player.getMotionState();
        const ef = decision.value.effect;
        this.playerCombatFx.skill(id, ef);
        audioDirector.playSkill(id); // 一次施放只响一次，齐射的多枚弹丸不叠加发射声。
        if (ef.damage !== undefined && ef.radius !== undefined) {
            this.combat.queueAreaDamage(p.x, p.y, ef.radius, ef.damage);
        } else if (ef.projectileCount !== undefined) {
            const count = ef.projectileCount;
            const spread = ef.spreadDeg ?? 15;
            for (let i = 0; i < count; i++) {
                const angle = (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
                if (def !== null && def.type === 'ranged') {
                    this.combat.spawnProjectile({ ...def, baseDamage: ef.damage ?? def.baseDamage }, angle, rangedHand ?? 'main', id);
                }
            }
        } else if (ef.dashDistance !== undefined) {
            this.player.iFrameUntil = this.time.now + (ef.invincibleMs ?? 200);
            this.player.startDash(ef.dashDistance, 200);
        } else if (ef.heal !== undefined) {
            resourceSystem.heal(ef.heal);
        }
    }

    private onSkillUnlocked = ({ skillId }: { skillId: string }): void => {
        if (ConfigRegistry.skills()[skillId]?.kind === 'passive') { this.playerCombatFx?.passive(skillId); }
    };

    private onPlayerDeath(): void {
        if (this.dead) { return; }
        this.dead = true;
        this.playRegionMusic();
        this.playerCombatFx.clear();
        this.bossAbilities?.reset();
        recordStore.addDeath();
        audioDirector.playSfx('death');
        this.player.die(this.activeCheckpoint ?? 'player_spawn', this.levelId);
        this.time.delayedCall(DEATH_PAUSE_MS, () => {
            this.respawn();
            saveSystem.markDirty(); // FR-13：死亡重生后写入点（检查点进度）
            saveSystem.queueWrite();
        });
    }

    private onGoalReached(): boolean {
        if (this.dead) { return false; }
        // 要求本关配置的 Boss 已被击败，不能把“未找到存活 Boss”当作获胜。
        if (this.ctx.bossId !== null && !this.enemies.getEntities().some((e) => e.def.id === this.ctx.bossId && e.dead)) {
            return false;
        }
        const shards = this.ctx.shards.filter((s) => progressService.isShardCollected(this.levelId, s.id)).length;
        audioDirector.playSfx('clear');
        const res = progressService.completeLevel(this.levelId);
        let firstClearCoins = 0;
        if (res.firstClear) {
            const before = economyService.getCoins();
            const chapter = ConfigRegistry.levels().find(l => l.id === this.levelId)!.sceneId;
            economyService.addCoins((this.ctx.bossId === null ? FIRST_CLEAR_COINS.normal : FIRST_CLEAR_COINS.boss) * chapter);
            firstClearCoins = economyService.getCoins() - before;
        }
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
            coins: economyService.getCoins(), earnedCoins: this.earnedCoins, firstClearCoins, lostCoins: 0
        });
        // FR-13 规则 2：关卡结算完成 = 写入点
        saveSystem.markDirty();
        saveSystem.queueWrite();
        sceneDirector.gotoMenu();
        return true;
    }

    /** Boss 唤醒（进入场地）→ 紧张 BGM 变体（FR-16 规则 1，订阅 BossBrain 的呈现侧落实） */
    private bossWakeCheck(): void {
        if (this.bossWoken) { return; }
        const boss = this.enemies.getBoss();
        if (boss === null || boss.sleeping || !boss.bossEngaged) { return; }
        this.bossWoken = true;
        audioDirector.setBossPhase(boss.phaseIndex);
    }

    private playRegionMusic(): void {
        const region = ConfigRegistry.levels().find(l => l.id === this.levelId)!.sceneId;
        audioDirector.playBgm(regionBgm(region));
    }

    private respawn(): void {
        this.playerCombatFx.clear();
        const point = this.respawnPoint();
        resourceSystem.refill(); // FR-11 规则 7
        this.arena?.release();
        this.bossAbilities?.reset();
        this.enemies.resetAll();
        this.projectiles.clear();
        this.dangerFx.clear();
        this.hazards = [];
        this.cameraRig.lockTo(null);
        this.devices?.reset();
        this.player.teleportTo(point.x, point.y);
        this.dead = false;
        this.hud.setContext(this.levelId, this.pickups.checkpointsActive);
    }

    update(_time: number, deltaMs: number): void {
        const dt = Math.min(deltaMs / 1000, 0.1); // 冻结/切回单帧巨型 dt 钳制（防物理爆冲，EX-05 精神）
        if (this.overlayOpen || !this.ready) { return; }

        // 阶段 1：输入
        this.mark(); // 帧起点
        this.gateway.poll();
        this.mark();

        // 攻击（FR-05）
        if (!this.dead && !weaponService.isSwitchLocked()) {
            if (this.gateway.justPressed('attackMain')) {
                this.combat.tryAttack('main');
            }
            if (this.gateway.justPressed('attackSub')) {
                this.combat.tryAttack('sub');
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
        this.bossAbilities?.preparePlayer();
        this.player.update(deltaMs);
        if (!this.dead) { this.devices?.update(dt, this.gateway.justPressed('interact')); }
        this.mark();
        this.tutorial?.update(dt); // MOD-09：move 完成判定 + 8 s 超时
        this.bossWakeCheck();

        // 阶段 3：弹丸
        this.projectiles.update(dt);
        this.mark();

        // 阶段 5：战斗
        if (!this.dead) { this.bossAbilities?.update(dt); }
        this.combat.update(dt);
        this.mark();

        // 阶段 6：敌人
        this.enemies.update(dt, this.time.now);
        this.normalEnemyFx.render(this.enemies.getEntities());
        this.mark();

        // Boss 血条（FR-14 规则 5）
        const boss = this.enemies.getBoss();
        if (this.arena?.isActive) {
            if (boss === null) {
                this.arena.release();
                this.cameraRig.lockTo(null);
            } else {
                this.arena.enforce([this.player.body, ...this.enemies.getEntities().filter((e) => !e.dead).map((e) => e.body)]);
            }
        }
        this.hud.setBossBar(boss !== null ? { name: bossPalette(boss.def.id).name, ratio: Math.max(0, boss.hp / boss.def.hp) } : null);

        // EX-11：掉出地图救援（先于即死区判定，避免穿透死亡面后误判死亡）
        if (!this.dead && this.player.sprite.y > this.ctx.mapHeight + 512) {
            this.ex11Rescue();
        }

        // 即死区 + Boss 危险区
        if (!this.dead) {
            const b = this.player.body;
            const pb = new Geom.Rectangle(b.x, b.y, b.width, b.height);
            let touchedDeathZone = false;
            for (const hz of this.ctx.hazards) {
                if (Geom.Rectangle.Overlaps(pb, hz)) { touchedDeathZone = true; break; }
            }
            if (touchedDeathZone) { this.onPlayerDeath(); }
            else {
                this.hazards = this.hazards.filter((h) => h.untilSec > this.elapsedSec);
                for (const hz of this.hazards) {
                    if (this.elapsedSec >= hz.startsAtSec && Geom.Rectangle.Overlaps(pb, hz.rect)) {
                        this.combat.damagePlayer(hz.damage, hz.sourceId, hz.rect.centerX);
                        break;
                    }
                }
            }
        }
        this.mark();

        // 阶段 7：拾取
        if (!this.dead) { this.pickups.update(dt, this.gateway.justPressed('interact')); }
        this.mark();

        // 阶段 8：资源/冷却/切换锁/FX
        resourceSystem.tick(dt);
        skillService.tickCooldowns(dt);
        weaponService.tickSwitchLock(dt);
        this.fx.tick(dt);
        this.playerCombatFx.setEquipped(weaponService.getEquippedDefs().main);
        this.playerCombatFx.update(dt);
        this.bossAbilities?.render();
        this.dangerFx.render(this.hazards, this.elapsedSec, this.enemies.getBoss());
        this.mark();

        // 阶段 9：相机
        this.cameraRig.update(deltaMs);
        this.mark();

        // 阶段 10：HUD + 计时
        this.hud.tick(dt);
        this.elapsedSec += dt;
        recordStore.addPlayTime(dt);
        this.mark();
        this.stageReport();

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
        this.ready = false;
        offEvent('ui:overlay', this.onOverlay);
        offEvent('enemy:killed', this.onEnemyKilled);
        offEvent('player:damaged', this.onPlayerDamaged);
        offEvent('skill:unlocked', this.onSkillUnlocked);
        if (sceneDirector.isGameplay(this)) { sceneDirector.setActiveGameplay(null); }
        // 首次建关失败时，部分系统可能尚未创建。
        this.bossAbilities?.destroy();
        this.bossAbilities = null;
        this.combat?.destroy();
        this.projectiles?.destroy();
        this.devices?.destroy();
        this.devices = null;
        this.arena?.destroy();
        this.arena = null;
        this.enemies?.destroy();
        this.normalEnemyFx?.destroy();
        this.fx?.destroy();
        this.playerCombatFx?.destroy();
        this.dangerFx?.destroy();
        this.pickups?.destroy();
        this.tutorial = null;
        this.hazards = [];
    }
}
