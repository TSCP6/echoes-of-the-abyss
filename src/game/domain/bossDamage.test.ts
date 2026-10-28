import { describe, expect, it } from 'vitest';
import { getBossCombatProfile } from '../data/bossCombatProfiles';
import { bossWeaponFactor } from './bossDamage';

describe('Boss 武器抗性', () => {
    it.each([
        ['enm_boss_guardian', 'wpn_crossbow', 0.7],
        ['enm_boss_guardian', 'wpn_dartgun', 0.7],
        ['enm_boss_guardian', 'wpn_greataxe', 1.1],
        ['enm_boss_guardian', 'wpn_firestaff', 1],
        ['enm_boss_spider', 'wpn_crossbow', 0.9],
        ['enm_boss_spider', 'wpn_dartgun', 0.9],
        ['enm_boss_spider', 'wpn_firestaff', 1.15],
        ['enm_boss_spider', 'wpn_greataxe', 1],
        ['enm_boss_echo', 'wpn_crossbow', 0.85],
        ['enm_boss_echo', 'wpn_dartgun', 0.85],
        ['enm_boss_echo', 'wpn_firestaff', 0.85],
        ['enm_boss_echo', 'wpn_shortsword', 1],
        ['enm_boss_echo', 'wpn_daggers', 1]
    ])('%s 受到 %s 攻击时应用倍率 %s', (bossId, weaponId, expected) => {
        expect(bossWeaponFactor(bossId, weaponId)).toBe(expected);
    });

    it('守卫撞墙破甲只移除减伤，巨斧弱点仍生效', () => {
        expect(bossWeaponFactor('enm_boss_guardian', 'wpn_crossbow', true)).toBe(1);
        expect(bossWeaponFactor('enm_boss_guardian', 'wpn_dartgun', true)).toBe(1);
        expect(bossWeaponFactor('enm_boss_guardian', 'wpn_greataxe', true)).toBe(1.1);
        expect(bossWeaponFactor('enm_boss_spider', 'wpn_crossbow', true)).toBe(0.9);
        expect(bossWeaponFactor('enm_boss_echo', 'wpn_crossbow', true)).toBe(0.85);
    });

    it('普通敌人和未知引用保持中性倍率', () => {
        expect(bossWeaponFactor('enm_patrol', 'wpn_crossbow')).toBe(1);
        expect(bossWeaponFactor('unknown', 'wpn_crossbow')).toBe(1);
        expect(bossWeaponFactor('enm_boss_guardian', 'unknown')).toBe(1);
        expect(bossWeaponFactor('__proto__', 'wpn_crossbow')).toBe(1);
        expect(bossWeaponFactor('enm_boss_guardian', '__proto__')).toBe(1);
        expect(getBossCombatProfile('unknown')).toBeNull();
        expect(getBossCombatProfile('__proto__')).toBeNull();
    });
});
