import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Geom, type Scene } from 'phaser';
import { PickupSystem } from './pickupSystem';
import type { LevelContext } from './levelLoader';
import type { PlayerController } from './playerController';
import { economyService } from '../domain/economyService';
import { progressService } from '../domain/progressService';
import { validateAll, markValidated } from '../domain/configRegistry';

beforeEach(() => { expect(validateAll().ok).toBe(true); markValidated(); progressService.reset(); economyService.fromSnapshot({ coins: 0, materials: {} }); });

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
    const sprites: { x: number; y: number; visible: boolean; body?: { enabled: boolean; velocity: { x: number; y: number } } }[] = [];
    const makeSprite = (physical = false) => {
            const sprite = { x: -9999, y: -9999, visible: false,
                setDepth() { return this; }, setScale() { return this; },
                setVisible(visible: boolean) { this.visible = visible; return this; },
                setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
                setTexture() { return this; }, destroy() {},
                body: { enabled: true, velocity: { x: 0, y: 0 }, setCollideWorldBounds() {}, setSize() {},
                    setEnable(enabled: boolean) { this.enabled = enabled; },
                    setVelocity(x: number, y: number) { this.velocity.x = x; this.velocity.y = y; } } };
            const result = physical ? sprite : { ...sprite, body: undefined };
            sprites.push(result);
            return result;
    };
    const scene = { add: { sprite: () => makeSprite(), text: () => ({ text: '', setText(value: string) { this.text = value; return this; }, setOrigin() { return this; }, setDepth() { return this; }, destroy() {} }) }, tweens: { add() {} }, physics: { add: {
        group: () => ({ add() {} }), collider() {}, sprite: () => makeSprite(true)
    } } } as unknown as Scene;
    const player = { sprite: { x: 5, y: 5 } } as PlayerController;
    const ctx = { levelId: '1-4', coinClusters: [], checkpoints: [], shards: [], chests: [], hazards: [], hints: [],
        goal: new Geom.Rectangle(0, 0, 20, 20) } as unknown as LevelContext;
    let chestOpens = 0;
    const pickups = new PickupSystem(scene, player, ctx, { onGoal, onCheckpoint() {}, onShard() {}, onChest() { chestOpens++; }, onHint() {} });
    return { pickups, player, ctx, sprites, chestOpens: () => chestOpens };
}

describe('PickupSystem 终点确认', () => {
    it('宝箱只通知父层一次，重新创建系统也保留开启状态', () => {
        const f = fixture(() => false);
        f.ctx.chests.push({ id: 'chest_1', x: 5, y: 5 });
        f.pickups.update(1 / 60);
        expect(f.chestOpens()).toBe(0);
        f.pickups.update(1 / 60, true);
        f.pickups.update(1 / 60, true);
        expect(f.chestOpens()).toBe(1);
        expect(economyService.getCoins()).toBe(0);
        expect(economyService.getMaterials()).toEqual({});
        const next = fixture(() => false);
        next.ctx.chests.push({ id: 'chest_1', x: 5, y: 5 });
        next.pickups.update(1 / 60, true);
        expect(next.chestOpens()).toBe(0);
    });
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
    it('320金币使用少量显示实体兑现全额，池满后的奖励合并保留', () => {
        const f = fixture(() => false);
        const picked = vi.fn();
        f.pickups.onCoinPicked = picked;
        for (let i = 0; i < 80; i++) { f.pickups.spawnCoinBurst({ x: 500, y: 5 }, 320); }
        expect(f.sprites.filter(s => s.visible).length).toBeLessThanOrEqual(64);
        for (const sprite of f.sprites.filter(s => s.visible)) {
            f.player.sprite.x = sprite.x; f.player.sprite.y = sprite.y;
            f.pickups.update(0);
        }
        expect(economyService.getCoins()).toBe(25600);
        expect(picked.mock.calls.reduce((sum, args) => sum + args[0], 0)).toBe(25600);
    });

    it('接近金币上限时只统计实际入账额', () => {
        const f = fixture(() => false);
        economyService.fromSnapshot({ coins: 99998, materials: {} });
        const picked = vi.fn(); f.pickups.onCoinPicked = picked;
        f.pickups.spawnCoinBurst({ x: 20, y: 5 }, 320);
        for (const sprite of f.sprites.filter(s => s.visible)) {
            f.player.sprite.x = sprite.x; f.player.sprite.y = sprite.y; f.pickups.update(0);
        }
        expect(economyService.getCoins()).toBe(99999);
        expect(picked.mock.calls.reduce((sum, args) => sum + args[0], 0)).toBe(1);
    });

    it('敌人掉落强化残片靠近后记入材料，拾取后不重复发放', () => {
        const f = fixture(() => false);
        f.pickups.spawnItemDrop({ x: 5, y: 5 }, 'itm_relic_shard', 3);
        // 渲染替身的位置由显式setPosition维护。
        f.sprites[f.sprites.length - 1].x = 5; f.sprites[f.sprites.length - 1].y = 5;
        f.pickups.update(1 / 60);
        expect(economyService.getMaterials().itm_relic_shard).toBe(3);
        f.pickups.update(1 / 60);
        expect(economyService.getMaterials().itm_relic_shard).toBe(3);
    });
    it('刚掉落的金币接触玩家即拾取，且只记一次', () => {
        const f = fixture(() => false);
        let picked = 0;
        f.pickups.onCoinPicked = () => picked++;
        f.pickups.spawnCoinBurst({ x: 20, y: 5 }, 1); // 第一枚与玩家(5,5)重合。
        f.pickups.update(1 / 60);
        expect(economyService.getCoins()).toBe(1);
        expect(picked).toBe(1);
        expect(f.sprites[0].visible).toBe(false);
        expect(f.sprites[0].body).toBeUndefined();
        f.pickups.update(1 / 60);
        expect(economyService.getCoins()).toBe(1);
        expect(picked).toBe(1);
    });

    it('金币不分配刚体，附近掉落150ms后才开始吸附', () => {
        const f = fixture(() => false);
        f.pickups.spawnCoinBurst({ x: 80, y: 5 }, 1);
        f.pickups.update(0.14);
        expect(f.sprites[0].x).toBe(65);
        expect(f.sprites[0].body).toBeUndefined();
        f.pickups.update(0.02);
        expect(f.sprites[0].x).toBeLessThan(65);
        expect(economyService.getCoins()).toBe(0);
    });

    it('金币与人物中心重合时不产生NaN速度', () => {
        const f = fixture(() => false);
        f.pickups.spawnCoinBurst({ x: 20, y: 5 }, 1);
        f.pickups.update(4);
        expect(Number.isFinite(f.sprites[0].x)).toBe(true);
        expect(Number.isFinite(f.sprites[0].y)).toBe(true);
        expect(economyService.getCoins()).toBe(1);
    });

    it('预置金币无需等待散开时间即可吸附', () => {
        const f = fixture(() => false);
        f.pickups.spawnCoinBurst({ x: 80, y: 5 }, 1, true);
        f.pickups.update(1 / 60);
        expect(f.sprites[0].x).toBeLessThan(65);
    });

    it('远处金币悬浮且不会越过玩家，离开吸附范围后停止移动', () => {
        const f = fixture(() => false);
        f.pickups.spawnCoinBurst({ x: 315, y: 120 }, 1);
        f.pickups.update(2);
        expect(f.sprites[0]).toMatchObject({ x: 300, y: 120 });
        f.player.sprite.x = 250; f.player.sprite.y = 120;
        f.pickups.update(1);
        expect(f.sprites[0].x).toBe(250);
        f.player.sprite.x = 500;
        f.pickups.update(1);
        expect(f.sprites[0].x).toBe(250);
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
