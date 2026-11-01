/** Boss 阶段、技能队列与攻击时序；公开生命及战场状态仍由 EnemyEntity 持有。 */
import type { BossPhaseDef } from '../../domain/shared/types';
import type { EnemyEntity } from '../enemies/enemyEntity';
import type { EnemyEvents } from '../enemies/enemyTypes';
import type { EnemyVisual } from '../enemies/enemyVisuals';
import type { PlayerController } from '../player/playerController';
import type { ProjectilePool } from '../combat/projectilePool';
import { beginBossAttack, tickBossAttack, type BossAttack } from './bossAttack';
import { bossProjectileAngles } from './bossSkillPresentation';
import { getBossCombatProfile } from '../../data/bossCombatProfiles';

const BOSS_SWITCH_INVINCIBLE_MS = 1500;

export class BossBehavior {
    private skillQueue: number[] = [];
    skillCooldown = 0;
    attack: BossAttack | null = null;
    private pressureIndex = 0;
    private wallRecovery = false;
    private phaseOpening: 'spiderEggs' | 'spiderDrop' | null = null;

    constructor(private enemy: EnemyEntity, private visual: EnemyVisual,
        private direction: () => 1 | -1) {}

    get armorBroken(): boolean {
        return this.wallRecovery && this.attack?.skill.kind === 'charge' && this.attack.stage === 'recovery';
    }

    reset(): void {
        this.skillQueue = [];
        this.skillCooldown = 0;
        this.attack = null;
        this.pressureIndex = 0;
        this.wallRecovery = false;
        this.phaseOpening = null;
    }

    /** Boss 三阶段（AT-11）+ 技能循环（DD-06） */
    update(dt: number, player: PlayerController, nowMs: number,
        events: EnemyEvents, projectiles: ProjectilePool | null): void {
        this.enemy.guardianGuarding = false;
        if (!this.enemy.bossEngaged) {
            const enters = this.enemy.bossArena !== null ? this.enemy.playerInsideArena(player.sprite.x, player.sprite.y)
                : Math.abs(player.sprite.x - this.enemy.sprite.x) <= this.enemy.def.detectRange
                    && Math.abs(player.sprite.y - this.enemy.sprite.y) <= 160;
            if (!enters) {
                this.enemy.body.setVelocity(0, 0);
                return;
            }
            this.enemy.bossEngaged = true;
            events.onBossPhase(this.enemy, this.enemy.phaseIndex);
        }
        const ratio = this.enemy.hp / this.enemy.def.hp;
        const targetPhase = ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : 2;
        if (targetPhase !== this.enemy.phaseIndex) {
            this.enemy.phaseIndex = targetPhase;
            this.enemy.invincibleUntil = nowMs + BOSS_SWITCH_INVINCIBLE_MS;
            this.skillQueue = [];
            this.attack = null;
            this.wallRecovery = false;
            if (this.enemy.def.id === 'enm_boss_spider') {
                this.skillCooldown = 0;
                this.phaseOpening = targetPhase === 1 ? 'spiderEggs' : 'spiderDrop';
            }
            events.onBossPhase(this.enemy, targetPhase);
        }
        if (this.enemy.isInvincible(nowMs)) {
            this.enemy.body.setVelocity(0, 0);
            return;
        }
        if (this.attack !== null) {
            const attack = this.attack;
            const transition = tickBossAttack(attack, dt);
            this.enemy.faceAbility(attack.direction);
            this.enemy.body.setVelocity(0, 0);
            if (transition === 'fire') {
                this.executeBossSkill(attack.skill.kind, attack.skill.damage, attack.skill.params, events, projectiles);
            }
            if (attack.stage === 'active' && attack.skill.kind === 'charge') {
                const hitWall = attack.activeSec - attack.remaining > 0.05
                    && (attack.direction === 1 ? this.enemy.body.blocked?.right : this.enemy.body.blocked?.left);
                if (hitWall) {
                    this.wallRecovery = true;
                    attack.stage = 'recovery';
                    attack.remaining = attack.recoverySec;
                    this.visual.skill('charge', 0);
                } else {
                    this.enemy.body.setVelocityX(attack.direction * ((attack.skill.params.distance ?? 240) / attack.activeSec));
                }
            }
            if (transition === 'finished') {
                this.attack = null;
                const followup = getBossCombatProfile(this.enemy.def.id)?.pressureFollowupSec;
                if (attack.skill.kind === 'spiderDrop') {
                    this.skillCooldown = Math.max(0, attack.skill.cooldownSec - attack.activeSec - attack.recoverySec);
                }
                if (followup !== undefined && ['spiderWeb', 'spiderEggs'].includes(attack.skill.kind)) {
                    this.skillCooldown = followup;
                    this.phaseOpening = 'spiderDrop';
                }
            }
            return;
        }
        // 远距先推进或选择能真正威胁目标的招式，近距才使用原近战循环。
        this.enemy.faceAbility(player.sprite.x >= this.enemy.sprite.x ? 1 : -1);
        const profile = getBossCombatProfile(this.enemy.def.id);
        const distance = Math.abs(player.sprite.x - this.enemy.sprite.x);
        const far = distance > (profile?.nearRange ?? 220) || Math.abs(player.sprite.y - this.enemy.sprite.y) > 80;
        this.enemy.guardianGuarding = this.enemy.def.id === 'enm_boss_guardian' && far;
        this.enemy.body.setVelocityX(this.direction() * (far ? profile?.advanceSpeed ?? this.enemy.def.moveSpeed : distance > 90 ? this.enemy.def.moveSpeed * 0.5 : 0));

        // 技能循环
        this.skillCooldown -= dt;
        if (this.skillQueue.length === 0) {
            const phase = this.enemy.def.phases[this.enemy.phaseIndex] as BossPhaseDef | undefined;
            if (phase !== undefined) { this.skillQueue = phase.skills.map((_, i) => i); }
        }
        if (this.skillCooldown <= 0 && this.skillQueue.length > 0) {
            const phase = this.enemy.def.phases[this.enemy.phaseIndex];
            let idx = this.skillQueue[0] as number;
            const opening = phase?.skills.findIndex(s => s.kind === this.phaseOpening) ?? -1;
            if (opening >= 0) { idx = opening; }
            else if (far && phase !== undefined) {
                const kinds = this.enemy.def.id === 'enm_boss_guardian'
                    ? Math.abs(player.sprite.y - this.enemy.sprite.y) > 80 || !phase.skills.some(s => s.kind === 'charge')
                        ? ['guardianStomp'] : ['charge', 'guardianStomp']
                    : this.enemy.def.id === 'enm_boss_spider' ? ['spiderWeb', 'spiderDrop', 'spiderEggs'].filter(k => phase.skills.some(s => s.kind === k))
                        : ['echoStep'];
                const kind = kinds[this.pressureIndex++ % kinds.length];
                const selected = phase.skills.findIndex(s => s.kind === kind);
                if (selected >= 0) { idx = selected; }
            }
            const queued = this.skillQueue.indexOf(idx);
            if (queued >= 0) { this.skillQueue.splice(queued, 1); }
            const skill = phase?.skills[idx];
            if (skill !== undefined && phase !== undefined) {
                this.enemy.guardianGuarding = false;
                this.wallRecovery = false;
                this.phaseOpening = null;
                this.skillCooldown = skill.cooldownSec;
                this.attack = beginBossAttack(skill, this.direction());
                this.enemy.body.setVelocity(0, 0);
                this.visual.windup(skill.kind);
                events.onBossAttackBegan?.(this.enemy, this.attack);
            }
        }
    }

    private executeBossSkill(kind: string, damage: number, params: Record<string, number>,
        events: EnemyEvents, projectiles: ProjectilePool | null): void {
        this.visual.skill(kind, params.activeSec);
        switch (kind) {
            case 'charge': {
                const dist = params.distance ?? 240;
                this.enemy.body.setVelocityX(this.direction() * (dist / 0.5));
                break;
            }
            case 'projectileSpread': {
                if (projectiles === null) { break; }
                const count = Math.floor(params.count ?? 3);
                const spread = params.spreadDeg ?? 30;
                const speed = params.speed ?? 260;
                for (const angle of bossProjectileAngles(this.direction(), count, spread)) {
                    projectiles.spawn({
                        x: this.enemy.sprite.x + this.direction() * (this.enemy.def.hurtboxSize.w / 2 + 8), y: this.enemy.body.center.y,
                        angleDeg: angle, speed, range: 600, damage,
                        side: 'enemy', sourceId: this.enemy.def.id
                    });
                }
                break;
            }
            case 'summon':
            case 'arenaHazard':
                events.onBossSkill(this.enemy, kind, { ...params, damage });
                break;
            default:
                break;
        }
    }

}
