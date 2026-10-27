import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('手工编辑的 1-1 地图契约', () => {
    const map = JSON.parse(readFileSync('public/assets/levels/1-1.json', 'utf8'));

    it('瓦片层使用加载器支持的 CSV 数组，并保留完整地图尺寸', () => {
        for (const layer of map.layers.filter((l: { type: string }) => l.type === 'tilelayer')) {
            expect(layer.encoding, layer.name).toBe('csv');
            expect(layer.data).toHaveLength(map.width * map.height);
            expect(layer.data.every((id: number) => Number.isInteger(id) && id >= 0)).toBe(true);
        }
    });

    it('collision 层中所有地形都有 solid 属性，装饰层不参与碰撞', () => {
        const solid = new Set<number>();
        for (const tileset of map.tilesets) {
            for (const tile of tileset.tiles ?? []) {
                if (tile.properties?.some((p: { name: string; value: unknown }) => p.name === 'solid' && p.value === true)) {
                    solid.add(tileset.firstgid + tile.id);
                }
            }
        }
        const collision = map.layers.find((l: { name: string }) => l.name === 'collision');
        const missing = [...new Set<number>(collision.data)].filter(id => id !== 0 && !solid.has(id));
        expect(missing).toEqual([]);
    });
});
