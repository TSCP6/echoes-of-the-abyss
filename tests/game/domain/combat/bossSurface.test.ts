import { describe, expect, it } from 'vitest';
import { findBossSurface } from '../../../../src/game/domain/combat/bossSurface';

describe('Boss锁定实际可站立表面', () => {
    const arena = { x: 0, y: 0, width: 640, height: 640 };
    const tile = (x: number, y: number) => y >= 640 || y >= 320 && y < 352 && x >= 128 && x < 288;
    it('平台上的玩家锁定该平台，并返回连续可站立宽度', () => {
        expect(findBossSurface(arena, { x: 200, y: 320 }, tile)).toEqual({ x: 128, y: 320, width: 160, height: 32 });
    });
    it('跳跃时锁定脚下最近表面，平台下方不错误锁到头顶', () => {
        expect(findBossSurface(arena, { x: 200, y: 250 }, tile).y).toBe(320);
        expect(findBossSurface(arena, { x: 200, y: 390 }, tile).y).toBe(640);
    });
    it('平台以外使用场地地面，范围不会超出战场', () => {
        expect(findBossSurface(arena, { x: 400, y: 300 }, tile)).toEqual({ x: 0, y: 640, width: 640, height: 32 });
    });
});
