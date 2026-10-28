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
import { grantRewardItem } from '../domain/rewardService';
import { CHEST_MATERIAL_COUNTS } from '../data/rewardDefaults';
import { ConfigRegistry } from '../domain/configRegistry';
import { saveSystem } from '../domain/saveSystem';

const MAGNET_DELAY_SEC = 0.15;
const MAGNET_PX = 96;
const MAGNET_SPEED = 300;
const COIN_POOL = 64;

interface Coin {
    sprite: GameObjects.Sprite;
    age: number;
    active: boolean;
    value: number;
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
    private chestVisuals = new Map<string, { sprite: GameObjects.Sprite; label: GameObjects.Text }>();
    private itemDrops: Array<{ sprite: GameObjects.Sprite; label: GameObjects.Text; itemId: string; count: number; retry: number }> = [];
    private goalFired = false;
    private firedHints = new Set<string>();
    /** TutorialDirector / 拾取音效钩子（场景内直调，6.2.3） */
    onCoinPicked: ((amount: number) => void) | null = null;
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
            this.coins.push({ sprite, age: 0, active: false, value: 0 });
        }
        // 预置金币堆（FR-09 规则 5 的关卡采集点）
        for (const cluster of ctx.coinClusters) {
            this.spawnCoinBurst({ x: cluster.x, y: cluster.y }, cluster.count, true);
        }
    }

    /** enemy:killed 掉落入口（IF-M18）；preplaced = 预置金币立即允许吸附。 */
    spawnCoinBurst(pos: { x: number; y: number }, count: number, preplaced = false): void {
        if (!Number.isSafeInteger(count) || count <= 0 || this.coins.length === 0) { return; }
        // 金额与显示数量分离：每次最多 8 枚，Boss 奖励仍完整保存。
        const free = this.coins.filter((coin) => !coin.active);
        const visibleCount = Math.min(count, 8, free.length);
        if (visibleCount === 0) {
            // 池满时合并到距离掉落点最近的实体，避免吞掉后生成的奖励。
            const target = this.coins.reduce((nearest, coin) =>
                Math.hypot(coin.sprite.x - pos.x, coin.sprite.y - pos.y)
                    < Math.hypot(nearest.sprite.x - pos.x, nearest.sprite.y - pos.y) ? coin : nearest);
            target.value += count;
            return;
        }
        for (let i = 0; i < visibleCount; i++) {
            const coin = free[i];
            coin.active = true;
            coin.value = Math.floor(count / visibleCount) + (i < count % visibleCount ? 1 : 0);
            coin.age = preplaced ? MAGNET_DELAY_SEC : 0;
            coin.sprite.setVisible(true);
            coin.sprite.setPosition(pos.x + (i % 4) * 10 - 15, pos.y - Math.floor(i / 4) * 10);
        }
    }

    private floatText(x: number, y: number, text: string, color = '#ffe066'): void {
        const t = this.scene.add.text(x, y, text, { fontSize: '16px', color, stroke: '#101827', strokeThickness: 3 }).setDepth(30);
        this.scene.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 600, onComplete: () => t.destroy() });
    }

    spawnItemDrop(pos: { x: number; y: number }, itemId: string, count: number): void {
        const sprite = this.scene.add.sprite(pos.x, pos.y, PICKUP_TEXTURES.loot).setDepth(6);
        const label = this.scene.add.text(pos.x, pos.y - 24, `${ConfigRegistry.items()[itemId]?.name ?? itemId} ×${count}`,
            { fontSize: '14px', color: '#e9acff', stroke: '#101827', strokeThickness: 3 }).setDepth(30).setOrigin(0.5, 1);
        this.itemDrops.push({ sprite, label, itemId, count, retry: 0 });
    }

    /** 管线阶段 7（dt 单位 s） */
    update(dt: number, interactPressed = false): void {
        const px = this.player.sprite.x;
        const py = this.player.sprite.y;
        for (const item of [...this.itemDrops]) {
            item.retry = Math.max(0, item.retry - dt);
            if (item.retry > 0 || Math.hypot(item.sprite.x - px, item.sprite.y - py) > 64) { continue; }
            const granted = grantRewardItem(item.itemId, item.count);
            if (granted.added > 0) {
                this.floatText(item.sprite.x, item.sprite.y - 36, `${ConfigRegistry.items()[item.itemId]?.name} +${granted.added}`, '#e9acff');
                saveSystem.markDirty(); saveSystem.queueWrite();
            }
            item.count = granted.remaining;
            if (item.count === 0) {
                item.sprite.destroy(); item.label.destroy();
                this.itemDrops.splice(this.itemDrops.indexOf(item), 1);
            } else {
                item.label.setText(`背包已满 · ${ConfigRegistry.items()[item.itemId]?.name} ×${item.count}`);
                item.retry = 1;
            }
        }

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
                const before = economyService.getCoins();
                economyService.addCoins(coin.value);
                const added = economyService.getCoins() - before;
                if (added > 0) {
                    this.floatText(coin.sprite.x, coin.sprite.y - 10, `+${added} 金币`);
                    this.onCoinPicked?.(added);
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
        // 宝箱（E 交互，跨死亡、重进与存档保持开启）
        for (const ch of this.ctx.chests) {
            let visual = this.chestVisuals.get(ch.id);
            if (visual === undefined) {
                visual = { sprite: this.scene.add.sprite(ch.x, ch.y + 8, PICKUP_TEXTURES.chest).setDepth(6),
                    label: this.scene.add.text(ch.x, ch.y - 24, '', { fontSize: '14px', color: '#ffe0a1', stroke: '#101827', strokeThickness: 3 }).setDepth(30).setOrigin(0.5, 1) };
                this.chestVisuals.set(ch.id, visual);
            }
            const near = Math.abs(px - ch.x) < 44 && Math.abs(py - ch.y) < 56;
            const opened = progressService.isChestOpened(this.ctx.levelId, ch.id);
            const chapter = Number(this.ctx.levelId.split('-')[0]);
            const text = opened ? '已开启' : near ? `E 开启 · 强化残片 +${CHEST_MATERIAL_COUNTS[chapter as 1 | 2 | 3]}` : '补给宝箱';
            if (visual.label.text !== text) { visual.label.setText(text); }
            visual.sprite.setTexture(opened ? PICKUP_TEXTURES.chestOpen : PICKUP_TEXTURES.chest);
            if (interactPressed && near && !opened) {
                if (!progressService.openChest(this.ctx.levelId, ch.id)) { continue; }
                visual.sprite.setTexture(PICKUP_TEXTURES.chestOpen);
                visual.label.setText('已开启');
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
        for (const visual of this.chestVisuals.values()) { visual.sprite.destroy(); visual.label.destroy(); }
        this.chestVisuals.clear();
        for (const item of this.itemDrops) { item.sprite.destroy(); item.label.destroy(); }
        this.itemDrops = [];
        for (const coin of this.coins) { coin.sprite.destroy(); }
        this.coins = [];
    }
}
