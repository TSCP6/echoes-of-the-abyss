/** 玩家主动技能执行；成功决策后按原顺序应用特效与实际效果。 */
import type { PlayerController } from './playerController';
import type { PlayerCombatFx } from './playerCombatFx';
import type { CombatResolver } from '../combat/combatResolver';
import { skillService } from '../../domain/player/skillService';
import { weaponService } from '../../domain/player/weaponService';
import { resourceSystem } from '../../domain/player/resourceSystem';
import { ConfigRegistry } from '../../domain/shared/configRegistry';
import { audioDirector } from '../presentation/audioDirector';

export interface SkillExecutionContext {
    player: PlayerController;
    combat: CombatResolver;
    effects: PlayerCombatFx;
    nowMs: number;
}

export function executePlayerSkill(slot: 0 | 1 | 2 | 3, context: SkillExecutionContext): void {
    const { player, combat, effects, nowMs } = context;
    const id = skillService.getLoadout()[slot];
    if (id === null) { combat.onAttackRejected?.(`技能 ${slot + 1} 未绑定，请按 Y 学习并绑定`); return; }
    const equipped = weaponService.getEquippedDefs();
    const rangedHand = equipped.main?.type === 'ranged' ? 'main' : equipped.sub?.type === 'ranged' ? 'sub' : null;
    const def = rangedHand === null ? null : equipped[rangedHand];
    if (ConfigRegistry.skills()[id]?.effect.projectileCount !== undefined && def === null) {
        combat.onAttackRejected?.('此技能需要主手或副手装备远程武器'); return;
    }
    const decision = skillService.tryCast(id);
    if (!decision.ok) { combat.onAttackRejected?.(decision.message); return; }
    const p = player.getMotionState();
    const ef = decision.value.effect;
    effects.skill(id, ef);
    audioDirector.playSkill(id); // 一次施放只响一次，齐射的多枚弹丸不叠加发射声。
    if (ef.damage !== undefined && ef.radius !== undefined) {
        combat.queueAreaDamage(p.x, p.y, ef.radius, ef.damage);
    } else if (ef.projectileCount !== undefined) {
        const count = ef.projectileCount;
        const spread = ef.spreadDeg ?? 15;
        for (let i = 0; i < count; i++) {
            const angle = (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
            if (def !== null && def.type === 'ranged') {
                combat.spawnProjectile({ ...def, baseDamage: ef.damage ?? def.baseDamage }, angle, rangedHand ?? 'main', id);
            }
        }
    } else if (ef.dashDistance !== undefined) {
        player.iFrameUntil = nowMs + (ef.invincibleMs ?? 200);
        player.startDash(ef.dashDistance, 200);
    } else if (ef.heal !== undefined) {
        resourceSystem.heal(ef.heal);
    }
}
