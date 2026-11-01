/** 单个敌人的生命、受击、普通行为及表现；Boss 决策委托 BossBehavior。 */
import { Physics, type Scene } from 'phaser';
import type { EnemyDef } from '../../domain/shared/types';
import type { PlayerController } from '../player/playerController';
import type { ProjectilePool } from '../combat/projectilePool';
import { EnemyVisual, enemyTexture } from './enemyVisuals';
import type { BossAttack } from '../boss/bossAttack';
import { BossBehavior } from '../boss/bossBehavior';
import { getBossCombatProfile } from '../../data/bossCombatProfiles';
import type { AbilityRect } from '../../domain/combat/bossAbilities';
import { NormalEnemyBrain, type NormalEnemyAttack, type NormalEnemySnapshot } from '../../domain/combat/normalEnemyBrain';
import { NORMAL_ENEMY_COMBAT } from '../../data/normalEnemyCombat';
import { EliteTail } from '../../domain/combat/eliteTail';
import { ELITE_TAIL } from '../../data/eliteTail';
import type { EnemyEvents } from './enemyTypes';

const PATROL_SPAN = 128;
const CHASE_LOST_SEC = 2.5;
const HIT_STAGGER_SEC = 0.15;
const KNOCKBACK_IMPULSE = 240; // 短冲量近似 60px 位移
const EDGE_PROBE_PX = 8;
const FLYER_CRUISE_RADIUS = 96;
const FLYER_DIVE_RANGE = 220;
const FLYER_DIVE_SPEED = 240;
const FLYER_STAGGER_SEC = 1.0; // AT-10 俯冲后可攻击窗口

export class EnemyEntity {
    rewardKey: string | null = null;
    private damagePercent = 100;
    readonly sprite: Physics.Arcade.Sprite;
    hp: number;
    readonly def: EnemyDef;
    readonly spawnPos: { x: number; y: number };
    sleeping = false;
    dead = false;
    /** Boss 阶段切换无敌截止（游戏时钟 ms） */
    invincibleUntil = 0;
    phaseIndex = 0;
    bossEngaged = false;
    bossArena: AbilityRect | null = null;
    guardianGuarding = false;
    abilityContactSuppressed = false;
    private stagger = 0;
    private dir: 1 | -1 = 1;
    private chaseLost = 0;
    private deathTimer = 0;
    // flyer
    private flyT = 0;
    private diving = false;
    private diveStagger = 0;
    private readonly visual: EnemyVisual;
    private readonly bossBehavior: BossBehavior;
    // 保留原冷却访问入口，已有调试与回归用例仍可观察同一状态。
    private get skillCooldown(): number { return this.bossBehavior.skillCooldown; }
    private set skillCooldown(value: number) { this.bossBehavior.skillCooldown = value; }
    private normalBrain: NormalEnemyBrain | null = null;
    private eliteTail: EliteTail | null = null;
    private tryEliteCast: (nowMs: number) => boolean = () => true;

    constructor(scene: Scene, def: EnemyDef, x: number, y: number,
        private groundProbe: (x: number, y: number) => boolean, private visualId = def.id, damagePercent = 100) {
        this.damagePercent = damagePercent;
        this.def = def;
        this.hp = def.hp;
        if (def.id === 'enm_boss_spider') {
            // The spider walks on the floor; the other two bosses intentionally hover.
            for (let foot = y + 24; foot <= y + 280; foot += 8) {
                if (groundProbe(x, foot)) { y = foot - 24; break; }
            }
        }
        this.spawnPos = { x, y };
        this.sprite = scene.physics.add.sprite(x, y, enemyTexture(visualId, def.kind));
        this.visual = new EnemyVisual(this.sprite, visualId);
        this.bossBehavior = new BossBehavior(this, this.visual, () => this.dir);
        const body = this.body;
        body.setSize(def.hurtboxSize.w, def.hurtboxSize.h);
        // Preserve the old 48px texture's world-space hurtbox and ground baseline.
        const frameSize = this.visual.frameSize;
        body.setOffset((frameSize - def.hurtboxSize.w) / 2, frameSize / 2 + 24 - def.hurtboxSize.h);
        body.setCollideWorldBounds(false);
        if (def.kind === 'flyer' || def.kind === 'boss') { body.setAllowGravity(false); }
        this.sprite.setDepth(6);
        const combat = NORMAL_ENEMY_COMBAT[def.id];
        if (combat !== undefined && visualId === def.id) {
            this.normalBrain = new NormalEnemyBrain(def, { ...combat, damage: Math.round(combat.damage * damagePercent / 100) }, { x, y: y + 24 - def.hurtboxSize.h / 2 });
        }
    }

    get body(): Physics.Arcade.Body { return this.sprite.body as Physics.Arcade.Body; }

    getHurtbox(): { x: number; y: number; w: number; h: number } {
        const b = this.body;
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    }

    isInvincible(nowMs: number): boolean { return this.invincibleUntil > nowMs; }

    getBossAttack(): BossAttack | null { return this.dead ? null : this.bossBehavior.attack; }

    getNormalCombatState(): NormalEnemySnapshot | null {
        if (this.dead || this.sleeping || this.normalBrain === null) { return null; }
        this.normalBrain.syncPosition(this.body.center);
        return this.normalBrain.snapshot;
    }

    getNormalAttack(): NormalEnemyAttack | null {
        const tail = this.getEliteTailState();
        if (tail?.canHit && tail.rect !== null) { return { rect: tail.rect, damage: Math.round(ELITE_TAIL.damage * this.damagePercent / 100), fromX: tail.blade?.x }; }
        return this.stagger > 0 ? null : this.getNormalCombatState()?.attack ?? null;
    }

    consumeNormalAttack(): void { this.normalBrain?.consumeAttack(); this.eliteTail?.consumeHit(); }

    enableEliteTail(tryCast: (nowMs: number) => boolean = () => true): void {
        if (this.def.id !== 'enm_elite') { return; }
        this.eliteTail = new EliteTail(); this.tryEliteCast = tryCast;
    }

    getEliteTailState(): EliteTail['snapshot'] | null {
        return this.dead || this.sleeping ? null : this.eliteTail?.snapshot ?? null;
    }

    suppressesContactDamage(): boolean {
        const state = this.getNormalCombatState();
        const tail = this.getEliteTailState();
        if (tail !== null && ['windup', 'outbound', 'inbound', 'recovery'].includes(tail.stage)) { return true; }
        return this.abilityContactSuppressed || state !== null && ['windup', 'active', 'recovery'].includes(state.stage);
    }

    /** FR-03：受击硬直 + 击退；返回是否死亡 */
    applyHit(amount: number, fromX: number): boolean {
        if (this.dead) { return false; }
        this.hp -= amount;
        this.normalBrain?.interrupt();
        this.eliteTail?.cancel();
        // Boss施招计时与范围预警共用节奏，普通攻击不会把其中一方单独暂停。
        const casting = this.def.kind === 'boss' && this.bossBehavior.attack !== null;
        this.stagger = this.def.kind === 'boss' ? 0 : HIT_STAGGER_SEC;
        const dir = this.sprite.x >= fromX ? 1 : -1;
        if (this.def.kind !== 'boss') { this.body.setVelocityX(dir * KNOCKBACK_IMPULSE); }
        if (this.hp <= 0) {
            this.dead = true;
            this.deathTimer = this.visual.deathDuration;
            this.body.setEnable(false);
            if (!this.visual.hasArt) { this.sprite.setAlpha(0.6); }
        }
        if (this.dead || !casting) { this.visual.update(0, this.dead ? 'dead' : 'hit'); }
        return this.dead;
    }

    /** 管线阶段 6；返回本帧是否完成死亡动画 */
    update(dt: number, player: PlayerController, nowMs: number, events: EnemyEvents,
        projectiles: ProjectilePool | null): boolean {
        if (this.dead) {
            this.visual.update(dt, 'dead');
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) { this.sprite.setVisible(false); return true; }
            return false;
        }
        if (this.sleeping) { this.body.setVelocity(0, 0); this.visual.update(0, 'idle', true); return false; }
        if (this.stagger > 0) {
            this.stagger -= dt;
            this.visual.update(dt, 'hit');
            return false;
        }

        if (this.eliteTail !== null) { this.updateEliteTail(dt, player, nowMs); }
        else if (this.normalBrain !== null) { this.updateNormal(dt, player, projectiles); }
        else switch (this.def.kind) {
            case 'patrol':
                if (this.visualId === 'spiderling') {
                    this.dir = player.sprite.x >= this.sprite.x ? 1 : -1;
                    this.body.setVelocityX(this.dir * (getBossCombatProfile('enm_boss_spider')?.advanceSpeed ?? this.def.moveSpeed));
                    this.visual.face(this.dir);
                } else { this.updatePatrol(dt, player); }
                break;
            case 'chaser': this.updateChaser(dt, player); break;
            case 'flyer': this.updateFlyer(dt, player); break;
            case 'boss': this.bossBehavior.update(dt, player, nowMs, events, projectiles); break;
        }
        if (this.def.kind === 'flyer' && Math.abs(this.body.velocity.x) > 1) {
            this.visual.face(this.body.velocity.x > 0 ? 1 : -1);
        }
        this.visual.update(dt, this.isInvincible(nowMs) ? 'phase' : this.body.velocity.length() > 1 ? 'move' : 'idle');
        return false;
    }

    private updateEliteTail(dt: number, player: PlayerController, nowMs: number): void {
        const skill = this.eliteTail!;
        const previous = skill.snapshot;
        const b = this.body;
        const p = player.body.center;
        if (player.getMotionState?.().state === 'dead') { skill.cancel(); }
        let blocked = false;
        const blade = previous.blade ?? (previous.stage === 'windup' ? previous.origin : null);
        if (blade !== null) {
            const direction = previous.stage === 'inbound' ? -previous.direction : previous.direction;
            const distance = Math.abs(blade.x - previous.origin.x);
            const remaining = previous.stage === 'inbound' ? distance : ELITE_TAIL.range - distance;
            const travel = Math.min(ELITE_TAIL.speed * dt, remaining);
            for (let at = 0; at <= Math.ceil(travel / 4); at++) {
                const d = Math.min(at * 4, travel);
                const x = blade.x + direction * (d + ELITE_TAIL.width / 2);
                if ([-ELITE_TAIL.height / 2, 0, ELITE_TAIL.height / 2].some(y => this.groundProbe(x, blade.y + y))) {
                    blocked = true; break;
                }
            }
        }
        skill.tick(dt, blocked);
        const state = skill.snapshot;
        b.setVelocityX(0);
        if (['windup', 'outbound', 'inbound', 'recovery'].includes(state.stage)) { this.visual.face(state.direction); return; }
        this.dir = p.x >= b.center.x ? 1 : -1;
        this.visual.face(this.dir);
        const distance = Math.abs(p.x - b.center.x);
        let visible = distance <= this.def.detectRange && Math.abs(p.y - b.center.y) <= 48;
        for (let d = 8; visible && d < distance; d += 8) {
            visible = !this.groundProbe(b.center.x + this.dir * d, b.center.y);
        }
        if (!visible) { return; }
        if (state.stage === 'idle' && distance <= ELITE_TAIL.triggerRange && b.blocked.down && this.tryEliteCast(nowMs)) {
            skill.start(b.center.x, b.center.y, this.dir); return;
        }
        const front = b.center.x + this.dir * (b.width / 2 + this.def.moveSpeed * dt + EDGE_PROBE_PX);
        if (distance > ELITE_TAIL.triggerRange && b.blocked.down
            && !(this.dir > 0 ? b.blocked.right : b.blocked.left) && this.groundProbe(front, b.bottom + EDGE_PROBE_PX)) {
            b.setVelocityX(this.dir * this.def.moveSpeed);
        }
    }

    private updateNormal(dt: number, player: PlayerController, projectiles: ProjectilePool | null): void {
        const brain = this.normalBrain!;
        const body = this.body;
        const position = body.center;
        const target = player.body.center;
        const previous = brain.snapshot.stage;
        const grounded = body.blocked.down || body.touching?.down;
        const probe = this.def.hurtboxSize.w / 2 + Math.max(this.def.moveSpeed,
            brain.combat.kind === 'melee' ? brain.combat.lungeSpeed : 0) * dt + EDGE_PROBE_PX;
        let visible = true;
        const length = Math.hypot(target.x - position.x, target.y - position.y);
        for (let at = 16; at < length; at += 16) {
            if (this.groundProbe(position.x + (target.x - position.x) * at / length,
                position.y + (target.y - position.y) * at / length)) { visible = false; break; }
        }
        const motion = brain.tick(dt, {
            x: position.x, y: position.y, player: target,
            canMoveLeft: !!grounded && !body.blocked.left && this.groundProbe(position.x - probe, body.bottom + EDGE_PROBE_PX),
            canMoveRight: !!grounded && !body.blocked.right && this.groundProbe(position.x + probe, body.bottom + EDGE_PROBE_PX),
            blocked: body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down,
            visible, playerAlive: player.getMotionState?.().state !== 'dead'
        });
        if (this.def.kind === 'flyer') { body.setVelocity(motion.vx, motion.vy); }
        else { body.setVelocityX(motion.vx); }
        const state = brain.snapshot;
        this.visual.face(state.facing);
        if (state.stage !== previous) {
            // 当前素材缺少独立攻击帧：前摇停姿、释放时恢复运动动画；范围特效读同一快照。
            this.visual.update(0, state.stage === 'active' ? 'move' : 'idle');
        }
        if (motion.fire && brain.combat.kind === 'ranged') {
            projectiles?.spawn({
                x: position.x + state.facing * (body.width / 2 + 10), y: position.y,
                angleDeg: Math.atan2(state.target.y - position.y, state.target.x - position.x) * 180 / Math.PI,
                speed: brain.combat.projectileSpeed, range: brain.combat.projectileRange,
                damage: brain.combat.damage, side: 'enemy', sourceId: this.def.id
            });
        }
    }

    private updatePatrol(dt: number, player: PlayerController): void {
        const inDetect = this.playerInRange(player, this.def.detectRange);
        if (inDetect) { this.updateChase(dt, player); return; }
        const body = this.body;
        const offset = this.sprite.x - this.spawnPos.x;
        if (offset > PATROL_SPAN) { this.dir = -1; }
        if (offset < -PATROL_SPAN) { this.dir = 1; }
        if (body.blocked.left) { this.dir = 1; }
        if (body.blocked.right) { this.dir = -1; }
        if (!this.hasGroundAhead()) { this.dir = this.dir === 1 ? -1 : 1; }
        body.setVelocityX(this.dir * this.def.moveSpeed);
        this.visual.face(this.dir);
    }

    private updateChaser(dt: number, player: PlayerController): void {
        const inDetect = this.playerInRange(player, this.def.detectRange);
        if (inDetect) {
            this.chaseLost = 0;
            this.dir = player.sprite.x >= this.sprite.x ? 1 : -1;
            this.body.setVelocityX(this.dir * this.def.moveSpeed);
        } else {
            this.chaseLost += dt;
            if (this.chaseLost >= CHASE_LOST_SEC) {
                this.chaseLost = 0; // 返回巡逻路径（patrol 分支下帧接管；chaser 原地待命）
                this.body.setVelocityX(0);
            }
        }
        this.visual.face(this.dir);
    }

    private updateChase(dt: number, player: PlayerController): void {
        this.dir = player.sprite.x >= this.sprite.x ? 1 : -1;
        this.body.setVelocityX(this.dir * this.def.moveSpeed);
        this.visual.face(this.dir);
        void dt;
    }

    /** 飞行：正弦巡航 + 俯冲 + 硬直（AT-10） */
    private updateFlyer(dt: number, player: PlayerController): void {
        const body = this.body;
        if (this.diveStagger > 0) {
            this.diveStagger -= dt;
            body.setVelocity(0, 0);
            return;
        }
        const dist = Math.hypot(player.sprite.x - this.sprite.x, player.sprite.y - this.sprite.y);
        if (!this.diving && dist <= FLYER_DIVE_RANGE) {
            this.diving = true;
            const dx = player.sprite.x - this.sprite.x;
            const dy = player.sprite.y - this.sprite.y;
            body.setVelocity((dx / dist) * FLYER_DIVE_SPEED, (dy / dist) * FLYER_DIVE_SPEED);
            return;
        }
        if (this.diving) {
            // 俯冲结束（接近玩家或超时由距离回升判定）→ 硬直 1.0 s
            if (dist < 40 || body.velocity.length() === 0) {
                this.diving = false;
                this.diveStagger = FLYER_STAGGER_SEC;
                body.setVelocity(0, 0);
            }
            return;
        }
        // 巡航：锚点半径 96 正弦
        this.flyT += dt;
        const cx = this.spawnPos.x + Math.cos(this.flyT * 1.2) * FLYER_CRUISE_RADIUS;
        const cy = this.spawnPos.y + Math.sin(this.flyT * 2.4) * 24;
        body.setVelocity((cx - this.sprite.x) * 2, (cy - this.sprite.y) * 2);
    }

    faceAbility(direction: 1 | -1): void { this.dir = direction; this.visual.face(direction); }

    playerInsideArena(x: number, y: number): boolean {
        const r = this.bossArena;
        return r === null || x + 11 > r.x && x - 11 < r.x + r.width && y + 32 > r.y && y - 12 < r.y + r.height;
    }

    blocksProjectile(fromX: number): boolean {
        return this.guardianGuarding && (fromX - this.sprite.x) * this.dir >= 0;
    }

    get armorBroken(): boolean {
        return this.bossBehavior.armorBroken;
    }

    private playerInRange(player: PlayerController, range: number): boolean {
        const dx = Math.abs(player.sprite.x - this.sprite.x);
        const dy = Math.abs(player.sprite.y - this.sprite.y);
        return dx <= range && dy <= 48;
    }

    private hasGroundAhead(): boolean {
        const probeX = this.sprite.x + this.dir * (this.def.hurtboxSize.w / 2 + EDGE_PROBE_PX);
        const probeY = this.sprite.y + this.def.hurtboxSize.h / 2 + EDGE_PROBE_PX;
        return this.groundProbe(probeX, probeY);
    }

    reset(): void {
        this.hp = this.def.hp;
        this.dead = false;
        this.sleeping = false;
        this.stagger = 0;
        this.phaseIndex = 0;
        this.invincibleUntil = 0;
        this.bossBehavior.reset();
        this.skillCooldown = 0;
        this.bossEngaged = false;
        this.guardianGuarding = false;
        this.abilityContactSuppressed = false;
        if (this.body.checkCollision) { this.body.checkCollision.none = false; }
        this.diving = false;
        this.diveStagger = 0;
        this.flyT = 0;
        if (this.eliteTail !== null) { this.eliteTail = new EliteTail(); }
        if (this.normalBrain !== null) {
            this.normalBrain = new NormalEnemyBrain(this.def, this.normalBrain.combat, { ...this.normalBrain.home });
        }
        this.visual.reset();
        this.sprite.setPosition(this.spawnPos.x, this.spawnPos.y);
        this.sprite.setVisible(true);
        this.sprite.setAlpha(1);
        this.body.setEnable(true);
        this.body.setVelocity(0, 0);
    }
}
