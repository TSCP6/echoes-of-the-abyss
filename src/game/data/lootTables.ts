/**
 * DR-01 LootTableDef（DD-02）—— 敌人死亡掉落表（FR-03/09）。
 * 金币掉落走 EnemyDef.coinsDrop（EconomyService 直接掷点），此处只管物品/材料。
 * weight 为相对权重；countMin/countMax 为产出数量区间。
 */
import type { LootTableDef } from '../domain/types';

export const LOOT_TABLES: LootTableDef[] = [
    {
        id: 'loot_patrol',
        entries: [
            { itemId: 'itm_relic_shard', weight: 8, countMin: 1, countMax: 1 },
            { itemId: 'itm_potion_hp_s', weight: 12, countMin: 1, countMax: 1 }
        ]
    },
    {
        id: 'loot_chaser',
        entries: [
            { itemId: 'itm_relic_shard', weight: 14, countMin: 1, countMax: 1 },
            { itemId: 'itm_potion_hp_s', weight: 10, countMin: 1, countMax: 1 },
            { itemId: 'itm_dart', weight: 12, countMin: 2, countMax: 4 }
        ]
    },
    {
        id: 'loot_flyer',
        entries: [
            { itemId: 'itm_arrow', weight: 16, countMin: 2, countMax: 4 },
            { itemId: 'itm_potion_sp_s', weight: 10, countMin: 1, countMax: 1 }
        ]
    },
    {
        id: 'loot_elite',
        entries: [
            { itemId: 'itm_relic_shard', weight: 40, countMin: 2, countMax: 3 },
            { itemId: 'itm_potion_hp_m', weight: 20, countMin: 1, countMax: 1 },
            { itemId: 'itm_potion_sp_m', weight: 16, countMin: 1, countMax: 1 }
        ]
    },
    {
        id: 'loot_boss1',
        entries: [
            { itemId: 'itm_relic_shard', weight: 100, countMin: 5, countMax: 7 },
            { itemId: 'itm_potion_hp_m', weight: 40, countMin: 2, countMax: 3 }
        ]
    },
    {
        id: 'loot_boss2',
        entries: [
            { itemId: 'itm_relic_shard', weight: 100, countMin: 7, countMax: 9 },
            { itemId: 'itm_potion_hp_m', weight: 50, countMin: 2, countMax: 3 },
            { itemId: 'itm_potion_sp_m', weight: 40, countMin: 2, countMax: 3 }
        ]
    },
    {
        id: 'loot_boss3',
        entries: [
            { itemId: 'itm_relic_shard', weight: 100, countMin: 9, countMax: 12 },
            { itemId: 'itm_potion_hp_l', weight: 60, countMin: 1, countMax: 2 },
            { itemId: 'itm_potion_sp_m', weight: 50, countMin: 3, countMax: 4 }
        ]
    }
];
