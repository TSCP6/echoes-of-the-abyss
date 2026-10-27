import { Scenes, type GameObjects, type Scene } from 'phaser';
import type { RegionId } from '../data/regionThemes';
import type { LevelContext } from './levelLoader';

type Graphics = GameObjects.Graphics;
type Point = readonly [number, number];

function polygon(g: Graphics, points: readonly Point[], color: number, alpha = 1): void {
    g.fillStyle(color, alpha).beginPath();
    points.forEach(([x, y], index) => { if (index === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); } });
    g.closePath().fillPath();
}

/** 静态阶梯椭圆，保持与区域贴图相同的像素边缘。 */
function oval(g: Graphics, x: number, y: number, rx: number, ry: number, color: number, alpha = 1): void {
    g.fillStyle(color, alpha);
    for (let row = -ry; row < ry; row += 4) {
        const half = Math.floor(Math.sqrt(Math.max(0, 1 - (row + 2) ** 2 / ry ** 2)) * rx / 4) * 4;
        if (half > 0) { g.fillRect(x - half, y + row, half * 2, 4); }
    }
}

function ring(g: Graphics, x: number, y: number, rx: number, ry: number, color: number, alpha: number, width = 2, start = 0, end = Math.PI * 2): void {
    g.lineStyle(width, color, alpha);
    const segments = Math.ceil((end - start) * 12);
    let prevX = x + Math.cos(start) * rx;
    let prevY = y + Math.sin(start) * ry;
    for (let i = 1; i <= segments; i++) {
        const a = start + (end - start) * i / segments;
        const px = Math.round((x + Math.cos(a) * rx) / 2) * 2;
        const py = Math.round((y + Math.sin(a) * ry) / 2) * 2;
        g.lineBetween(prevX, prevY, px, py);
        prevX = px; prevY = py;
    }
}

function forestArch(g: Graphics, x: number, floor: number, scale: number): void {
    // 古树的粗壮根部与枝冠围住石拱；低对比暗色不能误认成跳跃平台。
    for (const side of [-1, 1]) {
        const tx = x + side * 326 * scale;
        const y = floor;
        polygon(g, [[tx - 72 * scale, y + 8], [tx - 24 * scale, y - 84 * scale],
            [tx - 28 * scale, y - 322 * scale], [tx - 5 * scale, y - 470 * scale],
            [tx + 28 * scale, y - 486 * scale], [tx + 35 * scale, y - 288 * scale],
            [tx + 32 * scale, y - 92 * scale], [tx + 100 * scale, y + 8]], 0x15383d, 0.92);
        g.lineStyle(8 * scale, 0x32514a, 0.6)
            .lineBetween(tx - 8 * scale, y - 28 * scale, tx + 4 * scale, y - 382 * scale);
        for (let i = 0; i < 5; i++) {
            const by = y - (240 + i * 43) * scale;
            const bx = tx - side * (74 + i * 14) * scale;
            g.lineStyle((17 - i * 2) * scale, 0x183d40, 0.95)
                .lineBetween(tx, by + 32 * scale, bx, by);
            oval(g, bx, by - 10 * scale, (64 + i * 4) * scale, 24 * scale, i % 2 === 0 ? 0x284f49 : 0x20473f, 0.85);
            for (let n = 0; n < 5; n++) {
                g.fillStyle(0x496848, 0.3).fillRect(bx - 35 * scale + n * 15 * scale, by - 18 * scale + n % 2 * 6 * scale, 12 * scale, 4 * scale);
            }
        }
        // 垂藤从树冠自然下垂，结束在实际地面上方。
        for (let i = 0; i < 3; i++) {
            const vx = tx - side * (52 + i * 39) * scale;
            const top = floor - (395 + i * 12) * scale;
            const length = (110 + i * 32) * scale;
            g.lineStyle(2 * scale, 0x527255, 0.38).lineBetween(vx, top, vx - side * 7 * scale, top + length);
            for (let j = 0; j < 5; j++) {
                g.fillStyle(0x5c7756, 0.32).fillRect(vx - 5 * scale, top + j * length / 5, 11 * scale, 4 * scale);
            }
        }
    }
    const archY = floor - 224 * scale;
    ring(g, x, archY, 202 * scale, 176 * scale, 0x426257, 0.66, 25 * scale, Math.PI, Math.PI * 2);
    ring(g, x, archY, 187 * scale, 161 * scale, 0x71927a, 0.24, 3 * scale, Math.PI, Math.PI * 2);
    for (const side of [-1, 1]) {
        const px = x + side * 202 * scale;
        g.fillStyle(0x3c5a50, 0.72).fillRect(px - 13 * scale, archY, 26 * scale, floor - archY + 10);
        for (let row = 0; row < 6; row++) {
            g.fillStyle(0x203f40, 0.7).fillRect(px - 13 * scale, archY + row * 36 * scale, 26 * scale, 4 * scale);
            g.lineStyle(2 * scale, 0x9ab78a, 0.38)
                .lineBetween(px - 4 * scale, archY + (17 + row * 36) * scale, px + 5 * scale, archY + (10 + row * 36) * scale);
        }
    }
    for (let i = 0; i < 7; i++) {
        const a = Math.PI + Math.PI * (i + 1) / 8;
        const px = x + Math.cos(a) * 202 * scale;
        const py = archY + Math.sin(a) * 176 * scale;
        g.lineStyle(2 * scale, 0x254440, 0.6)
            .lineBetween(px - Math.cos(a) * 12 * scale, py - Math.sin(a) * 12 * scale,
                px + Math.cos(a) * 12 * scale, py + Math.sin(a) * 12 * scale);
    }
}

function crystal(g: Graphics, x: number, floor: number, height: number, width: number, violet = false): void {
    const tip = floor - height;
    polygon(g, [[x - width / 2, floor], [x - width / 2, tip + height * 0.24], [x + width * 0.12, tip], [x + width / 2, tip + height * 0.2], [x + width / 2, floor]], violet ? 0x4d416b : 0x285169, 0.72);
    polygon(g, [[x - width / 2, tip + height * 0.24], [x + width * 0.12, tip], [x - width * 0.08, floor], [x - width / 2, floor]], violet ? 0x766288 : 0x4c8791, 0.47);
    g.lineStyle(2, violet ? 0xb096bb : 0x83bec2, 0.36)
        .lineBetween(x + width * 0.12, tip + 5, x - width * 0.08, floor - 8);
}

function spiderNest(g: Graphics, x: number, floor: number, scale: number): void {
    const cy = floor - 272 * scale;
    // 不用填充的网心保留中央动作空间，蛛丝只占细线。
    const spokes = 14;
    for (let i = 0; i < spokes; i++) {
        const a = i / spokes * Math.PI * 2;
        const radius = 0.9 + i % 3 * 0.05;
        g.lineStyle(2 * scale, 0x8095b5, 0.22).lineBetween(x, cy,
            x + Math.cos(a) * 444 * scale * radius, cy + Math.sin(a) * 230 * scale * radius);
    }
    for (let ringIndex = 1; ringIndex <= 5; ringIndex++) {
        const r = ringIndex / 5;
        for (let i = 0; i < spokes; i++) {
            const a = i / spokes * Math.PI * 2;
            const b = (i + 1) / spokes * Math.PI * 2;
            const ax = x + Math.cos(a) * 414 * scale * r;
            const ay = cy + Math.sin(a) * 218 * scale * r;
            const bx = x + Math.cos(b) * 414 * scale * r;
            const by = cy + Math.sin(b) * 218 * scale * r;
            const mx = (ax + bx) / 2 - Math.cos((a + b) / 2) * 7 * scale;
            const my = (ay + by) / 2 - Math.sin((a + b) / 2) * 7 * scale;
            g.lineStyle(1.5 * scale, 0x8197b4, 0.18).lineBetween(ax, ay, mx, my).lineBetween(mx, my, bx, by);
        }
    }
    for (const side of [-1, 1]) {
        const px = x + side * 402 * scale;
        crystal(g, px, floor + 6, 224 * scale, 62 * scale, side === 1);
        crystal(g, px - side * 54 * scale, floor + 9, 134 * scale, 42 * scale, side !== 1);
        crystal(g, px + side * 42 * scale, floor + 9, 104 * scale, 33 * scale);
        const cocoonX = x + side * 275 * scale;
        const cocoonY = floor - (side === 1 ? 352 : 316) * scale;
        g.lineStyle(2 * scale, 0x99a7ba, 0.3).lineBetween(cocoonX, floor - 500 * scale, cocoonX, cocoonY);
        oval(g, cocoonX, cocoonY, 18 * scale, 36 * scale, 0x76869d, 0.31);
        for (let i = 0; i < 5; i++) {
            g.lineStyle(2 * scale, 0xadb4c7, 0.22)
                .lineBetween(cocoonX - 12 * scale, cocoonY - 18 * scale + i * 9 * scale,
                    cocoonX + 12 * scale, cocoonY - 11 * scale + i * 9 * scale);
        }
    }
}

function templeColumn(g: Graphics, x: number, floor: number, height: number, scale: number, broken: boolean): void {
    const w = 40 * scale;
    const top = floor - height;
    g.fillStyle(0x4b5b7a, 0.65).fillRect(x - w / 2, top, w, height + 8);
    g.fillStyle(0x8e99ae, 0.29).fillRect(x - w / 2 + 4 * scale, top + 4, 6 * scale, height - 4);
    for (let i = 0; i < 3; i++) {
        g.fillStyle(0x273d63, 0.44).fillRect(x - 5 * scale + i * 9 * scale, top + 18 * scale, 3 * scale, height - 24 * scale);
    }
    g.fillStyle(0x6e7d98, 0.58).fillRect(x - 34 * scale, top, 68 * scale, 12 * scale);
    g.fillStyle(0xb3a98c, 0.34).fillRect(x - 34 * scale, top + 12 * scale, 68 * scale, 3 * scale);
    g.fillStyle(0x566b8a, 0.68).fillRect(x - 32 * scale, floor - 12 * scale, 64 * scale, 12 * scale);
    if (broken) {
        polygon(g, [[x - 19 * scale, top], [x - 5 * scale, top - 14 * scale], [x + 7 * scale, top + 2 * scale], [x + 22 * scale, top - 6 * scale], [x + 23 * scale, top]], 0x71809b, 0.52);
    } else {
        g.fillStyle(0x6d7d98, 0.56).fillRect(x - 27 * scale, top - 10 * scale, 54 * scale, 10 * scale);
    }
}

function starSanctuary(g: Graphics, x: number, floor: number, scale: number): void {
    const cy = floor - 308 * scale;
    ring(g, x, cy, 156 * scale, 156 * scale, 0xb7ad91, 0.36, 3 * scale);
    ring(g, x, cy, 143 * scale, 143 * scale, 0x8b9dbe, 0.27, 2 * scale);
    ring(g, x, cy, 171 * scale, 61 * scale, 0x7e94ba, 0.2, 2 * scale);
    for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const px = x + Math.cos(a) * 156 * scale;
        const py = cy + Math.sin(a) * 156 * scale;
        g.lineStyle(3 * scale, 0xd2bc91, 0.42).lineBetween(px - Math.cos(a) * 7 * scale,
            py - Math.sin(a) * 7 * scale, px + Math.cos(a) * 7 * scale, py + Math.sin(a) * 7 * scale);
    }
    // 星环内部悬空，不画跨越战场的横向台面。
    const star: Point[] = [];
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = (i % 2 === 0 ? 67 : 27) * scale;
        star.push([x + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    g.lineStyle(2 * scale, 0xb7c0cf, 0.3).beginPath();
    star.forEach(([px, py], index) => { if (index === 0) { g.moveTo(px, py); } else { g.lineTo(px, py); } });
    g.closePath().strokePath();
    for (const side of [-1, 1]) {
        templeColumn(g, x + side * 425 * scale, floor, 443 * scale, scale, false);
        templeColumn(g, x + side * 295 * scale, floor, 316 * scale, scale, true);
        const bx = x + side * 425 * scale;
        polygon(g, [[bx - 17 * scale, floor - 388 * scale], [bx + 17 * scale, floor - 388 * scale],
            [bx + 17 * scale, floor - 242 * scale], [bx, floor - 260 * scale], [bx - 17 * scale, floor - 242 * scale]], 0x4b3f66, 0.6);
        g.lineStyle(2 * scale, 0xb5a087, 0.33)
            .lineBetween(bx, floor - 376 * scale, bx, floor - 279 * scale);
    }
}

export interface LevelScenery { destroy(): void }

/**
 * 依据真实死亡面和 Boss 战场绘制环境。纯呈现，不注册碰撞、输入或逐帧重绘。
 * 场景关闭时自动回收；显式 destroy 也安全。
 */
export function createLevelScenery(scene: Scene, ctx: LevelContext, regionId: RegionId): LevelScenery {
    const art = scene.add.graphics().setDepth(-18).setName('level-scenery-landmarks');
    const animated: Array<GameObjects.Graphics | GameObjects.Rectangle> = [];
    let disposed = false;
    for (const hazard of ctx.hazards) {
        // 跳出地图的兜底面没有地表含义，不把整张地图底部绘成熔岩或荆棘。
        const bottomPlane = hazard.y >= ctx.mapHeight - 64 && hazard.width >= ctx.mapWidth * 0.8;
        if (bottomPlane || hazard.width <= 0 || hazard.height <= 0) { continue; }
        const { x, y, width, height } = hazard;
        if (regionId === 2 && ctx.levelId === '2-2') {
            art.fillStyle(0x451b2a, 0.92).fillRect(x, y, width, height);
            art.fillStyle(0x7e2e30, 0.88).fillRect(x, y + 4, width, Math.max(0, Math.min(37, height - 4)));
            // 橙色起伏薄边精确标记 death_plane.top，危害像液体，不能误认成石台。
            art.fillStyle(0xf39742, 0.95).fillRect(x, y, width, 3);
            for (let offset = 0; offset < width; offset += 24) {
                const span = Math.min(24, width - offset);
                art.fillStyle(offset % 48 === 0 ? 0xffca66 : 0xcb5734, 0.9)
                    .fillRect(x + offset, y + 3, span, offset % 48 === 0 ? 3 : 6);
            }
            for (let offset = 13; offset < width - 24; offset += 43) {
                const yy = y + 20 + offset % 5 * 12;
                if (yy + 12 >= y + height) { continue; }
                polygon(art, [[x + offset - 8, yy], [x + offset + 9, yy - 3], [x + offset + 18, yy + 5],
                    [x + offset + 5, yy + 12], [x + offset - 12, yy + 7]], 0x3e2731, 0.7);
                art.fillStyle(0xb64f35, 0.45).fillRect(x + offset - 6, yy + 12, 15, 2);
            }
            const glow = scene.add.graphics().setDepth(-17).setName('level-scenery-lava-glow');
            glow.fillStyle(0xfda34b, 0.08).fillRect(x, y - 12, width, 24);
            glow.fillStyle(0xffb65c, 0.14).fillRect(x, y - 4, width, 12);
            glow.setAlpha(0.65);
            animated.push(glow);
            scene.tweens.add({ targets: glow, alpha: 1, duration: 1700, yoyo: true, repeat: -1 });
            // 每段固定两颗火星；没有粒子池增长或新增计时器。
            for (let i = 0; i < 2; i++) {
                const spark = scene.add.rectangle(x + width * (0.3 + i * 0.4), y + 4, 3, 4, 0xffc97a, 0.6)
                    .setDepth(-17).setName('level-scenery-lava-spark');
                animated.push(spark);
                scene.tweens.add({ targets: spark, y: y - 24 - i * 9, alpha: 0, duration: 1450 + i * 420,
                    delay: i * 530, repeatDelay: 400, repeat: -1 });
            }
        } else if (regionId === 1) {
            // 荆棘全部位于危险区内，尖端不会越过可通行的坑缘。
            for (let offset = 8; offset < width - 16; offset += 26) {
                const bx = x + offset;
                const tipY = y + 6 + offset % 4 * 3;
                polygon(art, [[bx - 6, y + Math.min(height, 63)], [bx - 2, tipY + 23], [bx + 2, tipY],
                    [bx + 5, tipY + 21], [bx + 10, y + Math.min(height, 63)]], 0x2a3539, 0.9);
                art.lineStyle(2, 0x61734e, 0.58).lineBetween(bx + 2, tipY + 5, bx + 1, tipY + 32);
                art.lineStyle(3, 0x344c40, 0.8).lineBetween(bx + 2, tipY + 26, bx + 12, tipY + 17);
            }
        }
    }

    if (ctx.bossArena !== null) {
        const arena = ctx.bossArena;
        const center = arena.centerX;
        const floor = arena.bottom;
        const scale = Math.min(1, arena.width / 1120, arena.height / 530);
        if (regionId === 1) { forestArch(art, center, floor, scale); }
        else if (regionId === 2) { spiderNest(art, center, floor, scale); }
        else { starSanctuary(art, center, floor, scale); }
    }

    const destroy = (): void => {
        if (disposed) { return; }
        disposed = true;
        scene.events.off(Scenes.Events.SHUTDOWN, destroy);
        for (const object of animated) {
            scene.tweens.killTweensOf(object);
            object.destroy();
        }
        art.destroy();
    };
    scene.events.once(Scenes.Events.SHUTDOWN, destroy);
    return { destroy };
}
