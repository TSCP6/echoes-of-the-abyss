/**
 * MOD-02 CameraRig（Phaser 呈现层，管线阶段 9）—— FR-02 全部规则。
 * 插值跟随：水平时间常数 0.12 s、垂直 0.18 s（指数平滑，帧率无关）；
 * 视口偏移：水平朝向前方 96 px、垂直玩家偏下 48 px（相机中心 = player + facing*96, player.y - 48）；
 * 普通关边界钳制：视口不超地图，地图小于视口居中；落地沉降 6 px / 0.10 s 回弹。
 * Boss 战按地图范围平滑取景，缩放适配视口并在四周保留 48px（FR-02 规则 5）。
 */
import { Geom, type Scene } from 'phaser';
import type { PlayerController } from '../player/playerController';
import { settingsStore } from '../../domain/player/settingsStore';

const TAU_X = 0.12;
const TAU_Y = 0.18;
const OFFSET_X = 96;
const OFFSET_Y = -48; // 玩家偏下 → 相机中心在玩家上方 48
const DIP_PX = 6;
const DIP_DOWN_SEC = 0.10;
const DIP_BACK_SEC = 0.15;
const ARENA_TAU = 0.25;
const ARENA_PADDING = 48;

export class CameraRig {
    private mapW = 0;
    private mapH = 0;
    private dipT = -1; // <0 = 无沉降
    private lockRect: Geom.Rectangle | null = null;

    // onLanded 由 LevelScene 统一链式挂载（沉降+音效，6.2.3）
    constructor(private scene: Scene, private player: PlayerController) {}

    /** 落地沉降触发（FR-02 规则 4）；公开供 LevelScene 音效链同点调用 */
    onLanded(): void { this.dipT = 0; }

    /** FR-16 规则 3/4：屏幕震动（幅度上限 8 px、时长上限 0.3 s）；震屏关闭（FR-18）→ 无位移（AT-57） */
    shake(px: number, ms: number): void {
        if (!settingsStore.getSnapshot().screenShake) { return; }
        const amp = Math.min(8, px);
        const dur = Math.min(300, ms);
        this.scene.cameras.main.shake(dur, amp / 1000); // Phaser intensity ≈ px/1000 经验换算
    }

    setMapSize(w: number, h: number): void {
        this.mapW = w;
        this.mapH = h;
        const cam = this.scene.cameras.main;
        cam.setBounds(0, 0, w, h);
    }

    /** FR-02 规则 5：Boss 战锁定相机至场地矩形（null 解除） */
    lockTo(rect: Geom.Rectangle | null): void {
        this.lockRect = rect;
        // setBounds 会立刻改写 scroll；锁场改由 update 平滑取景，避免首帧跳切。
        this.scene.cameras.main.removeBounds();
        this.dipT = -1;
    }

    private clampCenter(cx: number, cy: number): { x: number; y: number } {
        const cam = this.scene.cameras.main;
        const vw = cam.width / cam.zoom;
        const vh = cam.height / cam.zoom;
        const minX = vw / 2;
        const maxX = this.mapW - vw / 2;
        const minY = vh / 2;
        const maxY = this.mapH - vh / 2;
        // 地图小于视口 → 居中（FR-02 规则 3）
        const x = maxX < minX ? (minX + maxX) / 2 : Math.min(maxX, Math.max(minX, cx));
        const y = maxY < minY ? (minY + maxY) / 2 : Math.min(maxY, Math.max(minY, cy));
        return { x, y };
    }

    /** 管线阶段 9（dt 单位 ms） */
    update(dtMs: number): void {
        const dt = dtMs / 1000;
        const cam = this.scene.cameras.main;
        const p = this.player.getMotionState();
        const arena = this.lockRect;
        const blend = 1 - Math.exp(-dt / ARENA_TAU);
        const targetZoom = arena === null ? 1 : Math.min(1,
            cam.width / (arena.width + ARENA_PADDING * 2),
            cam.height / (arena.height + ARENA_PADDING * 2));
        const zoom = cam.zoom + (targetZoom - cam.zoom) * blend;
        cam.setZoom(Math.abs(zoom - targetZoom) < 0.0001 ? targetZoom : zoom);
        if (arena !== null) {
            const cx = cam.scrollX + cam.width / 2;
            const cy = cam.scrollY + cam.height / 2;
            cam.setScroll(cx + (arena.centerX - cx) * blend - cam.width / 2,
                cy + (arena.centerY - cy) * blend - cam.height / 2);
            return;
        }

        const targetX = p.x + p.facing * OFFSET_X;
        const targetY = p.y + OFFSET_Y;
        const kx = 1 - Math.exp(-dt / TAU_X);
        const ky = 1 - Math.exp(-dt / TAU_Y);
        let cx = cam.scrollX + cam.width / 2 + (targetX - (cam.scrollX + cam.width / 2)) * kx;
        let cy = cam.scrollY + cam.height / 2 + (targetY - (cam.scrollY + cam.height / 2)) * ky;

        // 落地沉降（FR-02 规则 4）
        let dip = 0;
        if (this.dipT >= 0) {
            this.dipT += dt;
            if (this.dipT <= DIP_DOWN_SEC) {
                dip = DIP_PX * (this.dipT / DIP_DOWN_SEC);
            } else if (this.dipT <= DIP_DOWN_SEC + DIP_BACK_SEC) {
                dip = DIP_PX * (1 - (this.dipT - DIP_DOWN_SEC) / DIP_BACK_SEC);
            } else {
                this.dipT = -1;
            }
        }

        const c = this.clampCenter(cx, cy + dip);
        cx = c.x;
        cy = c.y;
        cam.setScroll(cx - cam.width / 2, cy - cam.height / 2);
    }
}
