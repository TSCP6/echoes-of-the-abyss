import { describe, expect, it } from 'vitest';
import { ELITE_TAIL } from '../../../../src/game/data/eliteTail';
import { EliteTail } from '../../../../src/game/domain/combat/eliteTail';

describe('精英回旋尾刃', () => {
    it('空闲无判定，前摇固定发射起点与方向且不能重入', () => {
        const tail = new EliteTail();
        expect(tail.snapshot.stage).toBe('idle');
        expect(tail.snapshot.rect).toBeNull();
        expect(tail.start(100, 80, -1)).toBe(true);
        expect(tail.start(900, 900, 1)).toBe(false);
        tail.tick(0.74, false);
        expect(tail.snapshot.stage).toBe('windup');
        expect(tail.snapshot.direction).toBe(-1);
        expect(tail.snapshot.canHit).toBe(false);
        tail.tick(0.01, false);
        expect(tail.snapshot.stage).toBe('outbound');
        expect(tail.snapshot.blade).toEqual({ x: 100, y: 80 });
    });

    it('水平到最大距离原路返回，回收后保留完整后摇及冷却', () => {
        const tail = new EliteTail();
        tail.start(100, 80, 1);
        tail.tick(ELITE_TAIL.windupSec, false);
        tail.tick(ELITE_TAIL.range / ELITE_TAIL.speed, false);
        expect(tail.snapshot.stage).toBe('inbound');
        expect(tail.snapshot.blade).toEqual({ x: 360, y: 80 });
        tail.tick(ELITE_TAIL.range / ELITE_TAIL.speed, false);
        expect(tail.snapshot.stage).toBe('recovery');
        expect(tail.snapshot.blade).toBeNull();
        tail.tick(0.99, false);
        expect(tail.start(0, 0, 1)).toBe(false);
        tail.tick(0.01, false);
        expect(tail.snapshot.stage).toBe('cooldown');
        tail.tick(2.99, false);
        expect(tail.start(0, 0, 1)).toBe(false);
        tail.tick(0.01, false);
        expect(tail.start(0, 0, 1)).toBe(true);
    });

    it('一次技能去回共用命中机会，新技能恢复机会', () => {
        const tail = new EliteTail();
        tail.start(0, 0, 1);
        tail.tick(ELITE_TAIL.windupSec, false);
        expect(tail.snapshot.rect).toEqual({ x: -16, y: -12, width: 32, height: 24 });
        expect(tail.snapshot.canHit).toBe(true);
        tail.consumeHit();
        tail.tick(ELITE_TAIL.range / ELITE_TAIL.speed, false);
        expect(tail.snapshot.canHit).toBe(false);
        tail.tick(10, false);
        tail.start(0, 0, -1);
        tail.tick(ELITE_TAIL.windupSec, false);
        expect(tail.snapshot.canHit).toBe(true);
    });

    it('撞墙在安全位置提前折返，回程不穿过新障碍', () => {
        const tail = new EliteTail();
        tail.start(0, 40, -1);
        tail.tick(ELITE_TAIL.windupSec + 0.2, false);
        expect(tail.snapshot.blade?.x).toBeCloseTo(-72);
        tail.tick(0.1, true);
        expect(tail.snapshot.stage).toBe('inbound');
        expect(tail.snapshot.blade?.x).toBeCloseTo(-72);
        tail.tick(0.1, true);
        expect(tail.snapshot.stage).toBe('recovery');
        expect(tail.snapshot.rect).toBeNull();
    });

    it('取消立即清理尾刃并重新开始完整后摇，冷却不可被缩短', () => {
        const tail = new EliteTail();
        tail.start(0, 0, 1);
        tail.tick(1, false);
        tail.cancel();
        expect(tail.snapshot.stage).toBe('recovery');
        expect(tail.snapshot.blade).toBeNull();
        tail.tick(0.9, false);
        tail.cancel();
        tail.tick(0.9, false);
        expect(tail.snapshot.stage).toBe('recovery');
        tail.tick(0.1, false);
        tail.tick(2, false);
        tail.cancel();
        expect(tail.snapshot.stage).toBe('cooldown');
        expect(tail.start(0, 0, 1)).toBe(false);
    });

    it('大步长可安全完成全部生命周期，无效时间不推进', () => {
        const tail = new EliteTail();
        tail.start(5, 6, 1);
        for (const dt of [-1, NaN, Infinity, 0]) { tail.tick(dt, false); }
        expect(tail.snapshot.progress).toBe(0);
        tail.tick(20, false);
        expect(tail.snapshot.stage).toBe('idle');
        expect(tail.snapshot.blade).toBeNull();
    });

    it('受阻折返也受总飞行时间上限约束并进入完整后摇', () => {
        const tail = new EliteTail();
        tail.start(0, 0, 1);
        tail.tick(ELITE_TAIL.windupSec + 0.1, false);
        tail.tick(ELITE_TAIL.maxFlightSec, true);
        expect(tail.snapshot.stage).toBe('recovery');
        expect(tail.snapshot.progress).toBe(0);
        expect(tail.snapshot.canHit).toBe(false);
        expect(tail.snapshot.blade).toBeNull();
    });

    it('快照坐标不可被外部修改污染', () => {
        const tail = new EliteTail();
        tail.start(5, 6, 1);
        tail.snapshot.origin.x = 900;
        expect(tail.snapshot.origin.x).toBe(5);
    });
});
