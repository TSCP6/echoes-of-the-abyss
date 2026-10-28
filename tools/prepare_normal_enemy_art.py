"""普通敌人素材预处理：Sunny Land 负鼠/鹰与本地 SunnyLand Woods 鳄龙。

运行：python -X utf8 tools/prepare_normal_enemy_art.py <sunny-land-files.zip>
仅提取美术，不使用包内音乐；许可与原始路径见 docs/素材许可清单.md。
"""
from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/art/enemies'
WOODS = ROOT / 'tools/source-packs/Sunny-land-woods-files/Sunny-land-woods-files/Assets/SPRITES/enemies/gator'
SIZE = 128
BASELINE = SIZE // 2 + 24


def pack(frames: list[Image.Image], name: str) -> None:
    sheet = Image.new('RGBA', (SIZE * len(frames), SIZE))
    for i, frame in enumerate(frames):
        box = frame.getbbox()
        if box is None:
            raise ValueError(f'{name} 第 {i} 帧为空')
        # 逐帧仅对齐脚底，保留原帧的水平原点；整数倍放大与主角像素比例一致。
        bottom = box[3] * 2
        frame = frame.resize((frame.width * 2, frame.height * 2), Image.Resampling.NEAREST)
        sheet.alpha_composite(frame, (i * SIZE + (SIZE - frame.width) // 2, BASELINE - bottom))
    sheet.save(OUT / f'{name}.png')
    print(f'{name}: {len(frames)} 帧，{SIZE}×{SIZE}')


def prepare(archive: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with ZipFile(archive) as source:
        for file, width, count, name in [
            ('oposum.png', 36, 6, 'chaser_run'),
            ('eagle-attack.png', 40, 4, 'flyer_fly'),
            ('enemy-deadth.png', 40, 6, 'normal_enemy_death')
        ]:
            path = f'Sunny-land-assets-files/PNG/spritesheets/{file}'
            image = Image.open(BytesIO(source.read(path))).convert('RGBA')
            assert image.width == width * count, (path, image.size)
            pack([image.crop((i * width, 0, (i + 1) * width, image.height)) for i in range(count)], name)
    pack([Image.open(WOODS / f'gator-{i + 1}.png').convert('RGBA') for i in range(4)], 'elite_move')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    prepare(parser.parse_args().archive)
