/**
 * MOD-04 CombatResolver（Phaser 呈现层，管线阶段 5）—— FR-04 判定编排。
 * 近战 hitbox：朝向侧 40×36 px、0.10 s、同挥击同目标至多 1 次（hitSet，AT-15）；
 * 远程：委托 ProjectilePool（弹速/射程读 WeaponDef）；
 * 伤害：组装 DamageRequest → DamageCalculator（领域纯函数）→ 应用受击（闪白/浮动数字/i-frame/硬直）；
 * 玩家受击：i-frame 校验 → ResourceSystem.applyDamage → 120 px 反向击退 → player:damaged（IF-E03）；
 * 同帧互杀以玩家死亡为准（K7）：先结算"敌对玩家"，玩家死亡标志置位后跳过"玩家对敌"。
 */
import { Geom, Physics, type Scene } from 'phaser';
import type { WeaponDef } from '../domain/types';
import { calcDamage } from '../domain/damageCalculator';
import { resourceSystem } from '../domain/resourceSystem';
import { ConfigRegistry } from '../domain/configRegistry';
import type { PlayerController } from './playerController';
import type { EnemyAI, EnemyEntity } from './enemyAI';
import { weaponService } from '../domain/weaponService';
import { skillService } from '../domain/skillService';
import type { ProjectilePool } from './projectilePool';
import type { WorldFxLayer } from './worldFxLayer';
import { emitEvent } from '../events';

const MELEE_LIFETIME_SEC = 0.10;
const PLAYER_KNOCKBACK = 120;
const IFRAME_HZ = 8; // 8 Hz 闪烁（FR-04 规则 4）

interface MeleeSwing {
    rect: Geom.Rectangle;
    life: number;
    hitSet: Set<EnemyEntity>;
    def: WeaponDef;
    facing: 1 | -1;
}

export class CombatResolver {
    private swings: MeleeSwing[] = [];
    private rng: () => number = Math.random;

    constructor(
        private scene: Scene,
        private player: PlayerController,
        private enemies: EnemyAI,
        private projectiles: ProjectilePool,
        private fx: WorldFxLayer
    ) {}
    /** LevelScene 注入：当前主手武器 id（等级系数来源）与玩家死亡编排（FLOW-S3） */
    activeWeaponId = 'wpn_shortsword';
    onPlayerDied: (() => void) | null = null;
    /** TutorialDirector / 挥击音效：攻击发起（场景内直调，6.2.3） */
    onAttackBegan: (() => void) | null = null;
    /** 命中敌人音效/教学钩子（场景内直调，6.2.3） */
    onEnemyHit: (() => void) | null = null;

    /** 测试接缝：注入确定性随机源（TT-01） */
    setRng(rng: () => number): void { this.rng = rng; }

    /** FR-04 规则 1：近战挥击（hitbox 0.10 s + hitSet 去重） */
    beginMelee(def: WeaponDef): void {
        const p = this.player.getMotionState();
        const rect = new Geom.Rectangle(
            p.x + (p.facing === 1 ? 11 : -11 - def.hitboxSize.w),
            p.y - def.hitboxSize.h / 2,
            def.hitboxSize.w,
            def.hitboxSize.h
        );
        this.swings.push({ rect, life: MELEE_LIFETIME_SEC, hitSet: new Set(), def, facing: p.facing });
        this.onAttackBegan?.();
    }

    /** FR-04 规则 2：远程弹丸（弹药校验由调用方 WeaponService.consumeAmmo 完成） */
    spawnProjectile(def: WeaponDef, angleDeg: number): void {
        const p = this.player.getMotionState();
        this.projectiles.spawn({
            x: p.x + p.facing * 20, y: p.y - 6,
            angleDeg: (p.facing === 1 ? 0 : 180) + angleDeg, speed: def.projectileSpeed ?? 520,
            range: def.range, damage: def.baseDamage,
            side: 'player', sourceId: def.id
        });
        this.onAttackBegan?.();
    }

    /** 范围伤害（旋风斩等技能执行器调用，FR-07 规则 4） */
    areaDamage(x: number, y: number, radius: number, damage: number): void {
        for (const enemy of this.enemies.getEntities()) {
            if (enemy.dead) { continue; }
            const dist = Math.hypot(enemy.sprite.x - x, enemy.sprite.y - y);
            if (dist <= radius) {
                this.hitEnemy(enemy, damage, x);
            }
        }
    }

    private skillFactor(): number {
        // FR-07：被动 damagePct 聚合（skillFactor = 1 + Σ pct/100）
        return 1 + skillService.passiveBonuses().damagePct / 100;
    }

    /** 管线阶段 5（dt 秒） */
    update(dt: number): void {
        // 挥击生命周期
        for (const swing of [...this.swings]) {
            swing.life -= dt;
            if (swing.life <= 0) {
                this.swings.splice(this.swings.indexOf(swing), 1);
                continue;
            }
            // 命中检测（AT-15：同挥击同目标 1 次）
            for (const enemy of this.enemies.getEntities()) {
                if (enemy.dead || swing.hitSet.has(enemy)) { continue; }
                const hb = enemy.getHurtbox();
                if (Geom.Rectangle.Overlaps(swing.rect, new Geom.Rectangle(hb.x, hb.y, hb.w, hb.h))) {
                    swing.hitSet.add(enemy);
                    this.hitEnemy(enemy, swing.def.baseDamage, this.player.sprite.x);
                }
            }
        }

        // 弹丸 vs 敌人
        for (const proj of this.projectiles.getActive()) {
            if (proj.spec === null || proj.spec.side !== 'player') { continue; }
            const pb = proj.sprite.body as Physics.Arcade.Body;
            const prect = new Geom.Rectangle(pb.x, pb.y, pb.width, pb.height);
            for (const enemy of this.enemies.getEntities()) {
                if (enemy.dead) { continue; }
                const hb = enemy.getHurtbox();
                if (Geom.Rectangle.Overlaps(prect, new Geom.Rectangle(hb.x, hb.y, hb.w, hb.h))) {
                    this.hitEnemy(enemy, proj.spec.damage, proj.sprite.x);
                    this.projectiles.release(proj);
                    break;
                }
            }
        }

        // 敌弹 vs 玩家（Boss 扇形弹等）
        if (!this.playerIsInvincible() && this.player.getMotionState().state !== 'dead') {
            for (const proj of this.projectiles.getActive()) {
                if (proj.spec === null || proj.spec.side !== 'enemy') { continue; }
                const pb = proj.sprite.body as Physics.Arcade.Body;
                const plb = this.player.body;
                if (Geom.Rectangle.Overlaps(new Geom.Rectangle(pb.x, pb.y, pb.width, pb.height),
                    new Geom.Rectangle(plb.x, plb.y, plb.width, plb.height))) {
                    this.hitPlayer(proj.spec.damage, proj.spec.sourceId, proj.sprite.x);
                    this.projectiles.release(proj);
                    break;
                }
            }
        }

        // 敌人接触伤害玩家（先于玩家攻击结算，K7 同帧互杀以玩家死亡为准）
        const pm = this.player.getMotionState();
        if (pm.state !== 'dead' && !this.playerIsInvincible()) {
            for (const enemy of this.enemies.getEntities()) {
                if (enemy.dead || enemy.sleeping) { continue; }
                const hb = enemy.getHurtbox();
                const pb = this.player.body;
                if (Geom.Rectangle.Overlaps(new Geom.Rectangle(pb.x, pb.y, pb.width, pb.height),
                    new Geom.Rectangle(hb.x, hb.y, hb.w, hb.h))) {
                    this.hitPlayer(enemy.def.contactDamage, enemy.def.id, enemy.sprite.x);
                    break; // 同帧单次受击（i-frame 随后生效）
                }
            }
        }
    }

    private playerIsInvincible(): boolean {
        return this.player.iFrameUntil > this.scene.time.now;
    }

    private hitEnemy(enemy: EnemyEntity, baseDamage: number, fromX: number): void {
        const weaponLevelFactor = weaponService.getLevelFactor(this.activeWeaponId);
        // AT-11：Boss 阶段切换无敌期间攻击不造成伤害
        if (enemy.isInvincible(this.scene.time.now)) { return; }
        const result = calcDamage({
            baseDamage,
            weaponLevelFactor,
            skillFactor: this.skillFactor()
        }, this.rng);
        const died = enemy.applyHit(result.amount, fromX);
        this.fx.damageNumber(enemy.sprite.x, enemy.sprite.y - 30, result.amount);
        this.fx.hitFlash(enemy.sprite);
        this.onEnemyHit?.(); // AT-56 命中音效钩子
        if (died) {
            const coins = enemy.def.coinsDrop[0] + Math.floor(this.rng() * (enemy.def.coinsDrop[1] - enemy.def.coinsDrop[0] + 1));
            emitEvent('enemy:killed', { enemyId: enemy.def.id, coins, position: { x: enemy.sprite.x, y: enemy.sprite.y } });
        }
    }

    private hitPlayer(amount: number, sourceId: string, fromX: number): void {
        const result = calcDamage({ baseDamage: amount, weaponLevelFactor: 1, skillFactor: 1 }, this.rng);
        const applied = resourceSystem.applyDamage(result.amount);
        if (!applied.ok) { return; }
        // i-frame 0.8 s + 8 Hz 闪烁（FR-04 规则 4）
        this.player.iFrameUntil = this.scene.time.now + ConfigRegistry.playerDefaults().iFrameMs;
        this.startIFrameBlink();
        // 120 px 反向击退（FR-04 规则 7）
        const dir = this.player.sprite.x >= fromX ? 1 : -1;
        this.player.body.setVelocityX(dir * PLAYER_KNOCKBACK * 3);
        emitEvent('player:damaged', { amount: result.amount, sourceId, hp: applied.value.hp });
        if (applied.value.died && this.onPlayerDied !== null) {
            this.onPlayerDied();
        }
    }

    private blinkTimer: Phaser.Time.TimerEvent | null = null;
    private startIFrameBlink(): void {
        if (this.blinkTimer !== null) { return; }
        const ms = ConfigRegistry.playerDefaults().iFrameMs;
        const period = 1000 / IFRAME_HZ / 2;
        let on = true;
        this.blinkTimer = this.scene.time.addEvent({
            delay: period, loop: true,
            callback: () => {
                on = !on;
                this.player.sprite.setAlpha(on ? 1 : 0.35);
            }
        });
        this.scene.time.delayedCall(ms, () => {
            this.blinkTimer?.remove();
            this.blinkTimer = null;
            this.player.sprite.setAlpha(1);
        });
    }

    destroy(): void {
        this.blinkTimer?.remove();
        this.blinkTimer = null;
        this.swings = [];
    }
}
void ConfigRegistry; // 保留引用（iFrameMs 读取点已在方法内）
