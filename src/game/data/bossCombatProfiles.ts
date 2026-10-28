/** Boss 武器抗性与距离决策共用配置；未列出的武器倍率为 1。 */
export interface BossCombatProfile {
    weaponFactors: Partial<Record<string, number>>;
    resistanceHint: string;
    nearRange: number;
    advanceSpeed: number;
    /** 非伤害招式完整收招后，衔接压迫技能的等待。 */
    pressureFollowupSec?: number;
}

export const BOSS_COMBAT_PROFILES: Record<string, BossCombatProfile> = {
    enm_boss_guardian: {
        weaponFactors: { wpn_crossbow: 0.7, wpn_dartgun: 0.7, wpn_greataxe: 1.1 },
        resistanceHint: '轻弩、飞镖伤害降低30%；巨斧伤害提高10%；撞墙硬直时解除减伤。',
        nearRange: 220,
        advanceSpeed: 170
    },
    enm_boss_spider: {
        weaponFactors: { wpn_crossbow: 0.9, wpn_dartgun: 0.9, wpn_firestaff: 1.15 },
        resistanceHint: '轻弩、飞镖伤害降低10%；火杖伤害提高15%。',
        nearRange: 240,
        advanceSpeed: 140,
        pressureFollowupSec: 0.35
    },
    enm_boss_echo: {
        weaponFactors: { wpn_crossbow: 0.85, wpn_dartgun: 0.85, wpn_firestaff: 0.85 },
        resistanceHint: '远程武器伤害降低15%；近战武器伤害不变。',
        nearRange: 180,
        advanceSpeed: 180
    }
};

export function getBossCombatProfile(bossId: string): BossCombatProfile | null {
    return Object.prototype.hasOwnProperty.call(BOSS_COMBAT_PROFILES, bossId)
        ? BOSS_COMBAT_PROFILES[bossId]
        : null;
}
