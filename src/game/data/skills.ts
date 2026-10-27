/**
 * DR-01 SkillDef ×21（三分支 blade/bolt/ruin，FR-07 规则 1）。
 * SKP 全解锁总需 = 46（V5 校验；玩家最多可得 42，制造 build 取舍，AT-26）。
 * 四个示例技能（旋风斩/多重射击/回响冲刺/治疗祷言）参数 = SRS 附录 A 默认值。
 * prerequisiteId 构成同分支线性森林（无环，V4 校验）；每分支 7 节点。
 */
import type { SkillDef } from '../domain/types';

export const SKILLS: SkillDef[] = [
    // ================= 刃影分支 blade（近战强化，7 节点，SKP 17）=================
    {
        id: 'sk_blade_focus', name: '刃影专注', branch: 'blade', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: null, effect: { damagePct: 8 }
    },
    {
        id: 'sk_whirlwind', name: '旋风斩', branch: 'blade', kind: 'active', spCost: 20, cooldown: 6,
        skpCost: 3, prerequisiteId: 'sk_blade_focus',
        effect: { damage: 25, radius: 80 }
    },
    {
        id: 'sk_blade_edge', name: '锋刃磨砺', branch: 'blade', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_whirlwind', effect: { damagePct: 10 }
    },
    {
        id: 'sk_blade_fury', name: '狂刃爆发', branch: 'blade', kind: 'active', spCost: 26, cooldown: 8,
        skpCost: 3, prerequisiteId: 'sk_blade_edge',
        effect: { damage: 40, radius: 100 }
    },
    {
        id: 'sk_blade_mastery', name: '刃术精通', branch: 'blade', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_blade_fury', effect: { damagePct: 12 }
    },
    {
        id: 'sk_blade_storm', name: '剑刃风暴', branch: 'blade', kind: 'active', spCost: 34, cooldown: 12,
        skpCost: 3, prerequisiteId: 'sk_blade_mastery',
        effect: { damage: 58, radius: 120 }
    },
    {
        id: 'sk_blade_apex', name: '刃影宗师', branch: 'blade', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_blade_storm', effect: { damagePct: 15 }
    },

    // ================= 弩矢分支 bolt（远程强化，7 节点，SKP 14）=================
    {
        id: 'sk_bolt_steady', name: '稳弩专注', branch: 'bolt', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: null, effect: { damagePct: 8 }
    },
    {
        id: 'sk_multishot', name: '多重射击', branch: 'bolt', kind: 'active', spCost: 18, cooldown: 5,
        skpCost: 3, prerequisiteId: 'sk_bolt_steady',
        effect: { damage: 9, projectileCount: 3, spreadDeg: 15 }
    },
    {
        id: 'sk_bolt_pierce', name: '破甲箭术', branch: 'bolt', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_multishot', effect: { damagePct: 10 }
    },
    {
        id: 'sk_bolt_volley', name: '扇形齐射', branch: 'bolt', kind: 'active', spCost: 24, cooldown: 7,
        skpCost: 2, prerequisiteId: 'sk_bolt_pierce',
        effect: { damage: 12, projectileCount: 4, spreadDeg: 20 }
    },
    {
        id: 'sk_bolt_keen', name: '锐眼猎手', branch: 'bolt', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 1, prerequisiteId: 'sk_bolt_volley', effect: { damagePct: 12 }
    },
    {
        id: 'sk_bolt_rain', name: '暴雨连射', branch: 'bolt', kind: 'active', spCost: 30, cooldown: 10,
        skpCost: 2, prerequisiteId: 'sk_bolt_keen',
        effect: { damage: 16, projectileCount: 5, spreadDeg: 30 }
    },
    {
        id: 'sk_bolt_apex', name: '弩矢宗师', branch: 'bolt', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_bolt_rain', effect: { damagePct: 15 }
    },

    // ================= 遗迹分支 ruin（机动与生存，7 节点，SKP 15）=================
    {
        id: 'sk_dash', name: '回响冲刺', branch: 'ruin', kind: 'active', spCost: 12, cooldown: 1.2,
        skpCost: 2, prerequisiteId: null,
        effect: { dashDistance: 180, invincibleMs: 200 }
    },
    {
        id: 'sk_heal', name: '治疗祷言', branch: 'ruin', kind: 'active', spCost: 30, cooldown: 20,
        skpCost: 3, prerequisiteId: 'sk_dash',
        effect: { heal: 35 }
    },
    {
        id: 'sk_ruin_tough1', name: '遗迹坚韧', branch: 'ruin', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_heal', effect: {}, passiveHpBonus: 20, passiveSpBonus: 0
    },
    {
        id: 'sk_ruin_tough2', name: '回响壁垒', branch: 'ruin', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_ruin_tough1', effect: {}, passiveHpBonus: 20, passiveSpBonus: 20
    },
    {
        id: 'sk_ruin_vigor', name: '遗迹活力', branch: 'ruin', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_ruin_tough2', effect: {}, passiveHpBonus: 20, passiveSpBonus: 30
    },
    {
        id: 'sk_ruin_blink', name: '回响闪进', branch: 'ruin', kind: 'active', spCost: 20, cooldown: 4,
        skpCost: 2, prerequisiteId: 'sk_ruin_vigor',
        effect: { dashDistance: 240, invincibleMs: 400 }
    },
    {
        id: 'sk_ruin_apex', name: '遗迹守护', branch: 'ruin', kind: 'passive', spCost: 0, cooldown: 0,
        skpCost: 2, prerequisiteId: 'sk_ruin_blink', effect: {}, passiveHpBonus: 40, passiveSpBonus: 50
    }
];

/** SKP 全解锁总需（= 46，供 V5 校验与断言） */
export const SKP_TOTAL_COST = SKILLS.reduce((sum, s) => sum + s.skpCost, 0);
