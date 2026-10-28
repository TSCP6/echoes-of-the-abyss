import { describe, expect, it } from 'vitest';
import { NORMAL_ENEMY_COMBAT } from '../data/normalEnemyCombat';
import { validateAll } from './configRegistry';

describe('普通敌人战斗配置启动校验', () => {
    it.each(['windupSec', 'activeSec', 'recoverySec', 'cooldownSec', 'lostSec', 'leashRange', 'damage'])('拒绝缺失、非有限或非正的 %s', field => {
        const config = NORMAL_ENEMY_COMBAT.enm_flyer as unknown as Record<string, unknown>;
        const original = config[field];
        try {
            for (const value of [undefined, NaN, Infinity, -1, 0]) {
                config[field] = value;
                const result = validateAll();
                expect(result.ok).toBe(false);
                expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ table: 'normalEnemyCombat', field })]));
            }
        } finally { config[field] = original; }
    });
    it('拒绝锁定窗口超过前摇或远程距离顺序颠倒', () => {
        const dive = NORMAL_ENEMY_COMBAT.enm_flyer;
        const ranged = NORMAL_ENEMY_COMBAT.enm_patrol;
        if (dive.kind !== 'dive' || ranged.kind !== 'ranged') { throw new Error('错误的测试配置'); }
        const lock = dive.lockSec, min = ranged.minRange;
        try {
            dive.lockSec = dive.windupSec + 1; ranged.minRange = ranged.maxRange + 1;
            expect(validateAll().ok).toBe(false);
        } finally { dive.lockSec = lock; ranged.minRange = min; }
    });
    it('拒绝删除既有普通敌人配置或引用不存在的敌人', () => {
        const original = NORMAL_ENEMY_COMBAT.enm_flyer;
        try {
            delete NORMAL_ENEMY_COMBAT.enm_flyer;
            NORMAL_ENEMY_COMBAT.enm_missing = original;
            const result = validateAll();
            expect(result.ok).toBe(false);
        } finally { delete NORMAL_ENEMY_COMBAT.enm_missing; NORMAL_ENEMY_COMBAT.enm_flyer = original; }
    });
});
