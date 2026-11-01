"""Validate shipped sprite cells, including alpha; catches invisible animation frames."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2] / 'public/assets/art/enemies'
checks = [('chaser_run', 128, 6), ('flyer_fly', 128, 4), ('elite_move', 128, 4), ('normal_enemy_death', 128, 6),
          ('ant_run', 96, 8), ('guardian_idle', 200, 4), ('guardian_glow', 200, 8),
          ('guardian_shoot', 200, 9), ('guardian_immune', 200, 8),
          ('guardian_melee', 200, 7), ('guardian_death', 200, 14),
          ('spider_idle', 160, 4), ('spider_move', 160, 4), ('spider_cast', 160, 3), ('spider_death', 160, 4),
          ('spiderling_idle', 80, 4), ('spiderling_move', 80, 4), ('spiderling_cast', 80, 3), ('spiderling_death', 80, 4),
          ('echo_idle', 200, 4), ('echo_phase', 200, 8), ('echo_charge', 200, 12),
          ('echo_shoot', 200, 13), ('echo_summon', 200, 5), ('echo_death', 200, 18),
          ('echo_spirit_idle', 150, 4), ('echo_spirit_appear', 150, 6), ('echo_spirit_death', 150, 5)]
for name, size, count in checks:
    image = Image.open(root / f'{name}.png').convert('RGBA')
    assert image.size == (size * count, size), (name, image.size)
    for i in range(count):
        alpha = image.crop((i * size, 0, (i + 1) * size, size)).getchannel('A')
        assert alpha.getbbox() is not None, f'{name} frame {i}: empty cell'
        assert sum(alpha.histogram()[1:]) > 100, f'{name} frame {i}: almost invisible'
    print(f'{name}: {count} nonempty frames OK')
print(f'{sum(c for _, _, c in checks)} frames verified, including alpha and frame dimensions.')
