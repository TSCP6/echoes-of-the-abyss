import { describe, expect, it, vi } from 'vitest';
import { Geom, type Scene } from 'phaser';
import { CameraRig } from './cameraRig';
import type { PlayerController } from './playerController';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return { Geom: { Rectangle: require('../../../node_modules/phaser/src/geom/rectangle/Rectangle.js') } };
});

function fixture(width = 1024, height = 768) {
    const camera = {
        width, height, zoom: 1, scrollX: 1450, scrollY: 192, useBounds: true,
        setBounds() { this.useBounds = true; }, removeBounds() { this.useBounds = false; },
        setScroll(x: number, y: number) { this.scrollX = x; this.scrollY = y; },
        setZoom(zoom: number) { this.zoom = zoom; }
    };
    const motion = { x: 2040, y: 800, facing: 1 };
    const rig = new CameraRig({ cameras: { main: camera } } as unknown as Scene,
        { getMotionState: () => motion } as PlayerController);
    rig.setMapSize(2880, 960);
    return { rig, camera, motion };
}

describe('Boss 战相机', () => {
    it('进入竞技场的首帧保持平滑，不直接钳制到新中心', () => {
        const { rig, camera } = fixture();
        const x = camera.scrollX; const y = camera.scrollY;
        rig.lockTo(new Geom.Rectangle(1792, 384, 1088, 448));
        rig.update(16);
        expect(Math.hypot(camera.scrollX - x, camera.scrollY - y)).toBeLessThan(45);
    });

    it.each([[1024, 768], [1365, 768], [1024, 1365]])('视口 %s×%s 同时看见左右边界和完整战斗高度', (width, height) => {
        const { rig, camera } = fixture(width, height);
        rig.lockTo(new Geom.Rectangle(1792, 384, 1088, 448));
        for (let i = 0; i < 180; i++) { rig.update(16); }
        const halfW = camera.width / camera.zoom / 2;
        const halfH = camera.height / camera.zoom / 2;
        const cx = camera.scrollX + camera.width / 2;
        const cy = camera.scrollY + camera.height / 2;
        expect(cx - halfW).toBeLessThanOrEqual(1792 - 24);
        expect(cx + halfW).toBeGreaterThanOrEqual(2880 + 24);
        expect(cy - halfH).toBeLessThan(384);
        expect(cy + halfH).toBeGreaterThan(832);
        expect(camera.zoom).toBeLessThanOrEqual(1);
    });

    it('锁场后转身和落地不推移战场，解除后恢复正常跟随和缩放', () => {
        const { rig, camera, motion } = fixture();
        rig.lockTo(new Geom.Rectangle(1792, 384, 1088, 448));
        for (let i = 0; i < 180; i++) { rig.update(16); }
        const x = camera.scrollX; const y = camera.scrollY;
        motion.facing = -1;
        rig.onLanded();
        rig.update(16);
        expect(camera.scrollX).toBeCloseTo(x, 1);
        expect(camera.scrollY).toBeCloseTo(y, 1);
        rig.lockTo(null);
        for (let i = 0; i < 180; i++) { rig.update(16); }
        expect(camera.zoom).toBeCloseTo(1, 4);
        expect(camera.scrollX).toBeGreaterThanOrEqual(0);
        expect(camera.scrollX + camera.width).toBeLessThanOrEqual(2880);
    });
});
