import { describe, expect, it } from 'vitest';
import { beginBossAttack, tickBossAttack } from './bossAttack';

describe('Boss 攻击时序', () => {
    it('冲撞先蓄力再持续冲刺，最后进入收招窗口', () => {
        const attack = beginBossAttack({ kind: 'charge', damage: 25, cooldownSec: 3,
            params: { distance: 240, windupSec: 0.6 } }, -1);
        expect(attack.stage).toBe('windup');
        expect(tickBossAttack(attack, 0.59)).toBe(null);
        expect(tickBossAttack(attack, 0.02)).toBe('fire');
        expect(attack.stage).toBe('active');
        expect(attack.direction).toBe(-1);
        expect(tickBossAttack(attack, 0.3)).toBe(null);
        expect(attack.stage).toBe('active');
        tickBossAttack(attack, 0.21);
        expect(attack.stage).toBe('recovery');
        expect(tickBossAttack(attack, 0.5)).toBe('finished');
    });

    it('弹幕有可反应的前摇且只在前摇结束触发一次', () => {
        const attack = beginBossAttack({ kind: 'projectileSpread', damage: 18,
            cooldownSec: 3, params: { count: 3 } }, 1);
        expect(attack.windupSec).toBeGreaterThanOrEqual(0.6);
        expect(tickBossAttack(attack, 0.3)).toBe(null);
        expect(tickBossAttack(attack, 0.5)).toBe('fire');
        expect(tickBossAttack(attack, 0.1)).toBe(null);
    });
});
