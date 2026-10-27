import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { createViewportBackground } from './viewportLayout';

vi.mock('phaser', () => ({ Scale: { Events: { RESIZE: 'resize' } },
    Scenes: { Events: { POST_UPDATE: 'postupdate', SHUTDOWN: 'shutdown' } } }));

function fixture() {
    const events = new EventEmitter();
    const scale = Object.assign(new EventEmitter(), { gameSize: { width: 1024, height: 768 } });
    const cam = { width: 1024, height: 768, zoom: 0.5, scrollX: 100 };
    const bg = {
        width: 1, height: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, tilePositionX: 0,
        setOrigin() { return this; }, setScrollFactor() { return this; }, setDepth() { return this; }, setName() { return this; },
        setSize(w: number, h: number) { this.width = w; this.height = h; return this; },
        setTileScale() { return this; },
        setScale(s: number) { this.scaleX = s; this.scaleY = s; return this; },
        setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    };
    createViewportBackground({ events, scale, cameras: { main: cam }, add: { tileSprite: () => bg },
        textures: { get: () => ({ getSourceImage: () => ({ height: 256 }) }) } } as unknown as Scene, 0.2);
    return { bg, events, scale, cam };
}

describe('竞技场缩放下的屏幕背景', () => {
    it('缩小主相机时背景仍从屏幕原点覆盖整个视口', () => {
        const { events, bg, cam } = fixture();
        events.emit('postupdate');
        expect((bg.x - cam.width / 2) * cam.zoom + cam.width / 2).toBe(0);
        expect((bg.y - cam.height / 2) * cam.zoom + cam.height / 2).toBe(0);
        expect(bg.width * bg.scaleX * cam.zoom).toBe(1024);
        expect(bg.height * bg.scaleY * cam.zoom).toBe(768);
        expect(bg.tilePositionX).toBe(20);
    });

    it('窗口变大与退出锁场后恢复尺寸，切关移除全局监听', () => {
        const { events, scale, bg, cam } = fixture();
        cam.zoom = 1; cam.width = 1365; scale.gameSize.width = 1365;
        scale.emit('resize'); events.emit('postupdate');
        expect(bg.x).toBe(0);
        expect(bg.scaleX).toBe(1);
        expect(bg.width).toBe(1365);
        events.emit('shutdown');
        expect(scale.listenerCount('resize')).toBe(0);
        expect(events.listenerCount('postupdate')).toBe(0);
    });
});
