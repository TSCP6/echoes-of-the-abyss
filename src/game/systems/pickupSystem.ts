/**
 * MOD-07 PickupSystem（Phaser 呈现层，管线阶段 7）—— FR-09 金币悬浮拾取 + FR-11 触发区。
 * 金币不分配刚体：原地悬浮，接触即可拾取；生成 0.15 s 后，96 px 内以 300 px/s 磁吸；预置立即吸附。
 * 拾取 → EconomyService.addCoins（上限拒拾 + 提示，AT-33）+ "+N" 浮动文本（场景内直调 6.2.3）。
 * 触发区（检查点/碎片/宝箱/终点/hints）：矩形重叠检测，幂等/单次熔断。
 * 对象池（DD-13）：金币池 64，场景 create 一次分配，shutdown 随场景销毁（NFR-04）。
 */
import { Geom, type GameObjects, type Scene } from 'phaser';
import type { LevelContext } from './levelLoader';
import type { PlayerController } from './playerController';
import { economyService } from '../domain/economyService';
import { progressService } from '../domain/progressService';
import { PICKUP_TEXTURES } from './pickupVisuals';

const MAGNET_DELAY_SEC = 0.15;
const MAGNET_PX = 96;
const MAGNET_SPEED = 300;
const COIN_POOL = 64;

interface Coin {
    sprite: GameObjects.Sprite;
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
        // 仅分配显示对象，不受重力、平台碰撞或刚体组重置影响。
        for (let i = 0; i < COIN_POOL; i++) {
            const sprite = scene.add.sprite(-9999, -9999, PICKUP_TEXTURES.coin);
            sprite.setDepth(5);
            sprite.setScale(0.5); // 64px 帧 → 32px 世界（2x 素材约定，DD-11）
            sprite.setVisible(false);
            this.coins.push({ sprite, age: 0, active: false });
        }
        // 预置金币堆（FR-09 规则 5 的关卡采集点）
        for (const cluster of ctx.coinClusters) {
            this.spawnCoinBurst({ x: cluster.x, y: cluster.y }, cluster.count, true);
        }
    }

    /** enemy:killed 掉落入口（IF-M18）；preplaced = 预置金币立即允许吸附。 */
    spawnCoinBurst(pos: { x: number; y: number }, count: number, preplaced = false): void {
        for (let i = 0; i < count; i++) {
            const coin = this.coins.find((c) => !c.active);
            if (coin === undefined) { return; } // 池耗尽：视觉降级不阻塞（DD-13）
            coin.active = true;
            coin.age = 0;
            coin.sprite.setVisible(true);
            coin.sprite.setPosition(pos.x + (i % 4) * 10 - 15, pos.y - Math.floor(i / 4) * 10);
            if (preplaced) { coin.age = MAGNET_DELAY_SEC; }
        }
    }

    private floatText(x: number, y: number, text: string, color = '#ffe066'): void {
        const t = this.scene.add.text(x, y, text, { fontSize: '16px', color, stroke: '#101827', strokeThickness: 3 }).setDepth(30);
        this.scene.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 600, onComplete: () => t.destroy() });
    }

    /** 管线阶段 7（dt 单位 s） */
    update(dt: number, interactPressed = false): void {
        const px = this.player.sprite.x;
        const py = this.player.sprite.y;

        // 接触拾取与掉落动画分开：散开期也可立即捡起。
        for (const coin of this.coins) {
            if (!coin.active) { continue; }
            coin.age += dt;
            // 掉入即死区销毁（FR-09 边界）
            for (const hz of this.ctx.hazards) {
                if (hz.contains(coin.sprite.x, coin.sprite.y)) {
                    coin.active = false;
                    coin.sprite.setVisible(false);
                    break;
                }
            }
            if (!coin.active) { continue; }
            const dx = px - coin.sprite.x;
            const dy = py - coin.sprite.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 20) {
                const r = economyService.addCoins(1);
                if (r.ok && !r.value.rejected) {
                    this.floatText(coin.sprite.x, coin.sprite.y - 10, '+1 金币');
                    this.onCoinPicked?.();
                } else {
                    this.floatText(coin.sprite.x, coin.sprite.y - 10, '金币已满');
                }
                coin.active = false;
                coin.sprite.setVisible(false);
            } else if (coin.age >= MAGNET_DELAY_SEC && dist < MAGNET_PX) {
                // 位移截断到目标，避免低帧率越过玩家；范围外不会残留刚体速度。
                const step = Math.min(dist, MAGNET_SPEED * dt);
                coin.sprite.setPosition(coin.sprite.x + dx / dist * step, coin.sprite.y + dy / dist * step);
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
                this.floatText(sh.x, sh.y - 12, '回响碎片 +1 技能点', '#9ff7ff');
                this.events.onShard(sh.id);
            }
        }
        // 宝箱（E 交互，本次尝试内保持开启）
        for (const ch of this.ctx.chests) {
            if (!interactPressed) { break; }
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
