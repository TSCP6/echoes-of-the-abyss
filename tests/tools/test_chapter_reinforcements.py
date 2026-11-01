"""章节增员契约：数量、普通怪边界和可安全站立的实体地面。"""
import json
from pathlib import Path
import unittest

from tools.maps.level_layouts import LEVEL_BUILDERS

ROOT = Path(__file__).resolve().parents[2]
# 总数 / 原数量 / 精英数；第一章和 Boss 不参与增员。
COUNTS = {'2-1': (5, 4, 0), '2-2': (6, 4, 0), '2-3': (6, 5, 0),
          '3-1': (6, 5, 0), '3-2': (7, 5, 1), '3-3': (8, 4, 2)}


class ChapterReinforcementTests(unittest.TestCase):
    def test_chapter_enemy_counts_and_existing_elites(self):
        for key, (total, _, elites) in COUNTS.items():
            with self.subTest(level=key):
                raw = json.loads((ROOT / f'public/assets/levels/{key}.json').read_text(encoding='utf-8'))
                enemies = next(l['objects'] for l in raw['layers'] if l['name'] == 'enemies')
                self.assertEqual(len(enemies), total)
                self.assertEqual(sum(o['name'] == 'enm_elite' for o in enemies), elites)
                self.assertFalse(any(o['name'].startswith('enm_boss') for o in enemies))

    def test_reinforcements_stand_inside_wide_solid_ground(self):
        for key, (_, original, _) in COUNTS.items():
            raw = json.loads((ROOT / f'public/assets/levels/{key}.json').read_text(encoding='utf-8'))
            collision = next(l['data'] for l in raw['layers'] if l['name'] == 'collision')
            enemies = next(l['objects'] for l in raw['layers'] if l['name'] == 'enemies')
            solid = {ts['firstgid'] + t['id'] for ts in raw['tilesets'] for t in ts['tiles']
                     if any(p['name'] == 'solid' and p['value'] is True for p in t['properties'])}
            for enemy in enemies[original:]:
                with self.subTest(level=key, enemy=enemy):
                    self.assertIn(enemy['name'], ('enm_patrol', 'enm_chaser'))
                    x, floor = enemy['x'] // 32, enemy['y'] // 32 + 1
                    # 每侧至少留三格实体支撑，避免放在窄台或深渊边。
                    for column in range(x - 3, x + 4):
                        self.assertTrue(0 <= column < raw['width'])
                        self.assertIn(collision[floor * raw['width'] + column], solid)
                    self.assertEqual(collision[(floor - 1) * raw['width'] + x], 0)

    def test_generator_rebuild_preserves_map_objects_and_layout(self):
        for key in COUNTS:
            with self.subTest(level=key):
                raw = json.loads((ROOT / f'public/assets/levels/{key}.json').read_text(encoding='utf-8'))
                generated = LEVEL_BUILDERS[key]().to_json()
                self.assertEqual(raw['layers'], generated['layers'])
                self.assertEqual(raw['nextobjectid'], generated['nextobjectid'])


if __name__ == '__main__':
    unittest.main()
