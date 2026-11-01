import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { LevelLoader } from '../../../../src/game/systems/world/levelLoader';
import { validateAll, markValidated } from '../../../../src/game/domain/shared/configRegistry';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return { Geom: { Rectangle: require('../../../../node_modules/phaser/src/geom/rectangle/Rectangle.js') } };
});

beforeEach(() => { expect(validateAll().ok).toBe(true); markValidated(); });

function fixture(id = '1-4') {
    const raw = JSON.parse(readFileSync(new URL(`../../../../public/assets/levels/${id}.json`, import.meta.url), 'utf8'));
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
        if (r.ok) { expect(r.value.bossArena).toMatchObject({ x: 2240, y: 416, width: 1280, height: 544 }); }
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
    it('接受 Tiled 保存的省略默认 encoding 的数字数组，仍拒绝损坏的瓦片数据', () => {
        const f = fixture('1-2');
        const layer = f.raw.layers.find((l: { type: string }) => l.type === 'tilelayer');
        delete layer.encoding;
        expect(f.load().ok).toBe(true);
        layer.data.pop();
        expect(f.load().ok).toBe(false);
    });
    it('未知机关与无对应符文的封印不能静默载入', () => {
        const f = fixture('1-3');
        const devices = f.map.objects.find((l: { name: string }) => l.name === 'mechanisms').objects;
        devices.find((d: { type: string }) => d.type === 'switch').type = 'unsupported';
        const r = f.load();
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.message).toContain('缺少对应开关'); }
    });
    it('Tiled 的 class 字段经过真实 Phaser 解析后仍能识别机关', () => {
        const f = fixture('1-3');
        const devices = f.raw.layers.find((l: { name: string }) => l.name === 'mechanisms').objects;
        for (const d of devices) { d.class = d.type; delete d.type; }
        const parse = createRequire(import.meta.url)('../../../../node_modules/phaser/src/tilemaps/parsers/tiled/ParseObject.js');
        const loader = new LevelLoader({ cache: { tilemap: { get: () => ({ data: f.raw }) } }, add: { tilemap: () => {
            f.map.objects = f.raw.layers.filter((l: { type: string }) => l.type === 'objectgroup')
                .map((l: { objects: unknown[] }) => ({ ...l, objects: l.objects.map(o => parse(o)) }));
            return f.map;
        } } } as unknown as Scene);
        const r = loader.load('1-3');
        expect(r.ok).toBe(true);
        if (r.ok) { expect(r.value.devices.find(d => d.id === 'ruin_rune')?.kind).toBe('switch'); }
    });
    it('损坏的瓦片层在交给 Phaser 之前被拒绝', () => {
        const f = fixture('1-2');
        f.raw.layers.find((l: { type: string }) => l.type === 'tilelayer').data = 'invalid';
        const tilemap = vi.fn(() => { throw new Error('损坏数据不能进入引擎解析'); });
        const loader = new LevelLoader({ cache: { tilemap: { get: () => ({ data: f.raw }) } }, add: { tilemap } } as unknown as Scene);
        expect(loader.load('1-2').ok).toBe(false);
        expect(tilemap).not.toHaveBeenCalled();
    });
});
