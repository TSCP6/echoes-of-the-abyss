import type { Scene, Tilemaps } from 'phaser';
import { BossAbilityField, abilityOverlaps } from '../domain/bossAbilities';
import type { LevelContext } from './levelLoader';
import type { EnemyAI, EnemyEntity } from './enemyAI';
import type { PlayerController } from './playerController';
import type { CombatResolver } from './combatResolver';
import type { BossAttack } from './bossAttack';
import { BossAbilityFx } from './bossAbilityFx';
import { findBossSurface } from '../domain/bossSurface';

/** 共享技能几何接到 Arcade 实体、玩家减速、可破坏蛛卵与固定池特效。 */
export class BossAbilitySystem {
    readonly field = new BossAbilityField();
    private fx: BossAbilityFx;
    private activeBoss: EnemyEntity | null = null;
    private scriptedBoss: EnemyEntity | null = null;

    constructor(scene: Scene, private ctx: LevelContext, private enemies: EnemyAI,
        private player: PlayerController, private combat: CombatResolver) {
        this.fx = new BossAbilityFx(scene);
        combat.destructibleTargets = () => this.field.snapshot.eggs.map(egg => ({
            id: egg.id, rect: egg.rect, hit: damage => { this.field.hitEgg(egg.id, damage); }
        }));
    }

    begin(enemy: EnemyEntity, attack: BossAttack): void {
        const arena = this.ctx.bossArena;
        if (arena === null || enemy.dead) { return; }
        // EnemyAI在本帧敌人阶段开始施招；下一帧先结算技能，再结算玩家攻击（K7）。
        this.activeBoss = enemy;
        this.field.begin(attack.skill, {
            bossId: enemy.def.id, phase: enemy.phaseIndex, direction: attack.direction,
            origin: { x: enemy.sprite.x, y: enemy.sprite.y },
            target: { x: this.player.sprite.x, y: this.player.sprite.y }, bodyWidth: enemy.body.width,
            targetSurface: findBossSurface(arena, { x: this.player.sprite.x, y: this.player.body.bottom }, (x, y) => {
                const solid = (this.ctx.collisionGroup as Tilemaps.TilemapLayer).getTileAtWorldXY(x, y, true);
                const one = (this.ctx.onewayGroup as Tilemaps.TilemapLayer).getTileAtWorldXY(x, y, true);
                return solid !== null && solid.index > 0 && solid.collides || one !== null && one.index > 0;
            }),
            arena: { x: arena.x, y: arena.y, width: arena.width, height: arena.height }
        });
        if (attack.skill.kind === 'echoStep' || attack.skill.kind === 'spiderDrop') { enemy.abilityContactSuppressed = true; }
    }

    preparePlayer(): void {
        const b = this.player.body;
        this.player.setMoveSpeedFactor(this.field.slowFactor({ x: b.x, y: b.y, width: b.width, height: b.height }));
    }

    update(dt: number): void {
        const boss = this.enemies.getBoss();
        if (boss === null) {
            if (this.activeBoss !== null) { this.reset(); }
            return;
        }
        const minions = this.enemies.getSummons().filter(e => !e.dead).length;
        const summons = this.field.tick(dt, { x: boss.sprite.x, y: boss.sprite.y }, boss.getBossAttack()?.stage, minions);
        for (const point of summons) { this.enemies.summonAt(point.x, point.y, 'enm_patrol', 'spiderling'); }
        const motion = this.field.snapshot.motion;
        if (motion !== null) {
            this.scriptedBoss = boss;
            boss.body.checkCollision.none = true;
            boss.abilityContactSuppressed = true;
            boss.body.reset(motion.x, motion.y);
            boss.body.setVelocity(0, 0);
            boss.sprite.setAlpha(motion.alpha);
            boss.faceAbility(motion.facing);
            const attack = boss.getBossAttack();
            if (attack?.skill.kind === 'echoStep') { attack.direction = motion.facing; }
        } else { this.restoreScriptedBoss(); }
        const attack = boss.getBossAttack();
        boss.abilityContactSuppressed = attack !== null && ['echoStep', 'spiderDrop'].includes(attack.skill.kind)
            && attack.stage !== 'recovery';
        const body = this.player.body;
        const rect = { x: body.x, y: body.y, width: body.width, height: body.height };
        for (const zone of this.field.damageZones) {
            if (abilityOverlaps(rect, zone.rect)) {
                this.combat.damagePlayer(zone.damage, zone.sourceId, zone.rect.x + zone.rect.width / 2);
                break;
            }
        }
    }

    /** 在敌人阶段之后绘制；撞墙进入硬直的同一帧就移除冲撞判定。 */
    render(): void {
        const boss = this.enemies.getBoss();
        if (boss === null && this.activeBoss !== null) { this.reset(); }
        const attack = boss?.getBossAttack();
        if (attack?.skill.kind === 'charge' && attack.stage === 'recovery') { this.field.stopCharge(); }
        this.fx.render(this.field.snapshot, boss);
    }

    private restoreScriptedBoss(): void {
        const boss = this.scriptedBoss;
        if (boss === null) return;
        boss.abilityContactSuppressed = false;
        if (boss.sprite.scene) { boss.sprite.setAlpha(1); }
        // Phaser Physics 的 shutdown 可能早于场景自定义监听，body 已经被引擎销毁。
        if (boss.sprite.body) {
            const body = boss.body;
            body.checkCollision.none = false;
            if (!boss.dead && this.ctx.bossArena !== null) {
                // 三个支撑采样允许身体自然悬边；中断动作也落回当前脚下真实表面。
                const surfaces = [-body.width / 2 + 2, 0, body.width / 2 - 2].map(offset =>
                    findBossSurface(this.ctx.bossArena!, { x: boss.sprite.x + offset, y: body.bottom }, (x, y) => {
                        const solid = (this.ctx.collisionGroup as Tilemaps.TilemapLayer).getTileAtWorldXY(x, y, true);
                        const one = (this.ctx.onewayGroup as Tilemaps.TilemapLayer).getTileAtWorldXY(x, y, true);
                        return solid !== null && solid.index > 0 && solid.collides || one !== null && one.index > 0;
                    }));
                const y = Math.min(...surfaces.map(surface => surface.y));
                if (Math.abs(body.bottom - y) > 1) { body.reset(boss.sprite.x, y - 24); }
            }
        }
        this.scriptedBoss = null;
    }

    reset(): void {
        this.restoreScriptedBoss();
        if (this.activeBoss !== null) { this.activeBoss.abilityContactSuppressed = false; }
        this.activeBoss = null;
        this.field.clear();
        this.fx.clear();
        this.player.setMoveSpeedFactor(1);
        this.enemies.clearSummons();
    }

    destroy(): void {
        this.reset();
        this.combat.destructibleTargets = null;
        this.fx.destroy();
    }
}
