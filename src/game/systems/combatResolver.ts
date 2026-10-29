/**
 * MOD-04 CombatResolver（Phaser 呈现层，管线阶段 5）—— FR-04 判定编排。
 * 近战 hitbox：朝向侧 40×36 px、0.10 s、同挥击同目标至多 1 次（hitSet，AT-15）；
 * 远程：委托 ProjectilePool（弹速/射程读 WeaponDef）；
 * 伤害：组装 DamageRequest → DamageCalculator（领域纯函数）→ 应用受击（闪白/浮动数字/i-frame/硬直）；
 * 玩家受击：i-frame 校验 → ResourceSystem.applyDamage → 配置驱动的反向击退 → player:damaged（IF-E03）；
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
import { bossWeaponFactor } from '../domain/bossDamage';

const MELEE_LIFETIME_SEC = 0.10;
const IFRAME_HZ = 8; // 8 Hz 闪烁（FR-04 规则 4）

interface MeleeSwing {
    rect: Geom.Rectangle;
    life: number;
    hitSet: Set<EnemyEntity>;
    objectHitSet: Set<string>;
    def: WeaponDef;
    facing: 1 | -1;
    weaponLevelFactor: number;
}
interface AttackSource { weaponId: string; levelFactor: number }

export class CombatResolver {
    /** 可破坏场景对象（蛛卵）；使用稳定id保证同挥击去重。 */
    destructibleTargets: (() => Array<{ id: string; rect: { x: number; y: number; width: number; height: number }; hit: (damage: number) => void }>) | null = null;
    private swings: MeleeSwing[] = [];
    private pendingAreas: Array<{ x: number; y: number; radius: number; damage: number; source: AttackSource }> = [];
    private rng: () => number = Math.random;
    private feedbackUntil = new Map<EnemyEntity, number>();

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
    onAttackBegan: ((type: WeaponDef['type']) => void) | null = null;
    onAttackRejected: ((message: string) => void) | null = null;
    onWeaponVisual: ((def: WeaponDef, rect?: { x: number; y: number; width: number; height: number }) => void) | null = null;
    /** 命中敌人音效/教学钩子（场景内直调，6.2.3） */
    onEnemyHit: (() => void) | null = null;

    /** 测试接缝：注入确定性随机源（TT-01） */
    setRng(rng: () => number): void { this.rng = rng; }

    /** 先校验状态与弹药，再播放动作；失败射击不占用硬直。 */
    tryAttack(hand: 'main' | 'sub'): boolean {
        if (weaponService.isSwitchLocked() || !this.player.canAttack()) { return false; }
        const def = weaponService.getEquippedDefs()[hand];
        if (def === null || (hand === 'sub' && def.type !== 'ranged')) { return false; }
        if (def.type === 'ranged') {
            const ammo = weaponService.consumeAmmo(def.id);
            if (!ammo.ok) {
                this.onAttackRejected?.(ammo.message);
                return false;
            }
        }
        if (!this.player.beginAttack(def.type)) { return false; }
        this.activeWeaponId = def.id;
        if (def.type === 'melee') { this.beginMelee(def, hand); }
        else { this.spawnProjectile(def, 0, hand); }
        return true;
    }

    /** FR-04 规则 1：近战挥击（hitbox 0.10 s + hitSet 去重） */
    beginMelee(def: WeaponDef, hand: 'main' | 'sub' = 'main'): void {
        const p = this.player.getMotionState();
        const rect = new Geom.Rectangle(
            p.x + (p.facing === 1 ? 11 : -11 - def.hitboxSize.w),
            p.y - def.hitboxSize.h / 2,
            def.hitboxSize.w,
            def.hitboxSize.h
        );
        this.swings.push({ rect, life: MELEE_LIFETIME_SEC, hitSet: new Set(), objectHitSet: new Set(), def, facing: p.facing,
            weaponLevelFactor: weaponService.getLevelFactor(def.id, hand) });
        this.onAttackBegan?.('melee');
        this.onWeaponVisual?.(def, rect);
    }

    /** FR-04 规则 2：远程弹丸（弹药校验由调用方 WeaponService.consumeAmmo 完成） */
    spawnProjectile(def: WeaponDef, angleDeg: number, hand: 'main' | 'sub' = 'main', visualSkillId?: string): void {
        const p = this.player.getMotionState();
        this.projectiles.spawn({
            x: p.x + p.facing * 20, y: p.y - 6,
            angleDeg: (p.facing === 1 ? 0 : 180) + angleDeg, speed: def.projectileSpeed ?? 520,
            range: def.range, damage: def.baseDamage,
            side: 'player', sourceId: def.id, weaponLevelFactor: weaponService.getLevelFactor(def.id, hand), visualSkillId
        });
        this.onAttackBegan?.('ranged');
        this.onWeaponVisual?.(def);
    }

    /** 范围伤害（旋风斩等技能执行器调用，FR-07 规则 4） */
    queueAreaDamage(x: number, y: number, radius: number, damage: number): void {
        this.pendingAreas.push({ x, y, radius, damage, source: this.areaSource() });
    }

    private areaSource(): AttackSource {
        const weaponId = weaponService.getEquippedDefs().main?.id ?? this.activeWeaponId;
        return { weaponId, levelFactor: weaponService.getLevelFactor(weaponId, 'main') };
    }

    areaDamage(x: number, y: number, radius: number, damage: number, source = this.areaSource()): void {
        for (const target of this.destructibleTargets?.() ?? []) {
            const r = target.rect;
            if (Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y) <= radius) {
                this.hitDestructible(target, damage, source.levelFactor);
            }
        }
        for (const enemy of this.enemies.getEntities()) {
            if (enemy.dead) { continue; }
            const dist = Math.hypot(enemy.sprite.x - x, enemy.sprite.y - y);
            if (dist <= radius) {
                this.hitEnemy(enemy, damage, x, source.levelFactor, source.weaponId);
            }
        }
    }

    private skillFactor(): number {
        // FR-07：被动 damagePct 聚合（skillFactor = 1 + Σ pct/100）
        return 1 + skillService.passiveBonuses().damagePct / 100;
    }

    /** 管线阶段 5（dt 秒） */
    update(dt: number): void {
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
                const attack = enemy.getNormalAttack?.();
                if (attack !== undefined && attack !== null) {
                    const r = attack.rect;
                    const pb = this.player.body;
                    if (Geom.Rectangle.Overlaps(new Geom.Rectangle(pb.x, pb.y, pb.width, pb.height),
                        new Geom.Rectangle(r.x, r.y, r.width, r.height))) {
                        enemy.consumeNormalAttack();
                        this.hitPlayer(attack.damage, enemy.def.id, attack.fromX ?? enemy.sprite.x);
                        break;
                    }
                }
                if (enemy.suppressesContactDamage?.() || enemy.abilityContactSuppressed) { continue; }
                const hb = enemy.getHurtbox();
                const pb = this.player.body;
                if (Geom.Rectangle.Overlaps(new Geom.Rectangle(pb.x, pb.y, pb.width, pb.height),
                    new Geom.Rectangle(hb.x, hb.y, hb.w, hb.h))) {
                    this.hitPlayer(enemy.def.contactDamage, enemy.def.id, enemy.sprite.x);
                    break; // 同帧单次受击（i-frame 随后生效）
                }
            }
        }

        // K7：本帧死亡优先，死亡等待期间也不再结算残留攻击。
        if (this.player.getMotionState().state === 'dead' || resourceSystem.getSnapshot().hp <= 0) {
            this.swings.length = 0;
            this.pendingAreas.length = 0;
            return;
        }

        for (const area of this.pendingAreas.splice(0)) {
            this.areaDamage(area.x, area.y, area.radius, area.damage, area.source);
        }

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
                    this.hitEnemy(enemy, swing.def.baseDamage, this.player.sprite.x, swing.weaponLevelFactor, swing.def.id);
                }
            }
            for (const target of this.destructibleTargets?.() ?? []) {
                const r = target.rect;
                if (!swing.objectHitSet.has(target.id) && Geom.Rectangle.Overlaps(swing.rect, new Geom.Rectangle(r.x, r.y, r.width, r.height))) {
                    swing.objectHitSet.add(target.id);
                    this.hitDestructible(target, swing.def.baseDamage, swing.weaponLevelFactor);
                }
            }
        }

        // 弹丸 vs 敌人
        for (const proj of this.projectiles.getActive()) {
            if (proj.spec === null || proj.spec.side !== 'player') { continue; }
            const pb = proj.sprite.body as Physics.Arcade.Body;
            const prect = new Geom.Rectangle(pb.x, pb.y, pb.width, pb.height);
            let consumed = false;
            for (const enemy of this.enemies.getEntities()) {
                if (enemy.dead) { continue; }
                const hb = enemy.getHurtbox();
                if (Geom.Rectangle.Overlaps(prect, new Geom.Rectangle(hb.x, hb.y, hb.w, hb.h))) {
                    if (enemy.blocksProjectile?.(proj.sprite.x)) { this.defenseFeedback(enemy, '盾挡'); }
                    else { this.hitEnemy(enemy, proj.spec.damage, proj.sprite.x, proj.spec.weaponLevelFactor ?? 1, proj.spec.sourceId); }
                    this.projectiles.release(proj);
                    consumed = true;
                    break;
                }
            }
            if (consumed) { continue; }
            for (const target of this.destructibleTargets?.() ?? []) {
                const r = target.rect;
                if (Geom.Rectangle.Overlaps(prect, new Geom.Rectangle(r.x, r.y, r.width, r.height))) {
                    this.hitDestructible(target, proj.spec.damage, proj.spec.weaponLevelFactor ?? 1);
                    this.projectiles.release(proj);
                    break;
                }
            }
        }

    }

    private hitDestructible(target: { rect: { x: number; y: number; width: number; height: number }; hit: (damage: number) => void },
        damage: number, weaponLevelFactor: number): void {
        const amount = calcDamage({ baseDamage: damage, weaponLevelFactor, skillFactor: this.skillFactor() }, this.rng).amount;
        target.hit(amount);
        this.fx.damageNumber(target.rect.x + target.rect.width / 2, target.rect.y, amount);
        this.onEnemyHit?.();
    }

    private playerIsInvincible(): boolean {
        return this.player.iFrameUntil > this.scene.time.now;
    }

    private defenseFeedback(enemy: EnemyEntity, message: string): void {
        if ((this.feedbackUntil.get(enemy) ?? 0) > this.scene.time.now) { return; }
        this.feedbackUntil.set(enemy, this.scene.time.now + 450);
        this.fx.message?.(enemy.sprite.x, enemy.sprite.y - 56, message);
    }

    private hitEnemy(enemy: EnemyEntity, baseDamage: number, fromX: number, weaponLevelFactor: number, weaponId: string): void {
        if (enemy.def.kind === 'boss' && (!enemy.bossEngaged
            || enemy.playerInsideArena && !enemy.playerInsideArena(this.player.sprite.x, this.player.sprite.y))) {
            this.defenseFeedback(enemy, '结界守护');
            return;
        }
        // AT-11：Boss 阶段切换无敌期间攻击不造成伤害
        if (enemy.isInvincible(this.scene.time.now)) { return; }
        const defenseFactor = bossWeaponFactor(enemy.def.id, weaponId, enemy.armorBroken);
        const result = calcDamage({
            baseDamage,
            weaponLevelFactor,
            skillFactor: this.skillFactor(), defenseFactor
        }, this.rng);
        if (defenseFactor < 1) { this.defenseFeedback(enemy, '抵抗'); }
        else if (defenseFactor > 1) { this.defenseFeedback(enemy, '弱点'); }
        const died = enemy.applyHit(result.amount, fromX);
        this.fx.damageNumber(enemy.sprite.x, enemy.sprite.y - 30, result.amount);
        this.fx.hitFlash(enemy.sprite);
        this.onEnemyHit?.(); // AT-56 命中音效钩子
        if (died) {
            const coins = enemy.def.coinsDrop[0] + Math.floor(this.rng() * (enemy.def.coinsDrop[1] - enemy.def.coinsDrop[0] + 1));
            emitEvent('enemy:killed', { enemyId: enemy.def.id, coins, position: { x: enemy.sprite.x, y: enemy.sprite.y } });
        }
    }

    /** World hazards share contact/projectile i-frames, feedback and lethal checks. */
    damagePlayer(amount: number, sourceId: string, fromX: number): void {
        if (this.player.getMotionState().state === 'dead' || this.playerIsInvincible()) { return; }
        this.hitPlayer(amount, sourceId, fromX);
    }

    private hitPlayer(amount: number, sourceId: string, fromX: number): void {
        const result = calcDamage({ baseDamage: amount, weaponLevelFactor: 1, skillFactor: 1 }, this.rng);
        const applied = resourceSystem.applyDamage(result.amount);
        if (!applied.ok) { return; }
        // i-frame 0.8 s + 8 Hz 闪烁（FR-04 规则 4）
        this.player.iFrameUntil = this.scene.time.now + ConfigRegistry.playerDefaults().iFrameMs;
        this.startIFrameBlink();
        // 配置驱动的反向击退（FR-04 规则 7）
        const dir = this.player.sprite.x >= fromX ? 1 : -1;
        this.player.body.setVelocityX(dir * ConfigRegistry.playerDefaults().knockbackPx * 3);
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
        this.pendingAreas = [];
        this.feedbackUntil.clear();
    }
}
void ConfigRegistry; // 保留引用（iFrameMs 读取点已在方法内）
