/**
 * LevelScene（ARCH-17，由模板 Game 改造）—— 承载 12 关（FR-11）。
 * ARCH-13 帧管线（Phaser 4：PRE_STEP 物理积分 → update → POST_STEP → render）：
 * update 内固定次序：1 输入采集 → 2 玩家 → 5 战斗(P2) → 6 敌人(P2) → 7 拾取 → 8 资源结算 → 9 相机 → 10 HUD 聚合。
 * 阶段 4 物理求解由引擎在帧首 PRE_STEP 完成（玩家速度在上一帧末设定，本帧积分），K7 次序一致。
 * 进关：scene.start('Level', { levelId })；LevelLoader 校验失败 → EX-03 回主菜单。
 * 死亡：player:died → 0.8 s 停顿 → 检查点重生（FR-11 规则 7，敌人重置 P2）。
 * 终点：level:cleared（IF-E06）→ 结算（P3 ResultView；M1 解锁下一关 + 回主菜单）。
 */
import { Geom, Physics, Scene, Tilemaps } from 'phaser';
import { LevelLoader, type LevelContext } from '../systems/levelLoader';
import { PlayerController } from '../systems/playerController';
import { CameraRig } from '../systems/cameraRig';
import { InputGateway } from '../systems/inputGateway';
import { PickupSystem } from '../systems/pickupSystem';
import { sceneDirector } from '../systems/sceneDirector';
import { hudViewModel } from '../domain/hudViewModel';
import { resourceSystem } from '../domain/resourceSystem';
import { progressService } from '../domain/progressService';
import { EventBus } from '../EventBus';
import { emitEvent, onEvent, offEvent } from '../events';

const DEATH_PAUSE_MS = 800; // FR-16 规则 3：死亡 6 帧 + 0.8s 停顿

export class LevelScene extends Scene {
    private levelId = '1-1';
    private ctx!: LevelContext;
    private gateway!: InputGateway; // 不命名 input：避免遮蔽 Scene.input
    private player!: PlayerController;
    private cameraRig!: CameraRig;
    private pickups!: PickupSystem;
    private hud = hudViewModel;
    private elapsedSec = 0;
    private kills = 0;
    private dead = false;
    private activeCheckpoint = 'cp_1';
    private overlayOpen = false;
    private onOverlay = (p: { name: string; open: boolean }): void => {
        if (!sceneDirector.isGameplay(this)) { return; } // 只响应持令牌实例（防旧暂停实例被误恢复）
        this.overlayOpen = p.open;
        if (p.open) { this.scene.pause(); } else { this.scene.resume(); }
    };
    constructor() { super('Level'); }

    init(data: { levelId?: string }): void {
        this.levelId = data.levelId ?? '1-1';
    }

    create(): void {
        const loader = new LevelLoader(this);
        const result = loader.load(this.levelId);
        if (!result.ok) {
            // EX-03：地图/资源失败 → 回主菜单（M1 简化；P3 加载页重试）
            console.error(`[LevelScene] ${result.code}: ${result.message}`);
            sceneDirector.gotoMenu();
            return;
        }
        this.ctx = result.value;
        progressService.setCurrentLevel(this.levelId);

        // 背景平铺（视差 0.2）
        const bg = this.add.tileSprite(512, 384, 1024, 768, 'bg_green');
        bg.setScrollFactor(0.2);
        bg.setDepth(-20);

        // 玩家与输入
        this.gateway = new InputGateway(this);
        this.player = new PlayerController(this, this.gateway);
        this.player.teleportTo(this.ctx.spawn.x, this.ctx.spawn.y);

        // 物理碰撞：实体层 + 单向平台（7.2.2 容差回调）
        this.physics.add.collider(this.player.sprite, this.ctx.collisionGroup);
        this.physics.add.collider(
            this.player.sprite, this.ctx.onewayGroup, undefined,
            (p, t) => {
                // 命名 const 窄化：collider 回调签名为宽联合，此处 p 恒为玩家 Sprite、t 恒为瓦片
                const sprite = p as Physics.Arcade.Sprite;
                const body = sprite.body as Physics.Arcade.Body;
                const tile = t as Tilemaps.Tile;
                return loader.onewayProcess(body, tile);
            },
            this
        );

        // 相机
        this.cameraRig = new CameraRig(this, this.player);
        this.cameraRig.setMapSize(this.ctx.mapWidth, this.ctx.mapHeight);

        // 检查点旗 / 终点门 / 碎片视觉
        for (const cp of this.ctx.checkpoints) {
            this.add.sprite(cp.x, cp.y, 'checkpoint_flag', 0).setScale(0.5).setDepth(4);
        }
        this.add.sprite(this.ctx.goal.x + 32, this.ctx.goal.y + 48, 'goal_idle', 0).setScale(0.5).setDepth(4);
        for (const sh of this.ctx.shards) {
            if (!progressService.isShardCollected(this.levelId, sh.id)) {
                this.add.sprite(sh.x, sh.y, 'fruit_apple', 0).setScale(0.5).setDepth(4).setName(`shard_${sh.id}`);
            }
        }

        // 拾取系统
        this.pickups = new PickupSystem(this, this.player, this.ctx, {
            onCheckpoint: (id) => {
                this.activeCheckpoint = id;
                this.hud.setContext(this.levelId, this.pickups.checkpointsActive);
            },
            onShard: (key) => {
                this.children.getByName(`shard_${key}`)?.destroy();
            },
            onChest: () => { /* P2 音效 */ },
            onGoal: () => this.onGoalReached(),
            onHint: (id, action) => {
                emitEvent('tutorial:hint', { hintId: id, text: this.hintText(action) });
            }
        });

        // HUD 上下文
        this.hud.setContext(this.levelId, 0);
        this.elapsedSec = 0;
        this.kills = 0;
        this.dead = false;
        onEvent('ui:overlay', this.onOverlay);
        sceneDirector.setActiveGameplay(this);

        // 相机淡入（与 SceneDirector 淡出对称，FR-12 规则 5）
        this.cameras.main.fadeIn(400, 0, 0, 0);
        // IF-E01（模板既有例外）：场景就绪通知 Vue
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

    private onGoalReached(): void {
        const shards = this.ctx.shards.filter((s) => progressService.isShardCollected(this.levelId, s.id)).length;
        progressService.completeLevel(this.levelId);
        emitEvent('level:cleared', {
            levelId: this.levelId,
            timeSec: Math.round(this.elapsedSec * 10) / 10,
            kills: this.kills,
            shards,
            coins: 0 // P3：结算本关获得金币
        });
        // M1：回主菜单（Vue 层订阅 level:cleared 显示结算信息）
        sceneDirector.gotoMenu();
    }

    private respawn(): void {
        const cp = this.ctx.checkpoints.find((c) => c.id === this.activeCheckpoint) ?? this.ctx.checkpoints[0];
        resourceSystem.refill(); // FR-11 规则 7：HP/SP 回满
        this.player.teleportTo(cp.x, cp.y);
        this.dead = false;
        this.hud.setContext(this.levelId, this.pickups.checkpointsActive);
    }

    update(_time: number, deltaMs: number): void {
        const dt = deltaMs / 1000;
        if (this.overlayOpen) { return; } // FR-15 规则 8 双保险（scene.pause 已停 update）

        // 阶段 1：输入采集
        this.gateway.poll();

        // 阶段 2：玩家状态机与运动
        this.player.update(deltaMs);

        if (!this.dead) {
            const b = this.player.body;
            const pb = new Geom.Rectangle(b.x, b.y, b.width, b.height);
            for (const hz of this.ctx.hazards) {
                if (Geom.Rectangle.Overlaps(pb, hz)) {
                    this.dead = true;
                    this.player.die(this.activeCheckpoint, this.levelId);
                    this.time.delayedCall(DEATH_PAUSE_MS, () => this.respawn());
                    break;
                }
            }
        }

        // 阶段 7：拾取与触发区
        this.pickups.update(dt);

        // 阶段 8：资源结算（SP 脱战回复等）
        resourceSystem.tick(dt);

        // 阶段 9：相机
        this.cameraRig.update(deltaMs);

        // 阶段 10：HUD 聚合（10 Hz）+ 计时
        this.hud.tick(dt);
        this.elapsedSec += dt;

        // Esc → 暂停（Vue 层订阅 game:requestPause 打开 PauseOverlay）
        if (this.gateway.justPressed('pause')) {
            emitEvent('game:requestPause', { reason: 'esc' });
        }
    }

    shutdown(): void {
        offEvent('ui:overlay', this.onOverlay);
        sceneDirector.setActiveGameplay(null);
        this.pickups.destroy();
    }
}
