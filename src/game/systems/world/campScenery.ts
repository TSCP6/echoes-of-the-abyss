import type { GameObjects, Scene } from 'phaser';
import { getCampPalette, type CampPalette } from '../../data/campPresentation';
import { bindViewportLayout, DESIGN_HEIGHT, DESIGN_WIDTH } from '../presentation/viewportLayout';

type Graphics = GameObjects.Graphics;

/** 用矩形阶梯保持像素边缘；不依赖滤镜、外链素材或渲染器特性。 */
function oval(g: Graphics, x: number, y: number, rx: number, ry: number, color: number, alpha = 1): void {
    g.fillStyle(color, alpha);
    for (let row = -ry; row < ry; row += 4) {
        const half = Math.round(Math.sqrt(Math.max(0, 1 - (row + 2) ** 2 / ry ** 2)) * rx / 4) * 4;
        g.fillRect(x - half, y + row, half * 2, 4);
    }
}

function crystal(g: Graphics, x: number, y: number, size: number, p: CampPalette): void {
    g.fillStyle(p.shadow, 0.8).fillRect(x - size / 2 - 4, y - size - 4, size + 8, size + 8);
    g.fillStyle(p.foliage).fillTriangle(x - size / 2, y, x - size / 2, y - size * 0.65, x + size / 2, y);
    g.fillStyle(p.foliageLight).fillTriangle(x - size / 2, y - size * 0.65, x, y - size * 1.5, x, y);
    g.fillStyle(p.portal).fillTriangle(x, y - size * 1.5, x + size / 2, y - size * 0.65, x, y);
    g.fillStyle(0xe8ffff, 0.75).fillRect(x - 2, y - size * 1.15, 4, size * 0.35);
}

function lantern(g: Graphics, x: number, y: number, p: CampPalette): void {
    oval(g, x, y + 4, 36, 32, 0xffcd77, 0.05);
    oval(g, x, y + 4, 22, 20, 0xffcd77, 0.08);
    g.fillStyle(p.shadow).fillRect(x - 3, y - 20, 6, 8).fillRect(x - 10, y - 10, 20, 28);
    g.fillStyle(0xffbf67).fillRect(x - 6, y - 6, 12, 20);
    g.fillStyle(0xffe7a0).fillRect(x - 3, y - 4, 6, 16);
    g.fillStyle(p.wood).fillRect(x - 12, y - 12, 24, 5).fillRect(x - 12, y + 16, 24, 5);
}

function drawGround(g: Graphics, regionId: 1 | 2 | 3, width: number, height: number, p: CampPalette): void {
    const left = (DESIGN_WIDTH - width) / 2;
    const bottom = (DESIGN_HEIGHT + height) / 2;
    const groundY = 566;
    g.clear().fillStyle(p.soil).fillRect(left, groundY, width, bottom - groundY);
    g.fillStyle(p.ground).fillRect(left, groundY, width, 122);
    g.fillStyle(p.edge).fillRect(left, groundY, width, 6);
    g.fillStyle(p.shadow, 0.45).fillRect(left, groundY + 10, width, 6);
    for (let x = Math.floor(left / 32) * 32; x < left + width; x += 32) {
        const seed = Math.abs(Math.round(x / 32));
        if (regionId === 1) {
            g.fillStyle(p.foliageLight).fillRect(x + seed % 9, 560 - seed % 3 * 3, 4, 12);
            g.fillStyle(p.foliage).fillRect(x + 9, 556 + seed % 4 * 3, 12, 10);
        } else {
            g.fillStyle(p.stoneLight, 0.45).fillRect(x, 568, 28, 4);
            g.fillStyle(p.shadow, 0.35).fillRect(x + 28, 570, 4, 20);
        }
    }
    // 设施之间的旧石路；断续石片比完整平台网格更像有人使用的休憩地。
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 11; col++) {
            const x = 172 + col * 62 + (row % 2) * 24;
            const y = 578 + row * 22;
            const w = 32 + (col * 7 + row * 11) % 24;
            g.fillStyle(p.shadow, 0.35).fillRect(x - 2, y + 5, w + 4, 12);
            g.fillStyle((col + row) % 3 === 0 ? p.stoneLight : p.stone, 0.65).fillRect(x, y, w, 10);
            g.fillStyle(p.edge, 0.3).fillRect(x + 3, y, w - 9, 2);
        }
    }
    // 视口向外扩展时延续地表细节，不露底色或截断边缘。
    for (let x = Math.floor(left / 80) * 80; x < left + width; x += 80) {
        const seed = Math.abs(x / 80);
        g.fillStyle(p.shadow, 0.22).fillRect(x + 12, 708 + seed % 3 * 12, 18, 4);
        g.fillStyle(p.stoneLight, 0.18).fillRect(x + 42, 682 + seed % 4 * 15, 10, 4);
        if (regionId === 1) {
            g.fillStyle(p.foliage, 0.75).fillRect(x, 654 + seed % 3 * 14, 4, 12).fillRect(x - 5, 661 + seed % 3 * 14, 14, 4);
        }
    }
}

function drawRegionLandmarks(g: Graphics, regionId: 1 | 2 | 3, p: CampPalette): void {
    if (regionId === 1) {
        // 近景树干与低垂枝叶围出安全空地。
        for (const [x, flip] of [[70, 1], [948, -1]]) {
            g.fillStyle(p.shadow).fillRect(x - 22, 248, 52, 322).fillRect(x - 38, 538, 92, 28);
            g.fillStyle(p.wood).fillRect(x - 12, 260, 24, 276);
            g.fillStyle(0x9a7950, 0.4).fillRect(x - 12, 282, 6, 230);
            g.fillStyle(p.shadow).fillRect(flip === 1 ? x + 12 : x - 84, 320, 72, 16);
            for (let i = 0; i < 6; i++) {
                oval(g, x + (i * 32 - 76) * flip, 252 - i % 3 * 24, 72, 40, i % 2 === 0 ? p.foliage : p.shadow);
                g.fillStyle(p.foliageLight, 0.65).fillRect(x + (i * 30 - 72) * flip, 228 - i % 3 * 24, 42, 8);
            }
            g.fillStyle(p.foliageLight).fillRect(x + 24 * flip, 350, 4, 108);
            for (let i = 0; i < 4; i++) {
                g.fillStyle(p.foliage).fillRect(x + 18 * flip, 360 + i * 24, 20, 8);
            }
        }
        for (const x of [116, 873]) {
            g.fillStyle(p.shadow).fillRect(x - 26, 548, 64, 18);
            g.fillStyle(p.foliage).fillTriangle(x - 34, 558, x - 12, 518, x, 558)
                .fillTriangle(x - 8, 558, x + 8, 508, x + 28, 558);
            g.fillStyle(p.foliageLight).fillRect(x - 6, 530, 4, 28);
        }
        g.fillStyle(0xbf9b72).fillRect(119, 537, 6, 22).fillRect(142, 549, 4, 13);
        g.fillStyle(0xc3735e).fillRect(109, 531, 26, 8).fillRect(134, 544, 20, 6);
    } else if (regionId === 2) {
        for (const x of [74, 938]) {
            g.fillStyle(p.shadow).fillRect(x - 40, 446, 80, 120).fillRect(x - 28, 410, 58, 46);
            g.fillStyle(p.stone).fillRect(x - 28, 454, 48, 94);
            crystal(g, x, 550, 48, p);
            crystal(g, x + 34, 562, 28, p);
            crystal(g, x - 34, 564, 22, p);
            oval(g, x, 552, 72, 18, p.portal, 0.08);
        }
        for (let i = 0; i < 9; i++) {
            const x = 40 + i * 118;
            g.fillStyle(p.shadow, 0.7).fillTriangle(x, 266, x + 22, 336 + i % 3 * 25, x + 50, 266);
            g.fillStyle(p.stone, 0.4).fillTriangle(x + 6, 266, x + 22, 320 + i % 3 * 25, x + 22, 266);
        }
        // 水晶洞里的浅池与反光。
        oval(g, 534, 635, 102, 19, 0x284d65, 0.7);
        g.fillStyle(p.portal, 0.35).fillRect(472, 633, 44, 3).fillRect(549, 640, 54, 3);
    } else {
        // 残柱仍保留神殿的金色接缝，碎石与云海形成前后层次。
        for (const [x, h] of [[74, 218], [950, 262]]) {
            g.fillStyle(p.shadow, 0.6).fillRect(x - 40, 554, 84, 16);
            g.fillStyle(p.stone).fillRect(x - 24, 554 - h, 48, h);
            g.fillStyle(p.stoneLight).fillRect(x - 24, 554 - h, 10, h).fillRect(x - 36, 554 - h, 72, 16)
                .fillRect(x - 36, 542, 72, 16);
            g.fillStyle(p.shadow, 0.35).fillRect(x + 12, 572 - h, 10, h - 30);
            g.fillStyle(p.accent).fillRect(x - 36, 565 - h, 72, 4).fillRect(x - 36, 546, 72, 4);
            g.fillStyle(p.shadow, 0.65).fillRect(x - 11, 480 - h / 2, 20, 4).fillRect(x + 5, 476 - h / 2, 4, 20);
        }
        for (const x of [145, 865]) {
            g.fillStyle(p.wood).fillRect(x, 390, 6, 170);
            g.fillStyle(p.cloth).fillRect(x + 6, 396, 42, 56).fillTriangle(x + 6, 452, x + 48, 452, x + 6, 478);
            g.fillStyle(p.accent).fillRect(x + 12, 404, 6, 38).fillRect(x + 12, 418, 25, 6);
            g.fillStyle(p.stoneLight).fillRect(x - 10, 552, 26, 12);
        }
    }
}

function drawStall(g: Graphics, p: CampPalette): void {
    const x = 276;
    oval(g, x, 564, 133, 15, p.shadow, 0.5);
    // 背包、木箱与被货物填满的摊位。
    g.fillStyle(p.shadow).fillRect(x - 128, 514, 42, 48).fillRect(x + 90, 523, 42, 39);
    g.fillStyle(p.wood).fillRect(x - 124, 518, 34, 40).fillRect(x + 94, 527, 34, 31);
    g.lineStyle(3, p.clothLight, 0.5).strokeRect(x - 120, 522, 26, 32).strokeRect(x + 98, 531, 26, 23);
    g.fillStyle(p.clothLight, 0.6).fillRect(x - 121, 537, 26, 4).fillRect(x + 109, 530, 4, 25);
    g.fillStyle(p.shadow).fillRect(x - 104, 392, 10, 172).fillRect(x + 94, 392, 10, 172);
    g.fillStyle(p.wood).fillRect(x - 100, 396, 5, 162).fillRect(x + 95, 396, 5, 162);
    g.fillStyle(p.shadow).fillRect(x - 118, 385, 236, 16).fillRect(x - 106, 373, 212, 20).fillRect(x - 90, 365, 180, 12);
    g.fillStyle(p.cloth).fillRect(x - 110, 389, 220, 34).fillRect(x - 98, 377, 196, 16).fillRect(x - 82, 369, 164, 12);
    for (let i = 0; i < 7; i++) {
        const bx = x - 105 + i * 32;
        g.fillStyle(i % 2 === 0 ? p.clothLight : p.cloth).fillRect(bx, 392, 28, 34).fillRect(bx + 4, 426, 20, 8);
    }
    g.fillStyle(p.accent, 0.6).fillRect(x - 100, 383, 200, 4);
    // 有轮廓的兜帽商人，放在柜台后，不再复用敌人占位图。
    g.fillStyle(p.shadow).fillRect(x + 1, 431, 46, 58).fillRect(x - 8, 480, 65, 43);
    g.fillStyle(p.cloth).fillRect(x + 7, 435, 34, 56).fillRect(x - 3, 483, 54, 32);
    g.fillStyle(p.clothLight).fillRect(x + 7, 435, 9, 46).fillRect(x + 4, 484, 8, 30);
    g.fillStyle(0xc8916f).fillRect(x + 16, 453, 23, 24);
    g.fillStyle(p.shadow).fillRect(x + 17, 453, 24, 5).fillRect(x + 20, 462, 4, 4).fillRect(x + 33, 462, 4, 4);
    g.fillStyle(0xe4d5bd).fillRect(x + 20, 472, 17, 13).fillRect(x + 24, 485, 9, 5);
    g.fillStyle(p.accent).fillRect(x + 21, 495, 8, 8);
    g.fillStyle(p.shadow).fillRect(x - 93, 511, 186, 49).fillRect(x - 101, 506, 202, 10);
    g.fillStyle(p.wood).fillRect(x - 89, 520, 178, 36);
    g.fillStyle(p.clothLight, 0.5).fillRect(x - 96, 508, 192, 4).fillRect(x - 84, 522, 168, 4);
    g.fillStyle(p.cloth).fillRect(x - 33, 517, 66, 40);
    g.fillStyle(p.accent).fillRect(x - 3, 527, 6, 20).fillRect(x - 10, 534, 20, 6);
    // 药水、箭束、硬币与皮袋直接说明可购买的物资。
    for (const [bx, color, h] of [[-73, 0xba706b, 23], [-48, 0x7bb6b8, 30], [-23, 0xa9bb69, 19]]) {
        g.fillStyle(p.shadow).fillRect(x + bx - 8, 506 - h, 18, h);
        g.fillStyle(color).fillRect(x + bx - 4, 510 - h, 10, h - 6);
        g.fillStyle(0xd4bb90).fillRect(x + bx - 3, 502 - h, 8, 5);
        g.fillStyle(0xffffff, 0.5).fillRect(x + bx - 2, 513 - h, 3, 7);
    }
    for (let i = 0; i < 5; i++) {
        g.fillStyle(0xceb48a).fillRect(x + 57 + i * 5, 478 + i % 2 * 3, 3, 27);
        g.fillStyle(0xdde2d4).fillTriangle(x + 55 + i * 5, 480, x + 58 + i * 5, 472, x + 61 + i * 5, 480);
    }
    g.fillStyle(0xd6ad65).fillRect(x + 34, 502, 11, 4).fillRect(x + 38, 498, 9, 4);
    lantern(g, x - 92, 455, p);
}

function drawPortal(g: Graphics, p: CampPalette): void {
    const x = 758;
    oval(g, x, 565, 100, 18, p.shadow, 0.55);
    oval(g, x, 557, 86, 15, p.portal, 0.12);
    g.fillStyle(p.shadow).fillRect(x - 83, 548, 166, 17);
    g.fillStyle(p.stone).fillRect(x - 79, 548, 158, 10).fillRect(x - 68, 535, 136, 13);
    g.fillStyle(p.stoneLight).fillRect(x - 76, 546, 152, 4).fillRect(x - 64, 534, 128, 4);
    // 门洞为阶梯弧线：厚石框、错缝砌块、内侧发光刻线。
    oval(g, x, 468, 68, 82, p.shadow);
    oval(g, x, 468, 60, 78, p.stone);
    oval(g, x, 470, 43, 64, p.shadow);
    g.fillStyle(p.stone).fillRect(x - 64, 462, 24, 80).fillRect(x + 40, 462, 24, 80);
    g.fillStyle(p.stoneLight).fillRect(x - 60, 459, 5, 79).fillRect(x + 43, 459, 5, 79);
    for (let row = 0; row < 4; row++) {
        const y = 462 + row * 22;
        g.fillStyle(p.shadow, 0.65).fillRect(x - 62, y, 22, 4).fillRect(x + 41, y + 8, 23, 4);
        g.fillStyle(p.portal).fillRect(x - 54, y + 9, 8, 3).fillRect(x + 48, y + 16, 8, 3);
    }
    for (const dx of [-32, 0, 32]) {
        const y = dx === 0 ? 389 : 401;
        g.fillStyle(p.shadow).fillRect(x + dx - 9, y, 18, 22);
        g.fillStyle(p.portal).fillRect(x + dx - 3, y + 5, 6, 10);
        g.fillStyle(p.stoneLight).fillRect(x + dx - 7, y, 14, 3);
    }
    g.fillStyle(p.accent).fillRect(x - 8, 382, 16, 5).fillRect(x - 4, 375, 8, 7);
}

function drawFireBase(g: Graphics, p: CampPalette): void {
    oval(g, 527, 566, 85, 19, 0xffb45e, 0.04);
    oval(g, 527, 562, 60, 15, 0xffb45e, 0.07);
    oval(g, 527, 558, 37, 10, p.shadow, 0.85);
    for (let i = 0; i < 9; i++) {
        const angle = i / 9 * Math.PI * 2;
        const x = 527 + Math.round(Math.cos(angle) * 35 / 2) * 2;
        const y = 557 + Math.round(Math.sin(angle) * 9 / 2) * 2;
        g.fillStyle(p.shadow).fillRect(x - 7, y - 5, 17, 12);
        g.fillStyle(i < 4 ? p.stoneLight : p.stone).fillRect(x - 5, y - 5, 13, 8);
    }
    g.fillStyle(0x583b2e).fillRect(504, 550, 42, 8).fillRect(513, 544, 29, 9);
    g.fillStyle(0x9f6040).fillRect(506, 550, 8, 7).fillRect(535, 545, 7, 6);
    // 一侧的铺盖和行囊给中央篝火明确的宿营用途。
    g.fillStyle(p.shadow).fillRect(400, 553, 61, 14).fillRect(576, 531, 28, 33);
    g.fillStyle(p.cloth).fillRect(403, 549, 52, 12).fillRect(580, 530, 20, 29);
    g.fillStyle(p.clothLight).fillRect(407, 549, 10, 12).fillRect(580, 535, 20, 5);
    g.fillStyle(p.wood).fillRect(585, 527, 10, 5).fillRect(587, 547, 6, 5);
}

export interface CampScenery { update(time: number): void; destroy(): void }

/** 营地专用近景与微动；外部只需逐帧 tick，没有独立计时器或全局纹理。 */
export function createCampScenery(scene: Scene, regionId: 1 | 2 | 3): CampScenery {
    const p = getCampPalette(regionId);
    const ground = scene.add.graphics().setDepth(-5).setName('camp-ground');
    bindViewportLayout(scene, (width, height) => drawGround(ground, regionId, width, height, p));
    const landmarks = scene.add.graphics().setDepth(-3).setName('camp-landmarks');
    drawRegionLandmarks(landmarks, regionId, p);
    const fixtures = scene.add.graphics().setDepth(3).setName('camp-facilities');
    drawStall(fixtures, p);
    drawPortal(fixtures, p);
    drawFireBase(fixtures, p);
    const motion = scene.add.graphics().setDepth(4).setName('camp-fire-and-portal-light');
    let destroyed = false;
    let lastFrame = -1;
    return {
        update(time): void {
            if (destroyed) { return; }
            const frame = Math.floor(time / 110);
            if (frame === lastFrame) { return; }
            lastFrame = frame;
            motion.clear();
            oval(motion, 758, 477, 39, 59, p.portal, 0.09 + frame % 4 * 0.015);
            for (let i = 0; i < 7; i++) {
                const y = 430 + (i * 16 + frame * 3) % 92;
                const x = 758 + Math.round(Math.sin(i * 2 + frame / 7) * 24 / 2) * 2;
                motion.fillStyle(p.portal, 0.25 + i % 3 * 0.12).fillRect(x, y, 4, 7);
            }
            // 分层像素火焰和向上散开的火星。
            oval(motion, 527, 546, 32, 24, 0xffc36b, 0.08);
            motion.fillStyle(0xb84d36).fillRect(510, 530, 34, 19).fillRect(516, 515 - frame % 3 * 3, 20, 24);
            motion.fillStyle(0xf08b43).fillRect(514, 527, 26, 21).fillRect(520, 507 + frame % 4 * 3, 10, 31);
            motion.fillStyle(0xffca64).fillRect(519, 529, 16, 19).fillRect(524, 520 - frame % 2 * 5, 9, 21);
            motion.fillStyle(0xffe7a2).fillRect(523, 537, 9, 11);
            for (let i = 0; i < 4; i++) {
                const rise = (frame * 4 + i * 17) % 58;
                motion.fillStyle(0xffd88c, (1 - rise / 64) * 0.7).fillRect(517 + i * 6 + Math.floor(rise / 18) % 2 * 4, 519 - rise, 3, 3);
            }
            // 森林萤火 / 洞穴晶尘 / 高空光屑，数量固定且随场景销毁。
            for (let i = 0; i < 16; i++) {
                const x = 104 + i * 53 + Math.round(Math.sin(frame / 26 + i) * 12 / 2) * 2;
                const y = 302 + (i * 67 + Math.floor(frame / 3)) % 220;
                const alpha = 0.12 + (Math.sin(frame / 7 + i * 1.7) + 1) * 0.15;
                motion.fillStyle(p.portal, alpha).fillRect(x, y, i % 3 === 0 ? 4 : 2, 2);
            }
        },
        destroy(): void {
            destroyed = true;
            ground.destroy(); landmarks.destroy(); fixtures.destroy(); motion.destroy();
        }
    };
}
