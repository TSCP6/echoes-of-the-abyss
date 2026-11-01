/**
 * TT-01：ResourceSystem 单测（FR-06 规则 1~8 + EX-09）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceSystem } from '../../../../src/game/domain/player/resourceSystem';
import { resetWarnThrottle } from '../../../../src/game/domain/shared/warn';

describe('ResourceSystem（FR-06）', () => {
    let rs: ResourceSystem;
    beforeEach(() => {
        resetWarnThrottle();
        rs = new ResourceSystem();
    });

    it('初始 100/100 HP、50/50 SP', () => {
        const s = rs.getSnapshot();
        expect([s.hp, s.hpMax, s.sp, s.spMax]).toEqual([100, 100, 50, 50]);
    });

    it('applyDamage 扣血并判 died（AT-22 前置）', () => {
        expect(rs.applyDamage(40)).toEqual({ ok: true, value: { hp: 60, died: false } });
        expect(rs.applyDamage(60)).toEqual({ ok: true, value: { hp: 0, died: true } });
    });

    it('HP 不超上限：heal 溢出丢弃', () => {
        rs.applyDamage(30);
        const r = rs.heal(999);
        expect(r.hp).toBe(100);
        expect(r.overflow).toBe(969);
    });

    it('SP 不足拒绝且不扣（AT-23）', () => {
        rs.spendSp(35);          // sp=15
        const r = rs.spendSp(20);
        expect(r.ok).toBe(false);
        expect(rs.getSnapshot().sp).toBe(15);
    });

    it('击杀 +6 SP（AT-21）', () => {
        rs.spendSp(20);
        rs.notifyKill();
        expect(rs.getSnapshot().sp).toBe(36);
    });

    it('脱战 3s 后 SP 4 点/s 回复，到上限停止（AT-20）', () => {
        rs.spendSp(20);           // 进入战斗态
        for (let i = 0; i < 29; i++) { rs.tick(0.1); }  // 2.9s 未脱战
        expect(rs.getSnapshot().sp).toBe(30);
        rs.tick(0.1);            // 3.0s 脱战达成，本帧不回复
        expect(rs.getSnapshot().sp).toBe(30);
        for (let i = 0; i < 10; i++) { rs.tick(0.1); } // +1s → +4
        expect(rs.getSnapshot().sp).toBeCloseTo(34, 5);
        for (let i = 0; i < 100; i++) { rs.tick(0.1); }
        expect(rs.getSnapshot().sp).toBe(50);         // 上限停止
    });

    it('战斗中不回复 SP（FR-06 规则 4）', () => {
        rs.spendSp(10);          // sp=40，进入战斗态（timer=0）
        rs.tick(5);              // 单次大 dt：仅推进脱战计时到 3s，本帧不回复
        expect(rs.getSnapshot().sp).toBe(40);
        rs.tick(2);              // 脱战后 2s → +8
        expect(rs.getSnapshot().sp).toBe(48);
    });

    it('低血标志：HP<30% 触发（FR-06 规则 8）', () => {
        rs.applyDamage(71);
        expect(rs.getSnapshot().lowHp).toBe(true);
        rs.heal(50);
        expect(rs.getSnapshot().lowHp).toBe(false);
    });

    it('被动上限加成钳制 200/150（FR-06 规则 1/2）', () => {
        rs.applyPassiveMaxBonus(150, 200);
        expect([rs.getSnapshot().hpMax, rs.getSnapshot().spMax]).toEqual([200, 150]);
    });

    it('EX-09：NaN 伤害 → INVALID_VALUE 且 HP 不变', () => {
        const r = rs.applyDamage(NaN);
        expect(r.ok).toBe(false);
        expect(rs.getSnapshot().hp).toBe(100);
    });
});
