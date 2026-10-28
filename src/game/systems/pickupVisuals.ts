import type { Scene } from 'phaser';

export const PICKUP_TEXTURES = { coin: 'pickup_coin', skillShard: 'pickup_skill_shard', chest: 'pickup_chest', chestOpen: 'pickup_chest_open', loot: 'pickup_loot' } as const;

/** 原生几何纹理：金币的圆形轮廓与技能碎片的棱角独立于颜色。 */
export function registerPickupTextures(scene: Scene): void {
    for (const opened of [false, true]) {
        const key = opened ? PICKUP_TEXTURES.chestOpen : PICKUP_TEXTURES.chest;
        if (scene.textures.exists(key)) { continue; }
        const g = scene.make.graphics();
        g.fillStyle(0x172330); g.fillRect(2, 8, 44, 30);
        g.fillStyle(0x9b612c); g.fillRect(5, 12, 38, 23);
        g.fillStyle(0xf3cf72); g.fillRect(9, 12, 5, 23); g.fillRect(34, 12, 5, 23);
        g.fillStyle(opened ? 0x271b2b : 0xc3843e); g.fillRect(5, opened ? 15 : 8, 38, 12);
        g.lineStyle(2, 0xf3cf72); g.strokeRect(4, opened ? 1 : 7, 40, opened ? 10 : 15);
        g.fillStyle(0xe9acff); g.fillRect(21, opened ? 18 : 20, 7, 7);
        g.generateTexture(key, 48, 40); g.destroy();
    }
    if (!scene.textures.exists(PICKUP_TEXTURES.loot)) {
        const g = scene.make.graphics();
        g.fillStyle(0x41205f); g.fillTriangle(16, 1, 30, 17, 16, 31); g.fillTriangle(16, 1, 2, 17, 16, 31);
        g.fillStyle(0xdba3ff); g.fillTriangle(16, 4, 6, 16, 16, 27);
        g.fillStyle(0x9754d1); g.fillTriangle(16, 4, 26, 16, 16, 27);
        g.generateTexture(PICKUP_TEXTURES.loot, 32, 32); g.destroy();
    }
    if (!scene.textures.exists(PICKUP_TEXTURES.coin)) {
        const g = scene.make.graphics();
        g.fillStyle(0x65451d); g.fillCircle(32, 34, 25);
        g.fillStyle(0xffce55); g.fillCircle(32, 30, 24);
        g.lineStyle(4, 0xfff0a2); g.strokeCircle(32, 30, 19);
        g.fillStyle(0xa86a22); g.fillRect(29, 19, 6, 22);
        g.fillStyle(0xfff6c5); g.fillRect(27, 18, 4, 21);
        g.generateTexture(PICKUP_TEXTURES.coin, 64, 64); g.destroy();
    }
    if (!scene.textures.exists(PICKUP_TEXTURES.skillShard)) {
        const g = scene.make.graphics();
        g.fillStyle(0x63e6ff, 0.15); g.fillCircle(32, 32, 30);
        g.fillStyle(0x123e67); g.fillTriangle(32, 3, 57, 30, 32, 61); g.fillTriangle(32, 3, 7, 30, 32, 61);
        g.fillStyle(0x9ff7ff); g.fillTriangle(32, 7, 12, 30, 32, 52);
        g.fillStyle(0x36b7e8); g.fillTriangle(32, 7, 52, 30, 32, 52);
        g.fillStyle(0xe0ffff); g.fillTriangle(32, 7, 12, 30, 32, 24);
        g.generateTexture(PICKUP_TEXTURES.skillShard, 64, 64); g.destroy();
    }
}
