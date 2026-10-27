import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Geom, type Scene } from 'phaser';
import { PickupSystem } from './pickupSystem';
import type { LevelContext } from './levelLoader';
import type { PlayerController } from './playerController';
import { economyService } from '../domain/economyService';

beforeEach(() => { economyService.fromSnapshot({ coins: 0, materials: {} }); });

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
    const sprites: { x: number; y: number; visible: boolean; body: { enabled: boolean; velocity: { x: number; y: number } } }[] = [];
    const scene = { add: { text: () => ({ setDepth() { return this; }, destroy() {} }) }, tweens: { add() {} }, physics: { add: {
        group: () => ({ add() {} }), collider() {},
        sprite: () => {
            const sprite = { x: -9999, y: -9999, visible: false,
                setDepth() { return this; }, setScale() { return this; },
                setVisible(visible: boolean) { this.visible = visible; return this; },
                setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
                body: { enabled: true, velocity: { x: 0, y: 0 }, setCollideWorldBounds() {}, setSize() {},
                    setEnable(enabled: boolean) { this.enabled = enabled; },
                    setVelocity(x: number, y: number) { this.velocity.x = x; this.velocity.y = y; } } };
            sprites.push(sprite);
            return sprite;
        }
    } } } as unknown as Scene;
    const player = { sprite: { x: 5, y: 5 } } as PlayerController;
    const ctx = { levelId: '1-4', coinClusters: [], checkpoints: [], shards: [], chests: [], hazards: [], hints: [],
        goal: new Geom.Rectangle(0, 0, 20, 20) } as unknown as LevelContext;
    let chestOpens = 0;
    const pickups = new PickupSystem(scene, player, ctx, { onGoal, onCheckpoint() {}, onShard() {}, onChest() { chestOpens++; }, onHint() {} });
    return { pickups, player, ctx, sprites, chestOpens: () => chestOpens };
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

describe('金币拾取时机', () => {
    it('刚掉落的金币接触玩家即拾取，且只记一次', () => {
        const f = fixture(() => false);
        let picked = 0;
        f.pickups.onCoinPicked = () => picked++;
        f.pickups.spawnCoinBurst({ x: 20, y: 5 }, 1); // 第一枚与玩家(5,5)重合。
        f.pickups.update(1 / 60);
        expect(economyService.getCoins()).toBe(1);
        expect(picked).toBe(1);
        expect(f.sprites[0].visible).toBe(false);
        expect(f.sprites[0].body.enabled).toBe(false);
        f.pickups.update(1 / 60);
        expect(economyService.getCoins()).toBe(1);
        expect(picked).toBe(1);
    });

    it('附近掉落只短暂散开，150ms后开始吸附，不必等待3.4秒', () => {
        const f = fixture(() => false);
        f.pickups.spawnCoinBurst({ x: 80, y: 5 }, 1);
        f.pickups.update(0.14);
        expect(f.sprites[0].body.velocity.x).toBe(0);
        f.pickups.update(0.02);
        expect(f.sprites[0].body.velocity.x).toBeLessThan(0);
        expect(economyService.getCoins()).toBe(0);
    });

    it('金币与人物中心重合时不产生NaN速度', () => {
        const f = fixture(() => false);
        f.pickups.spawnCoinBurst({ x: 20, y: 5 }, 1);
        f.pickups.update(4);
        expect(Number.isFinite(f.sprites[0].body.velocity.x)).toBe(true);
        expect(Number.isFinite(f.sprites[0].body.velocity.y)).toBe(true);
        expect(economyService.getCoins()).toBe(1);
    });

    it('预置金币无需等待散开时间即可吸附', () => {
        const f = fixture(() => false);
        f.pickups.spawnCoinBurst({ x: 80, y: 5 }, 1, true);
        f.pickups.update(1 / 60);
        expect(f.sprites[0].body.velocity.x).toBeLessThan(0);
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
