import type { BossSkillDef } from '../../domain/shared/types';

export interface BossAttack {
    skill: BossSkillDef;
    direction: 1 | -1;
    stage: 'windup' | 'active' | 'recovery';
    remaining: number;
    windupSec: number;
    activeSec: number;
    recoverySec: number;
}

export function beginBossAttack(skill: BossSkillDef, direction: 1 | -1): BossAttack {
    const windupSec = Math.max(0.4, skill.params.windupSec ?? (skill.kind === 'charge' ? 0.6 : 0.75));
    const activeSec = skill.params.activeSec ?? (skill.kind === 'charge' ? 0.5 : 0.2);
    const recoverySec = skill.params.recoverySec ?? 0.45;
    return { skill, direction, stage: 'windup', remaining: windupSec, windupSec, activeSec, recoverySec };
}

/** One transition per capped game frame; a skill fires only on windup → active. */
export function tickBossAttack(attack: BossAttack, dt: number): 'fire' | 'finished' | null {
    attack.remaining -= dt;
    if (attack.remaining > 1e-8) { return null; }
    if (attack.stage === 'windup') {
        attack.stage = 'active';
        attack.remaining = attack.activeSec;
        return 'fire';
    }
    if (attack.stage === 'active') {
        attack.stage = 'recovery';
        attack.remaining = attack.recoverySec;
        return null;
    }
    return 'finished';
}
