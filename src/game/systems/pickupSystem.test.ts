import { describe, expect, it, vi } from 'vitest';
import { Geom, type Scene } from 'phaser';
import { PickupSystem } from './pickupSystem';
import type { LevelContext } from './levelLoader';
import type { PlayerController } from './playerController';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return { Geom: { Rectangle: require('../../../node_modules/phaser/src/geom/rectangle/Rectangle.js') }, Math: { Between: () => 0 }, Physics: {} };
});
vi.mock('../EventBus', async () => {
    const { EventEmitter } = await import('node:events');
    return { EventBus: new EventEmitter() };
});

function fixture(onGoal: () => boolean) {
    // 仅替代渲染和物理分配；触发区和终点熔断使用真实 PickupSystem。
    const scene = { physics: { add: {
        group: () => ({ add() {} }), collider() {},
        sprite: () => {
            const sprite = { setDepth() { return this; }, setScale() { return this; }, setVisible() { return this; }, setPosition() { return this; },
                body: { setCollideWorldBounds() {}, setSize() {}, setEnable() {}, setVelocity() {} } };
            return sprite;
        }
    } } } as unknown as Scene;
    const player = { sprite: { x: 5, y: 5 } } as PlayerController;
    const ctx = { levelId: '1-4', coinClusters: [], checkpoints: [], shards: [], chests: [], hazards: [], hints: [],
        goal: new Geom.Rectangle(0, 0, 20, 20) } as unknown as LevelContext;
    let chestOpens = 0;
    const pickups = new PickupSystem(scene, player, ctx, { onGoal, onCheckpoint() {}, onShard() {}, onChest() { chestOpens++; }, onHint() {} });
    return { pickups, player, ctx, chestOpens: () => chestOpens };
}

describe('PickupSystem 终点确认', () => {
    it('关卡拒绝通关时不熔断，条件满足后无需重新进入终点即可结算', () => {
        let allowed = false;
        let clears = 0;
        const { pickups } = fixture(() => { if (!allowed) { return false; } clears++; return true; });
        pickups.update(1 / 60);
        expect(pickups.goalReached).toBe(false);
        expect(clears).toBe(0);
        allowed = true;
        pickups.update(1 / 60);
        expect(pickups.goalReached).toBe(true);
        expect(clears).toBe(1);
        pickups.update(1 / 60);
        expect(clears).toBe(1);
    });

    it('离开终点后不误触发，返回时正常单次结算', () => {
        let clears = 0;
        const { pickups, player } = fixture(() => { clears++; return true; });
        player.sprite.x = 100;
        pickups.update(1 / 60);
        expect(clears).toBe(0);
        player.sprite.x = 5;
        pickups.update(1 / 60);
        pickups.update(1 / 60);
        expect(clears).toBe(1);
    });
});

describe('宝箱交互', () => {
    it('靠近不自动打开，按下交互键后只打开一次', () => {
        const f = fixture(() => false);
        f.ctx.chests.push({ id: 'chest_1', x: 5, y: 5 });
        f.pickups.update(1 / 60);
        expect(f.chestOpens()).toBe(0);
        f.pickups.update(1 / 60, true);
        f.pickups.update(1 / 60, true);
        expect(f.chestOpens()).toBe(1);
    });

    it('远处按键不打开宝箱，靠近后须再次按键', () => {
        const f = fixture(() => false);
        f.ctx.chests.push({ id: 'chest_1', x: 500, y: 5 });
        f.pickups.update(1 / 60, true);
        f.player.sprite.x = 500;
        f.pickups.update(1 / 60);
        expect(f.chestOpens()).toBe(0);
        f.pickups.update(1 / 60, true);
        expect(f.chestOpens()).toBe(1);
    });
});
