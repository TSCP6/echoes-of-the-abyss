import type { Scene } from 'phaser';

export const PICKUP_TEXTURES = { coin: 'pickup_coin', skillShard: 'pickup_skill_shard' } as const;

/** 原生几何纹理：金币的圆形轮廓与技能碎片的棱角独立于颜色。 */
export function registerPickupTextures(scene: Scene): void {
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
