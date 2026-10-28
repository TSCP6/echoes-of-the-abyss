/**
 * TT-01：ConfigRegistry 校验器单测（DD-02 V1~V6）。
 * 验证真实配置通过 + 各类违规被拦截（引用完整性/范围/结构/经济闭环）。
 */
import { describe, it, expect } from 'vitest';
import { validateAll } from './configRegistry';
import { ITEMS } from '../data/items';
import { BOSS_COMBAT_PROFILES } from '../data/bossCombatProfiles';

describe('ConfigRegistry.validateAll（真实 DR-01 数据）', () => {
    it('全部配置通过 V1~V6 校验', () => {
        const r = validateAll();
        expect(r.ok, r.ok ? '' : JSON.stringify(r.errors)).toBe(true);
    });

    it('武器缺少对应的背包物品定义时启动校验拒绝通过', () => {
        const index = ITEMS.findIndex((it) => it.id === 'wpn_daggers');
        const [missing] = ITEMS.splice(index, 1);
        try {
            const r = validateAll();
            expect(r.ok).toBe(false);
            expect(r.errors).toEqual(expect.arrayContaining([
                expect.objectContaining({ table: 'weapons', id: 'wpn_daggers', field: 'itemId' })
            ]));
        } finally {
            ITEMS.splice(index, 0, missing);
        }
    });
});

describe('Boss 战斗配置启动校验', () => {
    function expectProfileError(id: string, field: string): void {
        const r = validateAll();
        expect(r.ok).toBe(false);
        expect(r.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'bossCombatProfiles', id, field })
        ]));
    }

    it.each([undefined, NaN, Infinity, -Infinity, 0.49, 1.26])('拒绝非法武器倍率 %s', (value) => {
        const factors = BOSS_COMBAT_PROFILES.enm_boss_guardian.weaponFactors;
        const original = factors.wpn_crossbow;
        factors.wpn_crossbow = value;
        try {
            expectProfileError('enm_boss_guardian', 'weaponFactors.wpn_crossbow');
        } finally {
            factors.wpn_crossbow = original;
        }
    });

    it.each([0.5, 1.25])('允许倍率闭区间边界 %s', (value) => {
        const factors = BOSS_COMBAT_PROFILES.enm_boss_guardian.weaponFactors;
        const original = factors.wpn_crossbow;
        factors.wpn_crossbow = value;
        try {
            expect(validateAll().ok).toBe(true);
        } finally {
            factors.wpn_crossbow = original;
        }
    });

    it.each(['nearRange', 'advanceSpeed'] as const)('拒绝非正或非有限的 %s', (field) => {
        const profile = BOSS_COMBAT_PROFILES.enm_boss_guardian;
        const original = profile[field];
        try {
            for (const value of [0, -1, Infinity, NaN]) {
                profile[field] = value;
                expectProfileError('enm_boss_guardian', field);
            }
        } finally {
            profile[field] = original;
        }
    });

    it.each([NaN, Infinity, 0, 0.09, 1.01])('拒绝非法压迫衔接等待 %s', (value) => {
        const profile = BOSS_COMBAT_PROFILES.enm_boss_spider;
        const original = profile.pressureFollowupSec;
        profile.pressureFollowupSec = value;
        try {
            expectProfileError('enm_boss_spider', 'pressureFollowupSec');
        } finally {
            profile.pressureFollowupSec = original;
        }
    });

    it.each([undefined, 0.1, 1])('允许缺省或闭区间边界的压迫衔接等待 %s', (value) => {
        const profile = BOSS_COMBAT_PROFILES.enm_boss_spider;
        const original = profile.pressureFollowupSec;
        profile.pressureFollowupSec = value;
        try {
            expect(validateAll().ok).toBe(true);
        } finally {
            profile.pressureFollowupSec = original;
        }
    });

    it.each(['', '   ', 'resistant'])('拒绝没有中文内容的提示 %j', (hint) => {
        const profile = BOSS_COMBAT_PROFILES.enm_boss_guardian;
        const original = profile.resistanceHint;
        profile.resistanceHint = hint;
        try {
            expectProfileError('enm_boss_guardian', 'resistanceHint');
        } finally {
            profile.resistanceHint = original;
        }
    });

    it('拒绝未知武器引用', () => {
        const factors = BOSS_COMBAT_PROFILES.enm_boss_guardian.weaponFactors;
        factors.wpn_unknown = 0.7;
        try {
            expectProfileError('enm_boss_guardian', 'weaponFactors.wpn_unknown');
        } finally {
            delete factors.wpn_unknown;
        }
    });

    it.each(['enm_unknown', 'enm_patrol'])('拒绝配置引用非 Boss %s', (id) => {
        BOSS_COMBAT_PROFILES[id] = BOSS_COMBAT_PROFILES.enm_boss_guardian;
        try {
            expectProfileError(id, 'id');
        } finally {
            delete BOSS_COMBAT_PROFILES[id];
        }
    });

    it('拒绝遗漏 Boss 战斗配置', () => {
        const original = BOSS_COMBAT_PROFILES.enm_boss_guardian;
        delete BOSS_COMBAT_PROFILES.enm_boss_guardian;
        try {
            expectProfileError('enm_boss_guardian', 'id');
        } finally {
            BOSS_COMBAT_PROFILES.enm_boss_guardian = original;
        }
    });
});
