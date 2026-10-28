import type { NormalEnemyCombatDef } from '../domain/normalEnemyBrain';

/** 普通敌人的主动攻击配置；移动速度、侦测距离及接触伤害仍读 EnemyDef。 */
export const NORMAL_ENEMY_COMBAT: Record<string, NormalEnemyCombatDef> = {
    enm_chaser: {
        kind: 'melee', damage: 12, windupSec: 0.3, activeSec: 0.18,
        recoverySec: 0.55, cooldownSec: 0.65, lostSec: 2.5, leashRange: 500,
        attackRange: 60, reach: 44, height: 34, lungeSpeed: 240
    },
    enm_patrol: {
        kind: 'ranged', damage: 10, windupSec: 0.6, activeSec: 0.08,
        recoverySec: 0.5, cooldownSec: 1.5, lostSec: 2.5, leashRange: 420,
        minRange: 140, maxRange: 280, retreatDistance: 72,
        projectileSpeed: 230, projectileRange: 480
    },
    enm_flyer: {
        kind: 'dive', damage: 14, windupSec: 0.65, activeSec: 0.85,
        recoverySec: 1, cooldownSec: 1.2, lostSec: 2.5, leashRange: 500,
        trackSpeed: 110, hoverHeight: 110, attackRange: 220, lockSec: 0.18,
        diveSpeed: 300, diveDistance: 260, cruiseRadius: 96
    }
};
