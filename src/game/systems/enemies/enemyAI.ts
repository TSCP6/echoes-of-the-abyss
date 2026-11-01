/** 敌人集合、召唤物生命周期及同屏预算管理。 */
import { Physics, type Scene, type Tilemaps } from 'phaser';
import { ConfigRegistry } from '../../domain/shared/configRegistry';
import { progressService } from '../../domain/progression/progressService';
import { replayProfile, scaleEnemy, type ReplayProfile } from '../../domain/progression/replayRules';
import type { LevelContext } from '../world/levelLoader';
import type { PlayerController } from '../player/playerController';
import type { ProjectilePool } from '../combat/projectilePool';
import { shouldSeparateOneway } from '../world/onewaySeparation';
import { ELITE_TAIL } from '../../data/eliteTail';
import { EnemyEntity } from './enemyEntity';
import type { EnemyEvents } from './enemyTypes';

// 保留既有入口，调用方可按职责逐步改用实体或类型模块。
export { EnemyEntity } from './enemyEntity';
export type { EnemyEvents, ArenaHazard } from './enemyTypes';

const SCREEN_BUDGET = 24;

export class EnemyAI {
    private profile: ReplayProfile;
    private nextEliteCastAtMs = 0;
    private enemies: EnemyEntity[] = [];
    private initialCount = 0;
    private summonColliders: Physics.Arcade.Collider[] = [];
    events: EnemyEvents = { onBossPhase: () => {}, onBossSkill: () => {} };
    projectiles: ProjectilePool | null = null;

    constructor(private scene: Scene, private ctx: LevelContext, private player: PlayerController,
        private groundProbe: (x: number, y: number) => boolean) {
        this.profile = replayProfile(ctx.levelId, progressService.getClearCount(ctx.levelId));
        for (const spawn of ctx.enemySpawns) {
            const base = ConfigRegistry.enemies()[spawn.defId];
            if (base === undefined) { continue; }
            const def = scaleEnemy(base, this.profile);
            const enemy = new EnemyEntity(scene, def, spawn.x, spawn.y, this.groundProbe, def.id, this.profile.damagePercent);
            enemy.rewardKey = `enemy:${spawn.defId}:${spawn.x}:${spawn.y}`;
            if (ctx.levelId?.startsWith('3-') && def.id === 'enm_elite') {
                enemy.enableEliteTail(nowMs => {
                    if (nowMs < this.nextEliteCastAtMs) { return false; }
                    this.nextEliteCastAtMs = nowMs + ELITE_TAIL.castSpacingSec * 1000;
                    return true;
                });
            }
            if (def.kind === 'boss') { enemy.bossArena = ctx.bossArena ?? null; }
            this.enemies.push(enemy);
        }
        this.initialCount = this.enemies.length;
    }

    getEntities(): EnemyEntity[] { return this.enemies; }
    getSummons(): EnemyEntity[] { return this.enemies.slice(this.initialCount); }

    /** FR-03 边界：同屏 >24 最远者冻结 */
    private budgetPass(): void {
        const active = this.enemies.filter((e) => !e.dead);
        if (active.length <= SCREEN_BUDGET) {
            for (const e of active) { e.sleeping = false; }
            return;
        }
        const px = this.player.sprite.x;
        const sorted = [...active].sort((a, b) => Math.abs(a.sprite.x - px) - Math.abs(b.sprite.x - px));
        sorted.forEach((e, i) => { e.sleeping = i >= SCREEN_BUDGET; });
    }

    /** 管线阶段 6；返回完成死亡动画的实体 */
    update(dt: number, nowMs: number): EnemyEntity[] {
        this.budgetPass();
        const finished: EnemyEntity[] = [];
        for (const e of this.enemies) {
            if (e.update(dt, this.player, nowMs, this.events, this.projectiles)) { finished.push(e); }
        }
        return finished;
    }

    /** Boss 召唤小怪（FR-03 Boss 技能） */
    summonAt(x: number, y: number, defId: string, visualId = defId): void {
        const def = ConfigRegistry.enemies()[defId];
        if (def === undefined) { return; }
        const enemy = new EnemyEntity(this.scene, scaleEnemy(def, this.profile), x, y, this.groundProbe, visualId, this.profile.damagePercent);
        this.enemies.push(enemy);
        this.summonColliders.push(this.scene.physics.add.collider(enemy.sprite, this.ctx.collisionGroup));
        this.summonColliders.push(this.scene.physics.add.collider(enemy.sprite, this.ctx.onewayGroup, undefined, (object, target) => {
            const body = (object as Physics.Arcade.Sprite).body as Physics.Arcade.Body;
            return shouldSeparateOneway(body, (target as Tilemaps.Tile).pixelY);
        }));
    }

    clearSummons(): void {
        for (const collider of this.summonColliders) { collider.destroy(); }
        this.summonColliders = [];
        for (const enemy of this.enemies.splice(this.initialCount)) { enemy.sprite.destroy(); }
    }

    /** FR-11 规则 7：玩家死亡后敌人重置 */
    resetAll(): void {
        this.nextEliteCastAtMs = 0;
        this.clearSummons();
        for (const e of this.enemies) { e.reset(); }
    }

    /** Boss 引用（HUD 血条 / 相机锁定） */
    getBoss(): EnemyEntity | null {
        return this.enemies.find((e) => e.def.kind === 'boss' && !e.dead) ?? null;
    }

    destroy(): void {
        for (const collider of this.summonColliders) { collider.destroy(); }
        this.summonColliders = [];
        for (const e of this.enemies) { e.sprite.destroy(); }
        this.enemies = [];
    }
}
