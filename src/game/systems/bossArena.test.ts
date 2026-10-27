import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Geom, type Physics, type Scene } from 'phaser';
import { BossArena } from './bossArena';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return { Geom: { Rectangle: require('../../../node_modules/phaser/src/geom/rectangle/Rectangle.js') } };
});

const require = createRequire(import.meta.url);
const Body = require('../../../node_modules/phaser/src/physics/arcade/Body.js') as typeof Physics.Arcade.Body;

function fixture() {
    const graphics = Object.fromEntries(['setDepth', 'setVisible', 'clear', 'fillStyle', 'fillRect', 'lineStyle', 'lineBetween', 'destroy']
        .map(key => [key, () => graphics]));
    const arena = new BossArena({ add: { graphics: () => graphics } } as unknown as Scene,
        new Geom.Rectangle(1792, 384, 1088, 448), 960);
    const world = { bounds: new Geom.Rectangle(0, 0, 2880, 960), defaults: {},
        checkCollision: { left: true, right: true, up: true, down: true } };
    const body = new Body(world as Physics.Arcade.World);
    body.setSize(80, 96, false);
    return { arena, body, world };
}

describe('竞技场物理边界', () => {
    it('Boss 被击退到两侧时使用真实 Arcade 边界分离，不会出界', () => {
        const { arena, body } = fixture();
        arena.activate([body]);
        body.position.set(1700, 700); body.setVelocityX(-480);
        body.checkWorldBounds();
        expect(body.x).toBe(1792);
        expect(body.velocity.x).toBeCloseTo(0);
        body.position.x = 2850; body.setVelocityX(760);
        body.checkWorldBounds();
        expect(body.right).toBe(2880);
        expect(body.velocity.x).toBeCloseTo(0);
    });

    it('封锁覆盖空中和后续召唤物，释放时恢复原有物理设置', () => {
        const { arena, body, world } = fixture();
        const initialBounds = body.customBoundsRectangle;
        arena.activate([]);
        arena.enforce([body]);
        body.position.set(1700, 400); body.checkWorldBounds();
        expect(body.x).toBe(1792);
        expect(body.collideWorldBounds).toBe(true);
        arena.release();
        expect(arena.isActive).toBe(false);
        expect(body.collideWorldBounds).toBe(false);
        expect(body.customBoundsRectangle).toBe(initialBounds);
        expect(initialBounds).toBe(world.bounds);
    });

    it('场地只限制左右，不新增空中天花板或阻挡掉落救援', () => {
        const { arena, body } = fixture();
        arena.activate([body]);
        body.position.set(2200, 1600);
        body.checkWorldBounds();
        expect(body.y).toBe(1600);
    });

    it.each(['1-4', '2-4', '3-4'])('%s 的地图范围包含 Boss 和终点，入口检查点在门外', id => {
        const map = JSON.parse(readFileSync(new URL(`../../../public/assets/levels/${id}.json`, import.meta.url), 'utf8'));
        const group = (name: string) => map.layers.find((l: { name: string }) => l.name === name)?.objects ?? [];
        const field = group('boss_arena')[0];
        expect(field).toBeDefined();
        expect(field.x).toBeGreaterThan(0);
        expect(field.width).toBeGreaterThanOrEqual(1024);
        expect(field.x + field.width).toBeLessThanOrEqual(map.width * map.tilewidth);
        expect(group('enemies')[0].x).toBeGreaterThan(field.x);
        expect(group('goal')[0].x + group('goal')[0].width).toBeLessThan(field.x + field.width);
        expect(group('checkpoints')[0].x).toBeLessThan(field.x);
    });
});
