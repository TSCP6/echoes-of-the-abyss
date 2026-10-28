import { describe, expect, it } from 'vitest';
import { beginBossAttack, tickBossAttack } from './bossAttack';
import { ENEMIES } from '../data/enemies';

describe('Boss 攻击时序', () => {
    it.each([{ phase: 1, seconds: 0.8 }, { phase: 2, seconds: 0.7 }])(
        '石像守卫者第 $phase 阶段冲刺保留 $seconds 秒判断时间', ({ phase, seconds }) => {
            const skill = ENEMIES.find(e => e.id === 'enm_boss_guardian')!.phases[phase].skills.find(s => s.kind === 'charge')!;
            const attack = beginBossAttack(skill, -1);
            expect(tickBossAttack(attack, seconds - 0.01)).toBe(null);
            expect(attack.stage).toBe('windup');
            expect(tickBossAttack(attack, 0.02)).toBe('fire');
            expect(attack.stage).toBe('active');
        });

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
