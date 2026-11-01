import type { Scene } from 'phaser';

export function playerProjectileTexture(id: string): string {
    return ({ wpn_crossbow: 'combat_bolt', wpn_dartgun: 'combat_dart', wpn_firestaff: 'combat_fire' } as Record<string, string>)[id] ?? 'projectile_player';
}

export function playerProjectileTint(skillId = ''): number {
    return ({ sk_multishot: 0x93f4ff, sk_bolt_volley: 0xffe38a, sk_bolt_rain: 0xd4a6ff } as Record<string, number>)[skillId] ?? 0xffffff;
}

export function registerPlayerProjectiles(scene: Scene): void {
    for (const key of ['combat_bolt', 'combat_dart', 'combat_fire']) {
        if (scene.textures.exists(key)) { continue; }
        const g = scene.make.graphics();
        if (key === 'combat_fire') {
            g.fillStyle(0xff7337, 0.25); g.fillCircle(16, 16, 15);
            g.fillStyle(0xe34420); g.fillTriangle(1, 4, 28, 16, 1, 28);
            g.fillStyle(0xffb84e); g.fillCircle(19, 16, 9);
            g.fillStyle(0xfff4c2); g.fillCircle(21, 16, 5);
        } else if (key === 'combat_dart') {
            g.fillStyle(0x143348); g.fillTriangle(31, 16, 8, 7, 8, 25);
            g.fillStyle(0x74eee5); g.fillTriangle(29, 16, 10, 10, 10, 22);
            g.fillStyle(0xf1ffff); g.fillTriangle(29, 16, 17, 13, 17, 19);
            g.lineStyle(2, 0x36adae); g.lineBetween(3, 10, 9, 16); g.lineBetween(3, 22, 9, 16);
        } else {
            g.lineStyle(6, 0x263545); g.lineBetween(4, 16, 27, 16);
            g.lineStyle(3, 0xe5dbb4); g.lineBetween(4, 16, 25, 16);
            g.fillStyle(0xf4fdff); g.fillTriangle(32, 16, 23, 10, 23, 22);
            g.fillStyle(0xaad3ed); g.fillTriangle(2, 8, 11, 16, 2, 16); g.fillTriangle(2, 24, 11, 16, 2, 16);
        }
        g.generateTexture(key, 34, 32); g.destroy();
    }
}
