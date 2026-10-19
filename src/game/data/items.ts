/**
 * DR-01 ItemDef（SRS 5.1 + 附录 A 经济表）。
 * 类别：material（遗迹残片，升级材料）、consumable（药水/弹药）、weapon（背包内武器物品，与 WeaponDef 同 id）。
 * icon 为图集帧名（DD-11）；V3 校验引用完整性。
 */
import type { ItemDef } from '../domain/types';

export const ITEMS: ItemDef[] = [
    // ---- 材料 ----
    {
        id: 'itm_relic_shard', name: '遗迹残片', category: 'material', stackMax: 99,
        effect: {}, throwable: false, price: 5,
        icon: 'icon_shard', description: '强化武器所需的古老残片。'
    },
    // ---- 消耗品：药水 ----
    {
        id: 'itm_potion_hp_s', name: '小型生命药水', category: 'consumable', stackMax: 99,
        effect: { hp: 30 }, throwable: false, price: 25,
        icon: 'icon_potion_hp_s', description: '回复 30 点生命。'
    },
    {
        id: 'itm_potion_sp_s', name: '小型能量药水', category: 'consumable', stackMax: 99,
        effect: { sp: 25 }, throwable: false, price: 20,
        icon: 'icon_potion_sp_s', description: '回复 25 点能量。'
    },
    {
        id: 'itm_potion_hp_m', name: '中型生命药水', category: 'consumable', stackMax: 99,
        effect: { hp: 60 }, throwable: false, price: 60,
        icon: 'icon_potion_hp_m', description: '回复 60 点生命。'
    },
    {
        id: 'itm_potion_sp_m', name: '中型能量药水', category: 'consumable', stackMax: 99,
        effect: { sp: 50 }, throwable: false, price: 50,
        icon: 'icon_potion_sp_m', description: '回复 50 点能量。'
    },
    {
        id: 'itm_potion_hp_l', name: '大型生命药水', category: 'consumable', stackMax: 99,
        effect: { fullHp: true }, throwable: false, price: 120,
        icon: 'icon_potion_hp_l', description: '完全回复生命值。'
    },
    // ---- 消耗品：弹药（可投掷）----
    {
        id: 'itm_dart', name: '飞镖', category: 'consumable', stackMax: 99,
        effect: {}, throwable: true, price: 15,
        icon: 'icon_dart', description: '飞镖枪弹药，亦可投掷。'
    },
    {
        id: 'itm_arrow', name: '箭矢', category: 'consumable', stackMax: 99,
        effect: {}, throwable: true, price: 18,
        icon: 'icon_arrow', description: '轻弩与火杖的弹药。'
    },
    // ---- 武器物品（背包槽位表示，category=weapon，stackMax=1）----
    {
        id: 'wpn_daggers', name: '双匕首', category: 'weapon', stackMax: 1,
        effect: {}, throwable: false, price: 120,
        icon: 'icon_daggers', description: '迅捷的近战双刃。'
    },
    {
        id: 'wpn_greataxe', name: '双手斧', category: 'weapon', stackMax: 1,
        effect: {}, throwable: false, price: 180,
        icon: 'icon_greataxe', description: '沉重而致命的巨斧。'
    },
    {
        id: 'wpn_dartgun', name: '飞镖枪', category: 'weapon', stackMax: 1,
        effect: {}, throwable: false, price: 240,
        icon: 'icon_dartgun', description: '高速连射的远程武器。'
    },
    {
        id: 'wpn_firestaff', name: '火杖', category: 'weapon', stackMax: 1,
        effect: {}, throwable: false, price: 300,
        icon: 'icon_firestaff', description: '喷射烈焰的强力法杖。'
    }
];
