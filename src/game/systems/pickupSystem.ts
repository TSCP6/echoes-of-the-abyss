/**
 * MOD-07 PickupSystem（Phaser 呈现层，管线阶段 7）—— FR-09 金币三阶段 + FR-11 触发区。
 * 金币：掉落/预置后 0.4 s 不可拾取 → 3.0 s 静止期 → 玩家 96 px 内以 300 px/s 磁吸；
 * 拾取 → EconomyService.addCoins（上限拒拾 + 提示，AT-33）+ "+N" 浮动文本（场景内直调 6.2.3）。
 * 触发区（检查点/碎片/宝箱/终点/hints）：矩形重叠检测，幂等/单次熔断。
 * 对象池（DD-13）：金币池 64，场景 create 一次分配，shutdown 随场景销毁（NFR-04）。
 */
import { Geom, Math as PhaserMath, Physics, type Scene } from 'phaser';
import type { LevelContext } from './levelLoader';
import type { PlayerController } from './playerController';
import { economyService } from '../domain/economyService';
import { progressService } from '../domain/progressService';

const UNPICKABLE_SEC = 0.4;
const STILL_SEC = 3.0;
const MAGNET_PX = 96;
const MAGNET_SPEED = 300;
const COIN_POOL = 64;

interface Coin {
    sprite: Physics.Arcade.Sprite;
    age: number;
    active: boolean;
}

export interface PickupEvents {
    onCheckpoint: (id: string) => void;
    onShard: (key: string) => void;
    onChest: (id: string) => void;
    /** 返回 true 才接受本次通关；Boss 存活等条件未满足时不熔断。 */
    onGoal: () => boolean;
    onHint: (id: string, action: string) => void;
}

export class PickupSystem {
    private coins: Coin[] = [];
    private coinGroup: Physics.Arcade.Group;
    private activatedCheckpoints = new Set<string>();
    private openedChests = new Set<string>();
    private goalFired = false;
    private firedHints = new Set<string>();
    /** TutorialDirector / 拾取音效钩子（场景内直调，6.2.3） */
    onCoinPicked: (() => void) | null = null;
    onChestOpened: (() => void) | null = null;

    constructor(
        private scene: Scene,
        private player: PlayerController,
        private ctx: LevelContext,
        private events: PickupEvents
    ) {
        // 池预分配（DD-13）：统一 physics group，注册与碰撞层的单一 collider（金币落地）
        this.coinGroup = scene.physics.add.group({ allowGravity: true });
        for (let i = 0; i < COIN_POOL; i++) {
            const sprite = scene.physics.add.sprite(-9999, -9999, 'fruit_apple', 0);
            sprite.setDepth(5);
            sprite.setScale(0.5); // 64px 帧 → 32px 世界（2x 素材约定，DD-11）
            sprite.setVisible(false);
            (sprite.body as Physics.Arcade.Body).setCollideWorldBounds(false);
            (sprite.body as Physics.Arcade.Body).setSize(32, 32); // Arcade body 不随 setScale 自动缩放
            this.coinGroup.add(sprite);
            this.coins.push({ sprite, age: 0, active: false });
        }
        scene.physics.add.collider(this.coinGroup, ctx.collisionGroup);
        // 预置金币堆（FR-09 规则 5 的关卡采集点）
        for (const cluster of ctx.coinClusters) {
            this.spawnCoinBurst({ x: cluster.x, y: cluster.y }, cluster.count, true);
        }
    }

    /** enemy:killed 掉落入口（IF-M18）；preplaced = 关卡预置（跳过抛掷初速） */
    spawnCoinBurst(pos: { x: number; y: number }, count: number, preplaced = false): void {
        for (let i = 0; i < count; i++) {
            const coin = this.coins.find((c) => !c.active);
            if (coin === undefined) { return; } // 池耗尽：视觉降级不阻塞（DD-13）
            coin.active = true;
            coin.age = 0;
            coin.sprite.setVisible(true);
            coin.sprite.setPosition(pos.x + (i % 4) * 10 - 15, pos.y - Math.floor(i / 4) * 10);
            const body = coin.sprite.body as Physics.Arcade.Body;
            body.setEnable(true);
            if (preplaced) {
                body.setVelocity(0, 0);
                coin.age = UNPICKABLE_SEC + STILL_SEC; // 预置金币直接可磁吸
            } else {
                body.setVelocity(PhaserMath.Between(-60, 60), -200); // FR-09 规则 1
            }
        }
    }

    private floatText(x: number, y: number, text: string): void {
        const t = this.scene.add.text(x, y, text, { fontSize: '16px', color: '#ffe066' }).setDepth(30);
        this.scene.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 600, onComplete: () => t.destroy() });
    }

    /** 管线阶段 7（dt 单位 s） */
    update(dt: number): void {
        const px = this.player.sprite.x;
        const py = this.player.sprite.y;

        // 金币三阶段
        for (const coin of this.coins) {
            if (!coin.active) { continue; }
            coin.age += dt;
            const body = coin.sprite.body as Physics.Arcade.Body;
            // 掉入即死区销毁（FR-09 边界）
            for (const hz of this.ctx.hazards) {
                if (hz.contains(coin.sprite.x, coin.sprite.y)) {
                    coin.active = false;
                    coin.sprite.setVisible(false);
                    body.setEnable(false);
                    break;
                }
            }
            if (!coin.active) { continue; }
            if (coin.age > UNPICKABLE_SEC + STILL_SEC) {
                const dx = px - coin.sprite.x;
                const dy = py - coin.sprite.y;
                const dist = Math.hypot(dx, dy);
                if (dist < MAGNET_PX) {
                    body.setVelocity((dx / dist) * MAGNET_SPEED, (dy / dist) * MAGNET_SPEED);
                }
                if (dist < 20) {
                    const r = economyService.addCoins(1);
                    if (r.ok && !r.value.rejected) {
                        this.floatText(coin.sprite.x, coin.sprite.y - 10, '+1');
                        this.onCoinPicked?.();
                    } else {
                        this.floatText(coin.sprite.x, coin.sprite.y - 10, '金币已满');
                    }
                    coin.active = false;
                    coin.sprite.setVisible(false);
                    body.setEnable(false);
                }
            }
        }

        // 检查点（FR-11 规则 4：触碰激活，本次尝试内保持）
        for (const cp of this.ctx.checkpoints) {
            if (this.activatedCheckpoints.has(cp.id)) { continue; }
            if (Math.abs(px - cp.x) < 40 && Math.abs(py - cp.y) < 60) {
                this.activatedCheckpoints.add(cp.id);
                progressService.setLastCheckpoint(cp.id);
                this.events.onCheckpoint(cp.id);
            }
        }
        // 碎片（幂等采集，跨死亡保持）
        for (const sh of this.ctx.shards) {
            if (progressService.isShardCollected(this.ctx.levelId, sh.id)) { continue; }
            if (Math.abs(px - sh.x) < 36 && Math.abs(py - sh.y) < 48) {
                progressService.collectShard(this.ctx.levelId, sh.id);
                this.floatText(sh.x, sh.y - 12, '回响碎片 +1 SKP');
                this.events.onShard(sh.id);
            }
        }
        // 宝箱（E 交互，本次尝试内保持开启）
        for (const ch of this.ctx.chests) {
            if (this.openedChests.has(ch.id)) { continue; }
            if (Math.abs(px - ch.x) < 44 && Math.abs(py - ch.y) < 56) {
                this.openedChests.add(ch.id);
                this.spawnCoinBurst({ x: ch.x, y: ch.y - 20 }, 12);
                this.events.onChest(ch.id);
                this.onChestOpened?.();
            }
        }
        // 终点（单次熔断，5.8 异常 2）
        if (!this.goalFired && this.ctx.goal.contains(px, py)) {
            this.goalFired = this.events.onGoal();
        }
        // 教学提示触发区（FR-17：进入即提示，整局一次）
        for (const hint of this.ctx.hints) {
            if (this.firedHints.has(hint.id)) { continue; }
            const rect = new Geom.Rectangle(hint.x, hint.y, hint.w, hint.h);
            if (rect.contains(px, py)) {
                this.firedHints.add(hint.id);
                this.events.onHint(hint.id, hint.action);
            }
        }
    }

    get checkpointsActive(): number { return this.activatedCheckpoints.size; }
    get goalReached(): boolean { return this.goalFired; }

    destroy(): void {
        for (const coin of this.coins) { coin.sprite.destroy(); }
        this.coins = [];
    }
}
