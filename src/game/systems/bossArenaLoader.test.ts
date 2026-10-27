import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { LevelLoader } from './levelLoader';
import { validateAll, markValidated } from '../domain/configRegistry';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return { Geom: { Rectangle: require('../../../node_modules/phaser/src/geom/rectangle/Rectangle.js') } };
});

beforeEach(() => { expect(validateAll().ok).toBe(true); markValidated(); });

function fixture(id = '1-4') {
    const raw = JSON.parse(readFileSync(new URL(`../../../public/assets/levels/${id}.json`, import.meta.url), 'utf8'));
    const layer = { setCollisionByProperty() {}, setCollisionBetween() {}, setDepth() {} };
    const map = { widthInPixels: raw.width * 32, heightInPixels: raw.height * 32,
        addTilesetImage: () => ({}), createLayer: () => layer, tilesets: [{ total: 242 }],
        objects: raw.layers.filter((l: { type: string }) => l.type === 'objectgroup'), destroy() {} };
    const loader = new LevelLoader({ cache: { tilemap: { get: () => ({ data: raw }) } }, add: { tilemap: () => map } } as unknown as Scene);
    return { raw, map, load: () => loader.load(id) };
}

describe('地图竞技场契约', () => {
    it('从地图对象读取范围，供物理边界与相机使用', () => {
        const r = fixture().load();
        expect(r.ok).toBe(true);
        if (r.ok) { expect(r.value.bossArena).toMatchObject({ x: 1792, y: 384, width: 1088, height: 448 }); }
    });
    it('Boss 地图缺少竞技场时拒绝加载，避免退回临时拼接范围', () => {
        const f = fixture();
        f.map.objects = f.map.objects.filter((l: { name: string }) => l.name !== 'boss_arena');
        const r = f.load();
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('MAP_INVALID'); expect(r.message).toContain('boss_arena'); }
    });
    it('超出地图的竞技场拒绝加载', () => {
        const f = fixture();
        f.map.objects.find((l: { name: string }) => l.name === 'boss_arena').objects[0].width = 9999;
        const r = f.load();
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.message).toContain('boss_arena'); }
    });
    it('普通关卡继续无需竞技场', () => {
        const r = fixture('1-2').load();
        expect(r.ok).toBe(true);
        if (r.ok) { expect(r.value.bossArena).toBe(null); }
    });
});
