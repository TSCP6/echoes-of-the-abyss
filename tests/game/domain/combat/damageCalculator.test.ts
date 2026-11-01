/**
 * TT-01：DamageCalculator 单测（FR-04 处理规则 3 + EX-09 钳制）。
 * rng 注入确定性序列（测试接缝，IF-M02）。
 */
import { describe, it, expect } from 'vitest';
import { calcDamage } from '../../../../src/game/domain/combat/damageCalculator';
import { resetWarnThrottle } from '../../../../src/game/domain/shared/warn';

const rngFixed = (v: number) => () => v;

describe('calcDamage（FR-04 规则 3）', () => {
    it('短剑 1 级、rng=0.5 → round(12×1×1×1.0)=12（AT-12 区间 11~13）', () => {
        const r = calcDamage({ baseDamage: 12, weaponLevelFactor: 1, skillFactor: 1 }, rngFixed(0.5));
        expect(r.amount).toBe(12);
        expect(r.clamped).toBe(false);
    });

    it('浮动 ±5%：rng=0 → ×0.95；rng→1 → ×1.05', () => {
        const lo = calcDamage({ baseDamage: 12, weaponLevelFactor: 1, skillFactor: 1 }, rngFixed(0));
        const hi = calcDamage({ baseDamage: 12, weaponLevelFactor: 1, skillFactor: 1 }, rngFixed(0.999999));
        expect(lo.amount).toBe(Math.round(12 * 0.95));   // 11
        expect(hi.amount).toBe(Math.round(12 * 1.05));   // 13
    });

    it('武器等级系数：短剑 2 级（1.15）AT-17 → 结算 13~15', () => {
        const r = calcDamage({ baseDamage: 12, weaponLevelFactor: 1.15, skillFactor: 1 }, rngFixed(0.5));
        expect(r.amount).toBeGreaterThanOrEqual(13);
        expect(r.amount).toBeLessThanOrEqual(15);
    });

    it('结果最小为 1（正常公式组成，非 EX-09 钳制）', () => {
        const r = calcDamage({ baseDamage: 0.1, weaponLevelFactor: 1, skillFactor: 1 }, rngFixed(0.5));
        expect(r.amount).toBe(1);
        expect(r.clamped).toBe(false);
    });
});

describe('calcDamage（EX-09 非法输入钳制）', () => {
    it('NaN 基础伤害 → amount 1 + clamped true', () => {
        resetWarnThrottle();
        const r = calcDamage({ baseDamage: NaN, weaponLevelFactor: 1, skillFactor: 1 }, rngFixed(0.5));
        expect(r.amount).toBe(1);
        expect(r.clamped).toBe(true);
    });

    it('Infinity 等级系数 → 钳制', () => {
        resetWarnThrottle();
        const r = calcDamage({ baseDamage: 12, weaponLevelFactor: Infinity, skillFactor: 1 }, rngFixed(0.5));
        expect(r.amount).toBe(1);
        expect(r.clamped).toBe(true);
    });

    it('负基础伤害 → 钳制', () => {
        resetWarnThrottle();
        const r = calcDamage({ baseDamage: -5, weaponLevelFactor: 1, skillFactor: 1 }, rngFixed(0.5));
        expect(r.amount).toBe(1);
        expect(r.clamped).toBe(true);
    });

    it('rng 越界（>1）→ 钳制', () => {
        resetWarnThrottle();
        const r = calcDamage({ baseDamage: 12, weaponLevelFactor: 1, skillFactor: 1 }, rngFixed(2));
        expect(r.amount).toBe(1);
        expect(r.clamped).toBe(true);
    });
});
