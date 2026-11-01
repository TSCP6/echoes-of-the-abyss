/**
 * TT-01：单向平台分离判定单测（onewaySeparation 纯函数，扫掠模型）。
 * 回归背景：旧容差模型（bottom <= top + 4）在帧穿透 >4px（高速下落/低帧率）时放行 → 穿透平台；
 * LevelLoader.onewayProcess 直接委托本函数（无 Phaser 值导入，Node 可测）。
 */
import { describe, it, expect } from 'vitest';
import { shouldSeparateOneway, type OnewayBodyLike } from '../../../../src/game/systems/world/onewaySeparation';

function body(vy: number, bottom: number, delta: number): OnewayBodyLike {
    return { velocity: { y: vy }, bottom, deltaY: () => delta };
}

describe('shouldSeparateOneway（单向平台）', () => {
    it('下落且上一帧底边在顶之上 → 分离（含高速穿透帧）', () => {
        // 帧穿透 12px（~720px/s @60FPS）：旧模型放行，扫掠模型分离
        expect(shouldSeparateOneway(body(720, 748, 12), 736)).toBe(true);
        // 慢速落体
        expect(shouldSeparateOneway(body(100, 738, 2), 736)).toBe(true);
    });

    it('上一帧底边已在顶之下（从下方接近）→ 不分离', () => {
        expect(shouldSeparateOneway(body(300, 748, 12), 730)).toBe(false);
    });

    it('上升（vy<=0）→ 不分离（可自下而上穿过）', () => {
        expect(shouldSeparateOneway(body(-560, 700, -9), 736)).toBe(false);
        expect(shouldSeparateOneway(body(0, 736, 0), 736)).toBe(false);
    });
});
