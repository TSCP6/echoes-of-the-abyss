import { beforeEach, describe, expect, it } from 'vitest';
import { replayProfile, scaleEnemy } from './replayRules';
import { ProgressService } from './progressService';
import { validateAll, markValidated } from './configRegistry';
import { ENEMIES } from '../data/enemies';

beforeEach(() => { expect(validateAll().ok).toBe(true); markValidated(); });

describe('重玩成长与奖励', () => {
    it('三章重玩封顶，普通怪生命最多156%，接触伤害和技能前摇不变', () => {
        const source = ENEMIES[0];
        const enemy = scaleEnemy(source, replayProfile('3-1', 100));
        expect(enemy.hp).toBe(47);
        expect(enemy.contactDamage).toBe(5);
        expect(source.hp).toBe(30);
        expect(replayProfile('3-1', 100).coinPercent).toBe(25);
        const boss = ENEMIES.find(e => e.kind === 'boss')!;
        const scaled = scaleEnemy(boss, replayProfile('1-4', 4));
        expect(scaled.hp).toBe(690);
        expect(scaled.phases).toEqual(boss.phases);
    });

    it('仅成功通关增加该关档位，退关/续关与其他关卡互不干扰', () => {
        const p = new ProgressService(); p.reset();
        p.beginLevel('1-1', false, []);
        expect(p.getClearCount('1-1')).toBe(0);
        p.completeLevel('1-1');
        p.beginLevel('1-1', false, []); p.beginLevel('1-1', true, []);
        expect(p.getClearCount('1-1')).toBe(1);
        expect(p.getClearCount('1-2')).toBe(0);
        expect(p.getLevelViews()[0].coinPercent).toBe(65);
    });

    it('奖励认领跨重进和读档保持，通关后只清除该关领取记录', () => {
        const p = new ProgressService(); p.reset();
        expect(p.claimRunReward('1-1', 'enemy:1')).toBe(true);
        p.beginLevel('1-1', false, []);
        expect(p.claimRunReward('1-1', 'enemy:1')).toBe(false);
        const restored = new ProgressService(); restored.fromSnapshot(p.toSnapshot());
        expect(restored.claimRunReward('1-1', 'enemy:1')).toBe(false);
        restored.completeLevel('1-1');
        expect(restored.claimRunReward('1-1', 'enemy:1')).toBe(true);
    });

    it('金币按累计金额保留小数，不把四枚1金币各自保底成1', () => {
        const p = new ProgressService(); p.reset();
        for (let i = 0; i < 3; i++) { p.completeLevel('1-1'); }
        expect(p.scaleRunCoins('1-1', 1)).toBe(0);
        const restored = new ProgressService(); restored.fromSnapshot(p.toSnapshot());
        expect(restored.scaleRunCoins('1-1', 3)).toBe(1);
    });

    it('旧档已通关按一次恢复，非法次数不会影响其他进度', () => {
        const p = new ProgressService(); p.reset(); p.completeLevel('1-1');
        const old = p.toSnapshot(); delete old.clearCounts;
        p.fromSnapshot(old);
        expect(p.getClearCount('1-1')).toBe(1);
        p.fromSnapshot({ ...old, clearCounts: { '1-1': -1, '1-2': Infinity } });
        expect(p.getClearCount('1-1')).toBe(1);
        expect(p.getClearCount('1-2')).toBe(0);
    });
});
