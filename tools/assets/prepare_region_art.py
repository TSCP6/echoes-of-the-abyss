"""重建三大区域像素环境。运行：python -X utf8 tools/assets/prepare_region_art.py。

图集沿用 Pixel Adventure 1（CC0）的 22 列布局，只重绘已用的 12 格；
森林远景复用 SunnyLand Woods（CC0）树冠，其余环境由确定性像素绘制生成。
不访问网络，不需要未入库的付费资源；只依赖 Pillow。
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/art/regions"
WOODS = ROOT / "tools/source-packs/Sunny-land-woods-files/Sunny-land-woods-files/Assets/ENVIRONMENT"
TERRAIN = ROOT / "tools/source-packs/Pixel Adventure 1/Free/Terrain/Terrain (16x16).png"
W, H, SCALE = 384, 256, 4
TRANSPARENT = (0, 0, 0, 0)


def rgb(color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    return (*tuple(int(color[i:i + 2], 16) for i in (1, 3, 5)), alpha)


def mix(a: str, b: str, t: float) -> tuple[int, int, int, int]:
    ca, cb = rgb(a), rgb(b)
    return tuple(round(ca[i] * (1 - t) + cb[i] * t) for i in range(3)) + (255,)


def save(im: Image.Image, name: str, scale: int = SCALE) -> None:
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.Resampling.NEAREST)
    im.save(OUT / name, optimize=True)
    print(f"{name}: {im.width}×{im.height}")


def canvas() -> Image.Image:
    return Image.new("RGBA", (W, H), TRANSPARENT)


def poly(d: ImageDraw.ImageDraw, points, fill) -> None:
    d.polygon([(round(x), round(y)) for x, y in points], fill=fill)


def cloud(d: ImageDraw.ImageDraw, x: int, y: int, size: int, color) -> None:
    """用层叠的像素弧与长条建立有台阶的云轮廓。"""
    d.rectangle((x - size, y, x + size, y + size // 5), fill=color)
    for dx, dy, radius in [(-.65, 0, .35), (-.2, -.22, .45), (.3, -.1, .37), (.7, .05, .25)]:
        cx, cy, r = x + int(dx * size), y + int(dy * size), max(2, int(radius * size))
        d.ellipse((cx - r, cy - r // 2, cx + r, cy + r // 2), fill=color)


def stars(d: ImageDraw.ImageDraw, seed: int, color, count: int = 90) -> None:
    rng = random.Random(seed)
    for i in range(count):
        x, y = rng.randrange(W), rng.randrange(12, 165)
        d.point((x, y), fill=color)
        if i % 17 == 0:
            d.line((x - 2, y, x + 2, y), fill=color)
            d.line((x, y - 2, x, y + 2), fill=color)


def sky(region: str, variant: int) -> Image.Image:
    palettes = {
        "forest": [("#123f4b", "#829b6b"), ("#171e3d", "#655d74"), ("#102f3a", "#52746e"), ("#121a2c", "#3e5a53")],
        "cavern": [("#080d26", "#253454"), ("#0d102d", "#392f5e"), ("#071e2b", "#215052"), ("#160f29", "#4c2e50")],
        "temple": [("#304b78", "#bca0a0"), ("#242649", "#9c687c"), ("#101d44", "#48698d"), ("#171733", "#6b526e")],
    }
    top, bottom = palettes[region][variant]
    im = canvas()
    d = ImageDraw.Draw(im)
    for y in range(H):
        d.line((0, y, W, y), fill=mix(top, bottom, (y / (H - 1)) ** .85))
    opaque_gradient = im.copy()
    rng = random.Random(101 + variant)
    if region == "cavern":
        # 洞穴深部的冷色反射，带岩层纹理，不绘制日月。
        for i in range(5):
            y = 80 + i * 29
            points = [(x, y + int(math.sin(x / 33 + i) * 9)) for x in range(-8, W + 9, 8)]
            d.line(points, fill=mix(top, bottom, .38 + i * .08), width=2)
        for i in range(80):
            x, y = rng.randrange(W), rng.randrange(20, H)
            d.point((x, y), fill=rgb("#6599b0", 55))
        for cx, cy, color in [(90, 160, "#2d6f7d"), (290, 106, "#4b3977")]:
            for rad in range(42, 0, -3):
                alpha = round((1 - rad / 43) * 6)
                glow = Image.new("RGBA", im.size, TRANSPARENT)
                ImageDraw.Draw(glow).ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=rgb(color, alpha))
                im = Image.alpha_composite(im, glow)
        return Image.alpha_composite(opaque_gradient, im)
    if variant in (1, 2, 3):
        stars(d, 130 + variant, rgb("#c5d1cf", 150), 70 if variant != 3 else 130)
    cx = 286 if region == "forest" else 264
    cy = 53 if region == "forest" else 60
    if region == "forest":
        color = "#f5d798" if variant == 0 else "#b6d7c5"
        for r in (33, 27, 23):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=rgb(color, 20 + (33 - r) * 2), width=1)
        d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill=rgb(color, 240))
        if variant in (1, 2):
            d.ellipse((cx - 9, cy - 19, cx + 19, cy + 7), fill=rgb(top))
        if variant == 3:
            d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=rgb("#213b40"))
    else:
        # 神殿的巨大环日，第三、四关变为月环与紫色日蚀。
        color = ["#f9d5a0", "#f1b596", "#b7d7ef", "#d6adc9"][variant]
        for r in (40, 34, 28):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=rgb(color, 80 if r == 34 else 35), width=1)
        d.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=rgb(color, 205))
        if variant >= 2:
            d.ellipse((cx - 18, cy - 18, cx + 18, cy + 18), fill=rgb(top))
        d.line((cx - 50, cy, cx + 50, cy), fill=rgb(color, 50))
        for x, y in [(72, 33), (86, 50), (115, 45), (126, 68), (153, 62)]:
            d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=rgb("#a9c0dd", 160))
        d.line([(72, 33), (86, 50), (115, 45), (126, 68), (153, 62)], fill=rgb("#9fb9d9", 55), width=1)
    # 轻柔云带为天空分区，留出中部动作读图空间。
    for i in range(13):
        x = rng.randrange(-25, W + 25)
        y = rng.choice((39, 91, 140, 205)) + rng.randrange(-8, 9)
        cloud(d, x, y, rng.randrange(18, 46), rgb("#bac9bd" if region == "forest" else "#d4c6d1", 24 if y < 140 else 35))
    return Image.alpha_composite(opaque_gradient, im)


def tree(d: ImageDraw.ImageDraw, x: int, y: int, height: int, seed: int, near: bool = False) -> None:
    rng = random.Random(seed)
    trunk = "#0b2631" if near else "#1b464a"
    light = "#143c42" if near else "#285755"
    leaf = ["#0c2b36", "#103740", "#17454a"] if near else ["#235451", "#2b6359", "#376e61"]
    width = max(4, height // 11)
    top = y - height
    poly(d, [(x - width, y), (x - width // 2, top + 20), (x - 8, top), (x + 3, top - 6), (x + width // 2, top + 35), (x + width, y)], rgb(trunk))
    d.line([(x, y - 3), (x - 2, top + 28), (x + 2, top + 10)], fill=rgb(light), width=2)
    for side, frac in [(-1, .25), (1, .4), (-1, .55), (1, .7)]:
        by = top + int(height * frac)
        bx = x + side * int(height * .25)
        d.line([(x, by + 25), (bx, by), (bx + side * 9, by - 22)], fill=rgb(trunk), width=max(2, width // 2))
        for _ in range(11):
            dx, dy = rng.randrange(-19, 20), rng.randrange(-15, 10)
            rad = rng.randrange(9, 20)
            d.ellipse((bx + dx - rad, by + dy - rad // 2, bx + dx + rad, by + dy + rad // 2), fill=rgb(leaf[rng.randrange(3)]))
            # 离散的小叶片与高光打散平滑椭圆，保留 4px 原生像素笔触。
            for _ in range(10):
                lx = bx + dx + rng.randrange(-rad + 2, rad - 1)
                ly = by + dy + rng.randrange(-rad // 3, max(1, rad // 3))
                d.rectangle((lx, ly, lx + rng.randrange(1, 4), ly + 1), fill=rgb(leaf[rng.randrange(3)]))
    for off in (-1, 1):
        d.line([(x, y - 16), (x + off * width * 2, y), (x + off * width * 3, y + 3)], fill=rgb(trunk), width=max(2, width // 3))
    for i in range(7):
        yy = top + 35 + i * 15
        d.line((x - 4, yy, x, yy - 4), fill=rgb(light), width=1)


def ruin_arch(d: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int, color: str, glow: bool = False) -> None:
    """断裂拱门、独立石块与凹刻，不是平涂矩形。"""
    wall = rgb(color)
    shadow = rgb("#153b43")
    thick = max(4, width // 8)
    r = width // 2
    d.arc((x, y - height, x + width, y - height + width), 180, 345, fill=wall, width=thick)
    for xx in (x, x + width - thick):
        d.rectangle((xx, y - height + r - 1, xx + thick, y), fill=wall)
        d.rectangle((xx - 2, y - 3, xx + thick + 2, y), fill=wall)
        for yy in range(y - height + r + 9, y - 4, 11):
            d.line((xx, yy, xx + thick - 1, yy + 1), fill=shadow, width=1)
    d.line((x + thick, y - height + r + 5, x + thick, y - 6), fill=rgb("#4c7770"), width=1)
    poly(d, [(x + width - 10, y - height + 8), (x + width + 2, y - height + 17), (x + width - 3, y - height + 24)], TRANSPARENT)
    if glow:
        for yy in range(y - height + r + 10, y - 10, 14):
            d.line((x + 2, yy, x + thick - 2, yy - 4), fill=rgb("#71a58b", 150))


def forest_layer(name: str) -> Image.Image:
    im = canvas()
    d = ImageDraw.Draw(im)
    if name == "far":
        for n, color in [(0, "#2e555b"), (1, "#34685f")]:
            points = [(x, 130 + n * 35 + int(math.sin(x / (41 - n * 8)) * 14) + int(math.sin(x / 17) * 5)) for x in range(-8, W + 9, 8)]
            poly(d, [(0, H), *points, (W, H)], rgb(color))
        # 复用 CC0 原图的树冠细节，重新配色为远景雾青色。
        source = Image.open(WOODS / "bg-trees.png").convert("RGBA")
        mask = source.getchannel("A")
        gray = ImageOps.grayscale(source)
        crown = ImageOps.colorize(gray, "#184d50", "#457765").convert("RGBA")
        crown.putalpha(mask)
        crown = crown.resize((200, 260), Image.Resampling.NEAREST)
        for xx in (-20, 180, 380):
            im.alpha_composite(crown, (xx, 2))
        d = ImageDraw.Draw(im)
        # 远处遗迹在树海间只露出上半部。
        for x, y in [(56, 180), (236, 164), (338, 191)]:
            ruin_arch(d, x, y, 32, 62, "#386865")
    elif name == "mid":
        for i, (x, y, h) in enumerate([(25, 256, 228), (112, 254, 177), (250, 255, 219), (350, 257, 170)]):
            tree(d, x, y, h, 70 + i)
        for x, y, w, h in [(145, 239, 49, 101), (285, 247, 43, 82)]:
            ruin_arch(d, x, y, w, h, "#2d5957", True)
        # 垂藤、断石和蕨叶使遗迹有自然侵蚀的年代感。
        rng = random.Random(91)
        for i in range(24):
            x, y = rng.randrange(W), rng.randrange(6, 64)
            length = rng.randrange(8, 37)
            d.line([(x, y), (x - 2, y + length // 2), (x + 1, y + length)], fill=rgb("#376a57"), width=1)
            for yy in range(y + 3, y + length, 6):
                d.line((x - 2, yy, x + 3, yy + 2), fill=rgb("#47775c"), width=2)
        for x in range(-4, W + 9, 12):
            y = 239 + int(math.sin(x / 32) * 6)
            d.ellipse((x, y, x + 15, y + 9), fill=rgb("#174345"))
    else:
        # 两侧枝叶框景，中间保持通透；所有层在玩法地形后面。
        for i, (x, y, h) in enumerate([(-7, 271, 268), (386, 270, 250)]):
            tree(d, x, y, h, 160 + i, True)
        for x in range(-15, W + 15, 37):
            if 72 < x < 295:
                continue
            for n in range(3):
                d.ellipse((x + n * 7 - 16, -17 + n * 3, x + n * 7 + 23, 12 + n * 4), fill=rgb(["#0b2833", "#10343c", "#153d43"][n]))
        rng = random.Random(323)
        for i in range(40):
            x, y = rng.randrange(W), rng.randrange(237, 257)
            d.line((x, y + 8, x + rng.randrange(-7, 8), y - rng.randrange(4, 15)), fill=rgb("#102f37"), width=2)
    return im


def crystal(d: ImageDraw.ImageDraw, x: int, y: int, height: int, width: int, color: str = "cyan", inverted: bool = False) -> None:
    palettes = {"cyan": ("#245675", "#498ca1", "#88d0c1", "#b5f0d5"), "violet": ("#3b396d", "#686699", "#a5a0c4", "#cec5dc"), "deep": ("#1a304e", "#30536d", "#43738b", "#6998a6")}
    dark, mid, light, glint = palettes[color]
    direction = 1 if inverted else -1
    tip = y + height * direction
    shoulder = y + int(height * .78) * direction
    poly(d, [(x - width // 2, y), (x - width // 2, shoulder), (x + width // 5, tip), (x + width // 2, shoulder + direction * 2), (x + width // 2, y)], rgb(mid))
    poly(d, [(x + width // 5, tip), (x + width // 2, shoulder + direction * 2), (x + width // 2, y), (x + 1, y)], rgb(dark))
    poly(d, [(x - width // 2, shoulder), (x + width // 5, tip), (x, shoulder), (x - 1, y), (x - width // 2, y)], rgb(light))
    d.line([(x + width // 5, tip + 2 * -direction), (x, shoulder), (x - 1, y)], fill=rgb(glint), width=1)
    d.line((x - width // 2, y - direction * 2, x + width // 2, y - direction * 2), fill=rgb(dark), width=1)


def cavern_layer(name: str) -> Image.Image:
    im = canvas()
    d = ImageDraw.Draw(im)
    rng = random.Random(451)
    if name == "far":
        # 洞壁两组矿脉与侵蚀拱洞，深处的洞腔仍保留层次。
        for k, c in [(0, "#172540"), (1, "#1c314b")]:
            ceiling = [(x, 40 + k * 12 + int(math.sin(x / 23) * 17) + int(math.sin(x / 7) * 5)) for x in range(0, W + 1, 4)]
            floor = [(x, 205 - k * 8 + int(math.sin(x / 43) * 15) + int(math.cos(x / 13) * 6)) for x in range(0, W + 1, 4)]
            poly(d, [(0, 0), *ceiling, (W, 0)], rgb(c))
            poly(d, [(0, H), *floor, (W, H)], rgb(c))
        for x in (7, 95, 227, 327):
            y = 231 + rng.randrange(-12, 12)
            crystal(d, x, y, rng.randrange(55, 110), rng.randrange(16, 30), "deep")
            crystal(d, x + 22, y + 4, rng.randrange(34, 65), 17, "deep")
        for x in range(-15, W, 67):
            d.arc((x, 50, x + 135, 254), 184, 354, fill=rgb("#29435a"), width=4)
            d.arc((x + 4, 56, x + 129, 251), 184, 354, fill=rgb("#20344f"), width=1)
        for i in range(50):
            x, y = rng.randrange(W), rng.choice((rng.randrange(16, 68), rng.randrange(210, 254)))
            d.line([(x, y), (x + 5, y + 2), (x + 13, y - 2)], fill=rgb("#32516a"), width=1)
    elif name == "mid":
        # 钟乳石顶与下方晶簇不会覆盖中央通道。
        top = [(x, 13 + rng.randrange(0, 15)) for x in range(0, W + 1, 8)]
        poly(d, [(0, 0), *top, (W, 0)], rgb("#101e36"))
        for x in range(-10, W + 16, 20):
            length = rng.randrange(17, 50)
            poly(d, [(x - 7, 16), (x + 10, 14), (x + 2, length)], rgb("#1b2e46"))
            d.line((x + 2, 20, x + 2, length - 3), fill=rgb("#30415b"))
        for i, (x, y, size) in enumerate([(28, 246, 72), (115, 265, 50), (236, 254, 87), (340, 264, 65)]):
            for offset, scale in [(-16, .54), (15, .65), (0, 1)]:
                crystal(d, x + offset, y + abs(offset) // 2, int(size * scale), int(20 * scale), "cyan" if i % 2 == 0 else "violet")
            d.ellipse((x - 26, y - 2, x + 29, y + 5), fill=rgb("#182b43"))
        for x in (72, 185, 310):
            crystal(d, x, 10, rng.randrange(22, 49), 11, "deep", True)
        # 裂缝有暗色边缘和细小晶光。
        for i in range(12):
            x = rng.randrange(W)
            y = rng.randrange(204, 250)
            points = [(x, y), (x + 7, y - 9), (x + 4, y - 15), (x + 10, y - 24)]
            d.line(points, fill=rgb("#0c1a31"), width=3)
            d.line(points, fill=rgb("#356a7c"), width=1)
    else:
        for x, size in [(-8, 83), (380, 65), (58, 23), (302, 20)]:
            poly(d, [(x - 19, 0), (x + 27, 0), (x + 13, size // 2), (x, size)], rgb("#0b172c"))
            d.line((x + 8, 2, x, size - 8), fill=rgb("#203b4e"), width=2)
        for x in range(-10, W + 15, 18):
            y = 251 + rng.randrange(-5, 6)
            poly(d, [(x, H), (x + 3, y - 13), (x + 8, y), (x + 20, y - 5), (x + 26, H)], rgb("#0c1b30"))
        for x in (-4, 382):
            crystal(d, x, 255, 81, 23, "deep")
    return im


def column(d: ImageDraw.ImageDraw, x: int, y: int, h: int, w: int, light: bool = False, broken: bool = False) -> None:
    base, highlight, shadow, gold = ("#8498ac", "#b8bdc0", "#536d88", "#b6a47c") if light else ("#536b8a", "#74859d", "#3d5579", "#9c947c")
    d.rectangle((x, y - h, x + w, y), fill=rgb(base))
    d.rectangle((x + 1, y - h + 1, x + 3, y - 2), fill=rgb(highlight))
    d.rectangle((x + w - 3, y - h, x + w, y), fill=rgb(shadow))
    for xx in range(x + 5, x + w - 3, 4):
        d.line((xx, y - h + 6, xx, y - 5), fill=rgb(shadow), width=1)
    for yy, ww in [(y, 3), (y - 3, 2), (y - h, 4), (y - h + 3, 2)]:
        d.rectangle((x - ww, yy, x + w + ww, yy + 2), fill=rgb(gold if yy == y - h else base))
    if broken:
        poly(d, [(x + 1, y - h), (x + w - 2, y - h), (x + w, y - h + 12), (x + 7, y - h + 8), (x + 3, y - h + 13)], TRANSPARENT)
    d.line([(x + w // 2, y - h + 15), (x + w // 2 + 3, y - h + 20), (x + w // 2 - 2, y - h + 27)], fill=rgb(shadow))


def floating_island(d: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int, light: bool = False) -> None:
    top, rock, shadow = ("#a8b2b8", "#4c6382", "#334d71") if light else ("#7b8fa6", "#3c5578", "#2c466a")
    poly(d, [(x - width // 2, y), (x + width // 2, y), (x + width // 3, y + 7), (x + width // 6, y + height), (x - width // 4, y + height // 2)], rgb(rock))
    poly(d, [(x + 5, y + 3), (x + width // 2, y), (x + width // 3, y + 7), (x + width // 6, y + height)], rgb(shadow))
    d.rectangle((x - width // 2, y - 2, x + width // 2, y + 1), fill=rgb(top))
    for off in (-width // 3, -width // 6, width // 5):
        d.line([(x + off, y + 5), (x + off + 4, y + 10), (x + off + 2, y + height // 2)], fill=rgb(shadow))


def temple_layer(name: str) -> Image.Image:
    im = canvas()
    d = ImageDraw.Draw(im)
    rng = random.Random(778)
    if name == "far":
        # 深远云海中的神殿群落；小型建筑轮廓提供尺度。
        for n, x in enumerate((36, 180, 322)):
            y = 165 + n % 2 * 31
            floating_island(d, x, y, 87 if n != 1 else 112, 35)
            for xx in range(x - 26, x + 32, 12):
                column(d, xx, y - 3, 36 + (n % 2) * 12, 5)
            poly(d, [(x - 39, y - 43 - n % 2 * 12), (x, y - 62 - n % 2 * 12), (x + 39, y - 43 - n % 2 * 12)], rgb("#71869e"))
            d.line((x - 39, y - 42 - n % 2 * 12, x + 39, y - 42 - n % 2 * 12), fill=rgb("#a69e8d"), width=2)
        for x, y in [(95, 86), (265, 55), (375, 114)]:
            floating_island(d, x, y, 20, 12)
        for i in range(8):
            cloud(d, i * 59 - 20, 211 + i % 3 * 11, 47, rgb("#65799c", 190))
            cloud(d, i * 59 - 17, 216 + i % 3 * 11, 39, rgb("#7e8ca8", 180))
    elif name == "mid":
        for x, y, width in [(55, 239, 114), (301, 228, 133)]:
            floating_island(d, x, y, width, 48, True)
            for n, xx in enumerate(range(x - 41, x + 43, 27)):
                column(d, xx, y - 4, 87 if n != 2 else 63, 11, True, n == 2)
            # 保留下方可见拱券，断口与石块各有独立轮廓。
            d.rectangle((x - 47, y - 96, x + 47, y - 88), fill=rgb("#8b9aac"))
            d.line((x - 47, y - 96, x + 47, y - 96), fill=rgb("#c2b48e"), width=2)
            for off in (-26, 1, 28):
                d.arc((x + off - 13, y - 88, x + off + 14, y - 55), 183, 357, fill=rgb("#a9b0b8"), width=3)
            poly(d, [(x + 13, y - 98), (x + 29, y - 98), (x + 22, y - 87), (x + 16, y - 89)], TRANSPARENT)
            for n in range(4):
                xx = x - 35 + n * 17
                d.line([(xx, y + 3), (xx + 1, y + 14), (xx - 3, y + 26 + n % 2 * 10)], fill=rgb("#557e8a"), width=1)
                d.line((xx - 3, y + 17, xx + 3, y + 20), fill=rgb("#739692"), width=2)
        # 单独悬浮的破损环门与远桥，空中感不同于洞穴和森林。
        d.arc((137, 73, 190, 139), 26, 330, fill=rgb("#8494aa"), width=5)
        d.arc((137, 73, 190, 139), 176, 270, fill=rgb("#c2b28f"), width=1)
        for x, y in [(158, 147), (169, 153), (153, 159)]:
            d.rectangle((x, y, x + 4, y + 3), fill=rgb("#7c8ba2"))
        for i in range(7):
            cloud(d, i * 65 - 13, 259 + i % 2 * 7, 45, rgb("#9ca1b5", 145))
    else:
        # 屏幕上缘少量悬垂建筑，底部两层云浪，中央路线不被遮挡。
        for x in (-13, 386):
            column(d, x, 80, 104, 14, False, True)
        d.rectangle((0, 0, 48, 6), fill=rgb("#374865"))
        d.rectangle((338, 0, W, 6), fill=rgb("#374865"))
        d.line((0, 7, 46, 7), fill=rgb("#77776e"), width=2)
        d.line((340, 7, W, 7), fill=rgb("#77776e"), width=2)
        for i in range(10):
            cloud(d, i * 43 - 14, 256 + int(math.sin(i) * 4), 35, rgb("#b1b2c3", 140))
        for i in range(8):
            x = rng.randrange(W)
            y = rng.randrange(230, 252)
            d.line((x, y, x + 16, y), fill=rgb("#ced0d7", 95), width=1)
    return im


def terrain_tile(region: str, row: int, edge: int) -> Image.Image:
    """32px 网格；顶面始终 y=0，视觉与 Arcade 的碰撞边沿保持一致。"""
    im = Image.new("RGBA", (32, 32), TRANSPARENT)
    d = ImageDraw.Draw(im)
    rng = random.Random(900 + row * 7 + edge)
    if region == "forest":
        if row == 3:
            d.rectangle((0, 0, 31, 9), fill=rgb("#694c3e"))
            d.rectangle((0, 0, 31, 2), fill=rgb("#baa16c"))
            d.line((0, 4, 31, 4), fill=rgb("#94704c"), width=2)
            d.line((0, 8, 31, 8), fill=rgb("#3a3937"), width=2)
            for x in (5, 20):
                d.line((x, 5, x + 6, 5), fill=rgb("#403e36"), width=1)
            if edge != 1:
                xx = 3 if edge == 0 else 27
                d.rectangle((xx, 2, xx + 2, 8), fill=rgb("#c0b388"))
                d.line((xx, 11, xx + (4 if edge == 0 else -4), 18), fill=rgb("#59493d"), width=3)
            return im
        d.rectangle((0, 0, 31, 31), fill=rgb("#514941"))
        for y, shift in [(5, 0), (19, 13)]:
            d.line((0, y, 31, y), fill=rgb("#323b3c"), width=2)
            for x in (shift - 9, shift + 17):
                d.line((x, y, x + 2, y + 13), fill=rgb("#323b3c"), width=2)
                d.line((x + 3, y + 2, x + 17, y + 2), fill=rgb("#706450"), width=2)
        for _ in range(8):
            x, y = rng.randrange(2, 29), rng.randrange(6, 30)
            d.rectangle((x, y, x + 2, y + 1), fill=rgb("#817259" if y % 2 else "#3c4140"))
        if row == 0:
            d.rectangle((0, 0, 31, 4), fill=rgb("#92b666"))
            d.line((0, 0, 31, 0), fill=rgb("#c7d78c"), width=2)
            for x in range(-2, 32, 6):
                poly(d, [(x, 4), (x + 3, 9 + x % 3), (x + 5, 4)], rgb("#58784d"))
                d.rectangle((x + 1, 2, x + 3, 4), fill=rgb("#739957"))
            for x in (9, 25):
                d.line([(x, 6), (x - 2, 12), (x + 2, 17)], fill=rgb("#8a7d51"), width=2)
        if edge != 1:
            xx = 0 if edge == 0 else 30
            d.rectangle((xx, 6 if row == 0 else 0, xx + 1, 31), fill=rgb("#273a39"))
    elif region == "cavern":
        if row == 3:
            poly(d, [(0, 0), (31, 0), (31, 5), (24, 10), (16, 8), (8, 12), (0, 7)], rgb("#36445e"))
            d.line((0, 0, 31, 0), fill=rgb("#a4d7d3"), width=2)
            d.line((0, 3, 31, 3), fill=rgb("#5e9faf"), width=2)
            for x in (8, 24):
                poly(d, [(x - 2, 6), (x + 4, 7), (x + 1, 17)], rgb("#4e8398"))
                d.line((x + 1, 8, x + 1, 14), fill=rgb("#88c8c7"))
            return im
        d.rectangle((0, 0, 31, 31), fill=rgb("#2d344c"))
        for pts, col in [([(0, 3), (13, 0), (22, 9), (13, 17), (0, 12)], "#3f4560"), ([(13, 17), (22, 9), (32, 14), (32, 29), (22, 32)], "#363c55"), ([(0, 12), (13, 17), (22, 32), (0, 32)], "#252e44")]:
            poly(d, pts, rgb(col))
        d.line([(0, 12), (12, 16), (20, 31)], fill=rgb("#1a263d"), width=2)
        d.line([(13, 1), (21, 9), (31, 13)], fill=rgb("#586078"), width=2)
        for x, y in [(8, 19), (10, 14), (15, 9)]:
            d.rectangle((x, y, x + 1, y + 3), fill=rgb("#579aaa"))
        if row == 0:
            d.rectangle((0, 0, 31, 2), fill=rgb("#9bc9cc"))
            d.line((0, 3, 31, 3), fill=rgb("#557e97"), width=2)
            for x in range(3, 32, 11):
                poly(d, [(x, 4), (x + 3, 4), (x + 1, 11)], rgb("#6ca6b5"))
        if edge != 1:
            xx = 0 if edge == 0 else 30
            d.line((xx, 4, xx, 31), fill=rgb("#17263e"), width=2)
    else:
        if row == 3:
            poly(d, [(0, 0), (31, 0), (31, 8), (25, 13), (5, 13), (0, 8)], rgb("#8a8c9c"))
            d.rectangle((0, 0, 31, 2), fill=rgb("#f3e6c5"))
            d.rectangle((0, 3, 31, 5), fill=rgb("#bba56e"))
            d.line((3, 8, 28, 8), fill=rgb("#d7c68d"), width=2)
            if edge == 1:
                poly(d, [(10, 10), (15, 16), (21, 10)], rgb("#b29b6b"))
            return im
        d.rectangle((0, 0, 31, 31), fill=rgb("#b3b4be"))
        d.rectangle((0, 0, 31, 2), fill=rgb("#d9d4cd"))
        d.line((0, 16, 31, 16), fill=rgb("#838998"), width=2)
        for x, y in [(10, 0), (25, 18)]:
            d.line((x, y, x, y + 14), fill=rgb("#838998"), width=2)
            d.line((x + 3, y + 3, min(31, x + 11), y + 3), fill=rgb("#d1cfd0"), width=1)
        d.line([(19, 7), (22, 11), (19, 14)], fill=rgb("#9292a0"), width=1)
        if row == 0:
            d.rectangle((0, 0, 31, 3), fill=rgb("#eee5cb"))
            d.rectangle((0, 4, 31, 6), fill=rgb("#c4ab73"))
            d.line((0, 7, 31, 7), fill=rgb("#716c7d"), width=1)
            for x in (5, 21):
                d.rectangle((x, 4, x + 2, 6), fill=rgb("#ead4a0"))
        if edge != 1:
            xx = 0 if edge == 0 else 29
            d.rectangle((xx, 7 if row == 0 else 0, xx + 2, 31), fill=rgb("#74788c"))
            if row == 0:
                d.rectangle((xx, 8, xx + 2, 11), fill=rgb("#c1a875"))
    return im


def tileset(region: str) -> Image.Image:
    # 保留所有未用到的原始图块，Tiled 后续编辑也不会破坏 GID 索引。
    if TERRAIN.exists():
        im = Image.open(TERRAIN).convert("RGBA").resize((704, 352), Image.Resampling.NEAREST)
    else:
        im = Image.open(ROOT / "public/assets/gen/terrain32.png").convert("RGBA")
    for row, indices in [(0, (6, 7, 8)), (1, (28, 29, 30)), (2, (50, 51, 52)), (3, (40, 41, 42))]:
        for edge, idx in enumerate(indices):
            im.paste(terrain_tile(region, row, edge), ((idx % 22) * 32, (idx // 22) * 32))
    return im


def motes(region: str) -> Image.Image:
    im = Image.new("RGBA", (128, 128), TRANSPARENT)
    d = ImageDraw.Draw(im)
    color = {"forest": "#b2d293", "cavern": "#80c6d2", "temple": "#ead6a9"}[region]
    rng = random.Random(450)
    for i in range(14):
        x, y = rng.randrange(3, 125), rng.randrange(3, 125)
        if i % 5 == 0:
            d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=rgb(color, 35))
        d.point((x, y), fill=rgb(color, 95 + i % 4 * 25))
    return im


def contact_sheet() -> None:
    """仅开发预览：三张代表图拼接，不加入运行时预加载。"""
    preview = Image.new("RGB", (1152, 256))
    for n, region in enumerate(("forest", "cavern", "temple")):
        base = sky(region, 0)
        for layer in ("far", "mid", "near"):
            draw = {"forest": forest_layer, "cavern": cavern_layer, "temple": temple_layer}[region](layer)
            base = Image.alpha_composite(base, draw)
        # 模拟屏幕内的可行走高台，帮助核对明暗和地形可辨性。
        for y in (213, 245):
            for i in range(6):
                tile = terrain_tile(region, 0 if y == 213 else 2, 0 if i == 0 else 2 if i == 5 else 1)
                base.alpha_composite(tile.resize((16, 16), Image.Resampling.NEAREST), (139 + i * 16, y))
        preview.paste(base.convert("RGB"), (n * W, 0))
    # 该预览留在 output，避免把开发比较图作为游戏资源分发。
    preview_dir = ROOT / "output/region-art"
    preview_dir.mkdir(parents=True, exist_ok=True)
    preview.resize((2304, 512), Image.Resampling.NEAREST).save(preview_dir / "regions-preview.png")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for region, layer_fn in [("forest", forest_layer), ("cavern", cavern_layer), ("temple", temple_layer)]:
        save(tileset(region), f"{region}_tiles.png", 1)
        for variant in range(4):
            save(sky(region, variant), f"{region}_sky_{variant}.png")
        for layer in ("far", "mid", "near"):
            save(layer_fn(layer), f"{region}_{layer}.png")
        save(motes(region), f"{region}_motes.png")
    contact_sheet()
    original = Image.open(TERRAIN if TERRAIN.exists() else ROOT / "public/assets/gen/terrain32.png").convert("RGBA")
    original = original.resize((704, 352), Image.Resampling.NEAREST)
    changed = {6, 7, 8, 28, 29, 30, 40, 41, 42, 50, 51, 52}
    size = 0
    for path in sorted(OUT.glob("*.png")):
        with Image.open(path) as im:
            expected = (704, 352) if "_tiles" in path.name else (512, 512) if "_motes" in path.name else (1536, 1024)
            assert im.size == expected, (path, im.size, expected)
            im = im.convert("RGBA")
            if "_sky_" in path.name:
                assert im.getchannel("A").getextrema() == (255, 255), path
            if "_tiles" in path.name:
                for i in range(242):
                    box = (i % 22 * 32, i // 22 * 32, i % 22 * 32 + 32, i // 22 * 32 + 32)
                    tile = im.crop(box)
                    if i in changed:
                        assert tile.getchannel("A").getbbox() is not None, (path, i)
                    else:
                        assert ImageChops.difference(tile, original.crop(box)).getbbox() is None, (path, i)
            size += path.stat().st_size
    print(f"校验通过：27 张 PNG，共 {size / 1024:.1f} KiB；天空不透明、图集 22×11 格、230 格保留原样。")


if __name__ == "__main__":
    main()
