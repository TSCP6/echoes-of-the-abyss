"""Prepare the enemy art pilot. Run from any directory; requires Pillow.

Download Kronovi's free Mecha-stone Golem 0.1.zip from its author page,
then pass the archive path. The archive/source projects stay outside public/.
See docs/素材许可清单.md for the custom licence and source URL.
"""
from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/art/enemies'
ANT = ROOT / 'tools/source-packs/Sunny-land-woods-files/Sunny-land-woods-files/Assets/SPRITES/enemies/ant'


def prepare(archive: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGBA', (96 * 8, 96))
    for i in range(8):
        frame = Image.open(ANT / f'ant-{i + 1}.png').convert('RGBA')
        # Match the player's ×2 pixel scale; feet at y=72 preserve the ground baseline.
        frame = frame.resize((74, 62), Image.Resampling.NEAREST)
        sheet.alpha_composite(frame, (i * 96 + 11, 10))
    sheet.save(OUT / 'ant_run.png')

    with ZipFile(archive) as source:
        image = Image.open(BytesIO(source.read('Mecha-stone Golem 0.1/PNG sheet/Character_sheet.png'))).convert('RGBA')
    # The author's PNG uses one animation per row, with death continuing on row 8.
    for name, row, count in [('idle', 0, 4), ('glow', 1, 8), ('shoot', 2, 9),
                              ('immune', 3, 8), ('melee', 4, 7), ('death', 7, 14)]:
        sheet = Image.new('RGBA', (200 * count, 200))
        for i in range(count):
            x, y = (i % 10) * 100, (row + i // 10) * 100
            frame = image.crop((x, y, x + 100, y + 100))
            bottom = frame.getbbox()[3] if frame.getbbox() else 70
            # The floating guardian drops 40px onto the arena floor while crumbling.
            shift = max(0, bottom - 90) * 2 if name == 'death' else 0
            frame = frame.resize((200, 200), Image.Resampling.NEAREST)
            sheet.alpha_composite(frame, (i * 200, -16 - shift))
        sheet.save(OUT / f'guardian_{name}.png')
    print(f'Prepared ant (8 frames) and guardian (50 frames) in {OUT}')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    prepare(parser.parse_args().archive)
