/**
 * DR-01 ShopGoodsDef（FR-10 规则 2/5）—— 营地商人商品，按场景解锁过滤。
 * price 取值 15~300（V5 校验）；refId 必须在 ItemDef 或 WeaponDef 中存在（V3）。
 * 场景推进解锁：场景 2 解锁中级药水；场景 3 解锁高级药水与最后两把武器。
 * 副武器购买价按强度递增（附录 A：120/180/300，飞镖枪取 240）。
 */
import type { ShopGoodsDef } from '../domain/types';

export const GOODS: ShopGoodsDef[] = [
    // ---- 场景 1 起解锁：基础消耗品与弹药 ----
    { id: 'gds_potion_hp_s', refType: 'item', refId: 'itm_potion_hp_s', price: 25, unlockScene: 1, stockLimit: null, count: 1 },
    { id: 'gds_potion_sp_s', refType: 'item', refId: 'itm_potion_sp_s', price: 20, unlockScene: 1, stockLimit: null, count: 1 },
    { id: 'gds_dart', refType: 'item', refId: 'itm_dart', price: 15, unlockScene: 1, stockLimit: null, count: 10 },
    { id: 'gds_arrow', refType: 'item', refId: 'itm_arrow', price: 18, unlockScene: 1, stockLimit: null, count: 10 },
    { id: 'gds_daggers', refType: 'weapon', refId: 'wpn_daggers', price: 120, unlockScene: 1, stockLimit: 1, count: 1 },
    // ---- 场景 2 起解锁：中级药水 + 中阶武器 ----
    { id: 'gds_potion_hp_m', refType: 'item', refId: 'itm_potion_hp_m', price: 60, unlockScene: 2, stockLimit: null, count: 1 },
    { id: 'gds_potion_sp_m', refType: 'item', refId: 'itm_potion_sp_m', price: 50, unlockScene: 2, stockLimit: null, count: 1 },
    { id: 'gds_greataxe', refType: 'weapon', refId: 'wpn_greataxe', price: 180, unlockScene: 2, stockLimit: 1, count: 1 },
    { id: 'gds_dartgun', refType: 'weapon', refId: 'wpn_dartgun', price: 240, unlockScene: 2, stockLimit: 1, count: 1 },
    // ---- 场景 3 起解锁：高级药水 + 最强武器 ----
    { id: 'gds_potion_hp_l', refType: 'item', refId: 'itm_potion_hp_l', price: 120, unlockScene: 3, stockLimit: null, count: 1 },
    { id: 'gds_firestaff', refType: 'weapon', refId: 'wpn_firestaff', price: 300, unlockScene: 3, stockLimit: 1, count: 1 }
];
