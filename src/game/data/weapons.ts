/**
 * DR-01 WeaponDef ×6（SRS FR-05 规则 2：近战 3 + 远程 3）。
 * 数值 = SRS 附录 A 武器表；短剑/轻弩为初始武器（price null）。
 * 副武器购买价按强度递增（附录 A：120/180/300；第 4 把取中间档 240，属数据内容制作 DD-06）。
 */
import type { WeaponDef } from '../domain/shared/types';

export const WEAPONS: WeaponDef[] = [
    {
        id: 'wpn_shortsword', type: 'melee', baseDamage: 12, attackSpeed: 2.5,
        range: 40, projectileSpeed: null, ammoItemId: null, hitboxSize: { w: 40, h: 36 }, price: null
    },
    {
        id: 'wpn_daggers', type: 'melee', baseDamage: 7, attackSpeed: 5.0,
        range: 30, projectileSpeed: null, ammoItemId: null, hitboxSize: { w: 32, h: 28 }, price: 120
    },
    {
        id: 'wpn_greataxe', type: 'melee', baseDamage: 22, attackSpeed: 1.2,
        range: 60, projectileSpeed: null, ammoItemId: null, hitboxSize: { w: 56, h: 48 }, price: 180
    },
    {
        id: 'wpn_crossbow', type: 'ranged', baseDamage: 9, attackSpeed: 4.0,
        range: 480, projectileSpeed: 520, ammoItemId: 'itm_arrow', hitboxSize: { w: 12, h: 12 }, price: null
    },
    {
        id: 'wpn_dartgun', type: 'ranged', baseDamage: 8, attackSpeed: 5.0,
        range: 400, projectileSpeed: 600, ammoItemId: 'itm_dart', hitboxSize: { w: 10, h: 10 }, price: 240
    },
    {
        id: 'wpn_firestaff', type: 'ranged', baseDamage: 16, attackSpeed: 1.5,
        range: 520, projectileSpeed: 380, ammoItemId: 'itm_arrow', hitboxSize: { w: 16, h: 16 }, price: 300
    }
];

/** 玩家新档初始持有武器（主手短剑 + 副手轻弩，FR-05 规则 1） */
export const INITIAL_WEAPONS: { itemId: string; level: number }[] = [
    { itemId: 'wpn_shortsword', level: 1 },
    { itemId: 'wpn_crossbow', level: 1 }
];
export const INITIAL_EQUIP = { main: 'wpn_shortsword', sub: 'wpn_crossbow' };
