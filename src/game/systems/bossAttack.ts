import type { BossSkillDef } from '../domain/types';

export interface BossAttack {
    skill: BossSkillDef;
    direction: 1 | -1;
    stage: 'windup' | 'active' | 'recovery';
    remaining: number;
    windupSec: number;
}

export function beginBossAttack(skill: BossSkillDef, direction: 1 | -1): BossAttack {
    const windupSec = Math.max(0.4, skill.params.windupSec ?? (skill.kind === 'charge' ? 0.6 : 0.75));
    return { skill, direction, stage: 'windup', remaining: windupSec, windupSec };
}

/** One transition per capped game frame; a skill fires only on windup → active. */
export function tickBossAttack(attack: BossAttack, dt: number): 'fire' | 'finished' | null {
    attack.remaining -= dt;
    if (attack.remaining > 0) { return null; }
    if (attack.stage === 'windup') {
        attack.stage = 'active';
        attack.remaining = attack.skill.kind === 'charge' ? 0.5 : 0.2;
        return 'fire';
    }
    if (attack.stage === 'active') {
        attack.stage = 'recovery';
        attack.remaining = 0.45;
        return null;
    }
    return 'finished';
}
