"""素材预处理：把 CC0 原始素材统一放大到 32px 瓦片世界（2x NEAREST，像素完美）。

输入：tools/source-packs/Pixel Adventure 1/Free/**（原始 16px 瓦片 / 32px 角色帧）
输出：public/assets/gen/**（32px 瓦片集 / 64px 角色帧 / 64px 物件帧）

约定（DD-11 数据侧）：
- 磁盘上一律 2x；运行时显示缩放：瓦片/角色 1.0，物件（旗/门/水果）0.5（恰为 2x 的逆运算，像素无损）。
- 仅 NEAREST 重采样，不引入模糊。
- 本脚本可重复执行（幂等），输出仅依赖输入素材。
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "source-packs", "Pixel Adventure 1", "Free")
OUT = os.path.join(ROOT, "public", "assets", "gen")


def upscale(src_rel: str, out_name: str, factor: int = 2) -> None:
    img = Image.open(os.path.join(SRC, src_rel)).convert("RGBA")
    big = img.resize((img.width * factor, img.height * factor), Image.NEAREST)
    os.makedirs(OUT, exist_ok=True)
    big.save(os.path.join(OUT, out_name))
    print(f"  {src_rel} -> gen/{out_name} {big.size}")


def main() -> None:
    print("build_assets: upscaling CC0 sources to 32px world")
    # 瓦片集：16x16 -> 32x32（22x11 格）
    upscale("Terrain/Terrain (16x16).png", "terrain32.png")
    # 玩家：Ninja Frog 32x32 帧 -> 64x64 帧
    for anim in ("Idle", "Run", "Jump", "Fall", "Hit"):
        upscale(f"Main Characters/Ninja Frog/{anim} (32x32).png", f"player_{anim.lower()}.png")
    # 物件：原生 64x64 / 32x32 -> 2x（运行时 0.5 显示）
    upscale("Items/Checkpoints/Checkpoint/Checkpoint (Flag Idle)(64x64).png", "checkpoint_flag.png")
    upscale("Items/Checkpoints/Checkpoint/Checkpoint (Flag Out) (64x64).png", "checkpoint_flag_out.png")
    upscale("Items/Checkpoints/End/End (Idle).png", "goal_idle.png")
    upscale("Items/Checkpoints/End/End (Pressed) (64x64).png", "goal_pressed.png")
    upscale("Items/Fruits/Apple.png", "fruit_apple.png")
    upscale("Items/Fruits/Collected.png", "fruit_collected.png")
    # 背景：64x64 平铺块 -> 2x
    upscale("Background/Green.png", "bg_green.png")
    print("done.")


if __name__ == "__main__":
    main()
