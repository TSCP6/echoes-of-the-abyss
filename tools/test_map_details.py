"""实际地图的局部可玩空间检查，不修改或重建地图。"""
import json
from pathlib import Path
import unittest
from math import ceil
from audit_reach import load_physics

ROOT = Path(__file__).resolve().parents[1]

class MapDetailsTests(unittest.TestCase):
    def test_oneway_has_headroom(self):
        rows = ceil(load_physics().height / 32) + 1
        for path in sorted((ROOT / 'public/assets/levels').glob('*.json')):
            raw = json.loads(path.read_text(encoding='utf-8'))
            layers = {l['name']: l for l in raw['layers']}
            w = raw['width']
            solid = layers['collision']['data']
            for i, tile in enumerate(layers['oneway']['data']):
                if tile:
                    with self.subTest(level=path.stem, x=i % w, y=i // w):
                        self.assertFalse(any(solid[i - row*w] for row in range(rows) if i-row*w >= 0),
                                         '单向平台与实体重叠或上方净空不足44px')

    def test_shards_have_visual_clearance(self):
        for path in sorted((ROOT / 'public/assets/levels').glob('*.json')):
            raw = json.loads(path.read_text(encoding='utf-8'))
            layers = {l['name']: l for l in raw['layers']}
            w, h = raw['width'], raw['height']
            for shard in layers['shards']['objects']:
                x, y = shard['x'], shard['y']
                with self.subTest(level=path.stem, shard=shard['name']):
                    # 32px晶体外观，四周另留12px，避免贴墙、嵌墙。
                    for row in range(max(0, int((y-28)//32)), min(h, int((y+28)//32)+1)):
                        for col in range(max(0, int((x-28)//32)), min(w, int((x+28)//32)+1)):
                            self.assertFalse(layers['collision']['data'][row*w+col], '技能碎片贴墙或嵌入实体')

    def test_targeted_layouts_reproduce_adjusted_geometry(self):
        from level_layouts import LEVEL_BUILDERS
        for key in ('1-1', '2-1', '2-3'):
            raw = json.loads((ROOT / 'public/assets/levels' / (key+'.json')).read_text(encoding='utf-8'))
            rebuilt = LEVEL_BUILDERS[key]().to_json()
            for name in ('collision', 'oneway', 'shards', 'pickups'):
                field = 'data' if name in ('collision', 'oneway') else 'objects'
                a = next(l for l in raw['layers'] if l['name'] == name)[field]
                b = next(l for l in rebuilt['layers'] if l['name'] == name)[field]
                with self.subTest(level=key, layer=name): self.assertEqual(a, b)

if __name__ == '__main__': unittest.main()
