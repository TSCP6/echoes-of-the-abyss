"""Build game-only boss sheets from the two author archives (requires Pillow).

Usage: python tools/assets/prepare_remaining_boss_art.py <spider.zip> <executioner.zip>
Sources and terms: docs/素材许可清单.md. Raw archives stay outside public/.
"""
from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/art/enemies'


def prepare(spider_archive: Path, echo_archive: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with ZipFile(spider_archive) as archive:
        # These files contain irregularly spaced frames, NOT a uniform grid.
        for clip, source in [('idle', 'Idle'), ('move', 'Walk'), ('cast', 'Attack'), ('death', 'Die')]:
            image = Image.open(BytesIO(archive.read(f'Enemy Assets/{source}.png'))).convert('RGBA')
            alpha = image.getchannel('A')
            groups: list[list[int]] = []
            for x in range(image.width):
                if alpha.crop((x, 0, x + 1, image.height)).getbbox() is None:
                    continue
                if not groups or x > groups[-1][-1] + 1:
                    groups.append([x])
                else:
                    groups[-1].append(x)
            sheet = Image.new('RGBA', (160 * len(groups), 160))
            for i, columns in enumerate(groups):
                frame = image.crop((columns[0], 0, columns[-1] + 1, image.height))
                frame = frame.crop(frame.getbbox())
                frame = frame.resize((frame.width * 4, frame.height * 4), Image.Resampling.NEAREST)
                sheet.alpha_composite(frame, (160 * i + (160 - frame.width) // 2, 104 - frame.height))
            sheet.save(OUT / f'spider_{clip}.png')
            print(f'spider_{clip}: {len(groups)} frames')
            small = Image.new('RGBA', (80 * len(groups), 80))
            for i in range(len(groups)):
                frame = sheet.crop((i * 160, 0, (i + 1) * 160, 160)).resize((80, 80), Image.Resampling.NEAREST)
                small.alpha_composite(frame, (i * 80, 12))
            small.save(OUT / f'spiderling_{clip}.png')

    with ZipFile(echo_archive) as archive:
        for clip, source, cell, scale, size, offset in [
            ('idle', 'idle', 100, 2, 200, (0, -42)),
            ('phase', 'idle2', 100, 2, 200, (0, -42)),
            ('charge', 'skill1', 100, 2, 200, (0, -42)),
            ('shoot', 'attacking', 100, 2, 200, (0, -42)),
            ('summon', 'summon', 100, 2, 200, (0, -42)),
            ('death', 'death', 100, 2, 200, (0, -42)),
            ('spirit_idle', 'summonIdle', 50, 3, 150, (0, -15)),
            ('spirit_appear', 'summonAppear', 50, 3, 150, (0, -15)),
            ('spirit_death', 'summonDeath', 50, 3, 150, (0, -15)),
        ]:
            image = Image.open(BytesIO(archive.read(f'Undead executioner puppet/png/{source}.png'))).convert('RGBA')
            frames = []
            for y in range(0, image.height, cell):
                for x in range(0, image.width, cell):
                    frame = image.crop((x, y, x + cell, y + cell))
                    # The distributed death/idle sheets contain trailing blank cells.
                    if frame.getbbox() is not None:
                        frames.append(frame.resize((cell * scale, cell * scale), Image.Resampling.NEAREST))
            sheet = Image.new('RGBA', (size * len(frames), size))
            for i, frame in enumerate(frames):
                sheet.alpha_composite(frame, (i * size + offset[0], offset[1]))
            sheet.save(OUT / f'echo_{clip}.png')
            print(f'echo_{clip}: {len(frames)} frames')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('spider_archive', type=Path)
    parser.add_argument('echo_archive', type=Path)
    args = parser.parse_args()
    prepare(args.spider_archive, args.echo_archive)
