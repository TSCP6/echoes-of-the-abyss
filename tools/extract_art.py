# P4 美术抽取：CC0 素材（Pixel Adventure 1 / SunnyLand Woods）→ public/assets/art/
# 整数倍 NEAREST 放大，保持与占位纹理相同的帧网格与原点语义（换帧不改代码，DD-11）。
# 源素材全部 CC0（见 docs/素材许可清单.md）。
from PIL import Image
import os

SRC = 'public/assets/Pixel Adventure 1/Free/'
WOODS = 'public/assets/Sunny-land-woods-files/Sunny-land-woods-files/Assets/'
OUT = 'public/assets/art/'
os.makedirs(OUT, exist_ok=True)


def sheet(src: str, fw: int, fh: int, dst: str, scale: int) -> None:
    """切帧 → 整数倍放大 → 重新拼表（帧数不变，网格不变）"""
    im = Image.open(SRC + src).convert('RGBA')
    n = im.width // fw
    frames = []
    for i in range(n):
        f = im.crop((i * fw, 0, (i + 1) * fw, fh))
        frames.append(f.resize((fw * scale, fh * scale), Image.NEAREST))
    out = Image.new('RGBA', (fw * scale * n, fh * scale), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * fw * scale, 0), f)
    out.save(OUT + dst)
    print(dst, out.size, n, 'frames')


def single(src: str, dst: str, scale: int, base: str = SRC) -> None:
    im = Image.open(base + src).convert('RGBA')
    im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(OUT + dst)
    print(dst, im.size)


# 玩家（Ninja Frog，CC0）：32→64（×2），与占位 64×64 网格一致
sheet('Main Characters/Ninja Frog/Idle (32x32).png', 32, 32, 'player_idle.png', 2)
sheet('Main Characters/Ninja Frog/Run (32x32).png', 32, 32, 'player_run.png', 2)
sheet('Main Characters/Ninja Frog/Jump (32x32).png', 32, 32, 'player_jump.png', 2)
sheet('Main Characters/Ninja Frog/Fall (32x32).png', 32, 32, 'player_fall.png', 2)
sheet('Main Characters/Ninja Frog/Hit (32x32).png', 32, 32, 'player_hit.png', 2)
# 检查点旗（64→128 ×2，与占位 128×128 网格一致）
sheet('Items/Checkpoints/Checkpoint/Checkpoint (Flag Idle)(64x64).png', 64, 64, 'checkpoint_flag.png', 2)
# 终点（单帧 64→128）
single('Items/Checkpoints/End/End (Idle).png', 'goal_idle.png', 2)
# 苹果拾取物（32→64 ×2）
sheet('Items/Fruits/Apple.png', 32, 32, 'fruit_apple.png', 2)
sheet('Items/Fruits/Collected.png', 32, 32, 'fruit_collected.png', 2)
# 背景（SunnyLand Woods ENVIRONMENT，CC0）：64→1024 平铺单元（×16 整数倍保持像素风）
single('ENVIRONMENT/bg-trees.png', 'bg_green.png', 4, base=WOODS)
print('done')
