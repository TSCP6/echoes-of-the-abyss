/**
 * MOD-03 EnemyAI（Phaser 呈现层，管线阶段 6）—— FR-03 全部行为。
 * 普通敌人使用 NormalEnemyBrain；精英与特殊召唤物、Boss 保留专用分支。
 * 巡逻型：慢速单发远程；追击型：快速近战扑击；攻击与后摇读 normalEnemyCombat。
 * 追踪：短暂丢失保留最后可见位置，2.5 s 后归巢（AT-09）；地面不跳跃。
 * 飞行：范围内追踪、前摇末锁定、有限时距俯冲、后摇 1.0 s 后升空或归巢（AT-10）。
 * Boss：三阶段（HP 100/66/33% 切换，AT-11）、切换 1.5 s 无敌 + 特效事件、每阶段循环 2~3 技能（DD-06）。
 * 受击 0.15 s 硬直 + 60 px 击退；死亡时长随角色动画配置。
 * 同屏预算 >24 最远冻结（FR-03 边界）。巡逻兵、三个 Boss 与召唤物接入动画。
 */
import { Geom, Physics, type Scene, type Tilemaps } from 'phaser';
import type { EnemyDef, BossPhaseDef } from '../domain/types';
import { ConfigRegistry } from '../domain/configRegistry';
import type { LevelContext } from './levelLoader';
import type { PlayerController } from './playerController';
import type { ProjectilePool } from './projectilePool';
import { EnemyVisual, enemyTexture } from './enemyVisuals';
import { beginBossAttack, tickBossAttack, type BossAttack } from './bossAttack';
import { bossProjectileAngles } from './bossSkillPresentation';
import { getBossCombatProfile } from '../data/bossCombatProfiles';
import type { AbilityRect } from '../domain/bossAbilities';
import { NormalEnemyBrain, type NormalEnemyAttack, type NormalEnemySnapshot } from '../domain/normalEnemyBrain';
import { NORMAL_ENEMY_COMBAT } from '../data/normalEnemyCombat';
import { shouldSeparateOneway } from './onewaySeparation';

const PATROL_SPAN = 128;
const CHASE_LOST_SEC = 2.5;
const HIT_STAGGER_SEC = 0.15;
const KNOCKBACK_IMPULSE = 240; // 短冲量近似 60px 位移
const SCREEN_BUDGET = 24;
const EDGE_PROBE_PX = 8;
const FLYER_CRUISE_RADIUS = 96;
const FLYER_DIVE_RANGE = 220;
const FLYER_DIVE_SPEED = 240;
const FLYER_STAGGER_SEC = 1.0; // AT-10 俯冲后可攻击窗口
const BOSS_SWITCH_INVINCIBLE_MS = 1500;

export interface EnemyEvents {
    onBossPhase: (enemy: EnemyEntity, phaseIndex: number) => void;
    onBossSkill: (enemy: EnemyEntity, kind: string, params: Record<string, number>) => void;
    onBossAttackBegan?: (enemy: EnemyEntity, attack: BossAttack) => void;
}

export class EnemyEntity {
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
    // boss
    private skillQueue: number[] = [];
    private skillCooldown = 0;
    private readonly visual: EnemyVisual;
    private bossAttack: BossAttack | null = null;
    private pressureIndex = 0;
    private wallRecovery = false;
    private phaseOpening: 'spiderEggs' | 'spiderDrop' | null = null;
    private normalBrain: NormalEnemyBrain | null = null;

    constructor(scene: Scene, def: EnemyDef, x: number, y: number,
        private groundProbe: (x: number, y: number) => boolean, private visualId = def.id) {
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
            this.normalBrain = new NormalEnemyBrain(def, combat, { x, y: y + 24 - def.hurtboxSize.h / 2 });
        }
    }

    get body(): Physics.Arcade.Body { return this.sprite.body as Physics.Arcade.Body; }

    getHurtbox(): { x: number; y: number; w: number; h: number } {
        const b = this.body;
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    }

    isInvincible(nowMs: number): boolean { return this.invincibleUntil > nowMs; }

    getBossAttack(): BossAttack | null { return this.dead ? null : this.bossAttack; }

    getNormalCombatState(): NormalEnemySnapshot | null {
        if (this.dead || this.sleeping || this.normalBrain === null) { return null; }
        this.normalBrain.syncPosition(this.body.center);
        return this.normalBrain.snapshot;
    }

    getNormalAttack(): NormalEnemyAttack | null {
        return this.stagger > 0 ? null : this.getNormalCombatState()?.attack ?? null;
    }

    consumeNormalAttack(): void { this.normalBrain?.consumeAttack(); }

    suppressesContactDamage(): boolean {
        const state = this.getNormalCombatState();
        return this.abilityContactSuppressed || state !== null && ['windup', 'active', 'recovery'].includes(state.stage);
    }

    /** FR-03：受击硬直 + 击退；返回是否死亡 */
    applyHit(amount: number, fromX: number): boolean {
        if (this.dead) { return false; }
        this.hp -= amount;
        this.normalBrain?.interrupt();
        // Boss施招计时与范围预警共用节奏，普通攻击不会把其中一方单独暂停。
        const casting = this.def.kind === 'boss' && this.bossAttack !== null;
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

        if (this.normalBrain !== null) { this.updateNormal(dt, player, projectiles); }
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
            case 'boss': this.updateBoss(dt, player, nowMs, events, projectiles); break;
        }
        if (this.def.kind === 'flyer' && Math.abs(this.body.velocity.x) > 1) {
            this.visual.face(this.body.velocity.x > 0 ? 1 : -1);
        }
        this.visual.update(dt, this.isInvincible(nowMs) ? 'phase' : this.body.velocity.length() > 1 ? 'move' : 'idle');
        return false;
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

    /** Boss 三阶段（AT-11）+ 技能循环（DD-06） */
    private updateBoss(dt: number, player: PlayerController, nowMs: number,
        events: EnemyEvents, projectiles: ProjectilePool | null): void {
        this.guardianGuarding = false;
        if (!this.bossEngaged) {
            const enters = this.bossArena !== null ? this.playerInsideArena(player.sprite.x, player.sprite.y)
                : Math.abs(player.sprite.x - this.sprite.x) <= this.def.detectRange
                    && Math.abs(player.sprite.y - this.sprite.y) <= 160;
            if (!enters) {
                this.body.setVelocity(0, 0);
                return;
            }
            this.bossEngaged = true;
            events.onBossPhase(this, this.phaseIndex);
        }
        const ratio = this.hp / this.def.hp;
        const targetPhase = ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : 2;
        if (targetPhase !== this.phaseIndex) {
            this.phaseIndex = targetPhase;
            this.invincibleUntil = nowMs + BOSS_SWITCH_INVINCIBLE_MS;
            this.skillQueue = [];
            this.bossAttack = null;
            this.wallRecovery = false;
            if (this.def.id === 'enm_boss_spider') {
                this.skillCooldown = 0;
                this.phaseOpening = targetPhase === 1 ? 'spiderEggs' : 'spiderDrop';
            }
            events.onBossPhase(this, targetPhase);
        }
        if (this.isInvincible(nowMs)) {
            this.body.setVelocity(0, 0);
            return;
        }
        if (this.bossAttack !== null) {
            const attack = this.bossAttack;
            const transition = tickBossAttack(attack, dt);
            this.dir = attack.direction;
            this.visual.face(this.dir);
            this.body.setVelocity(0, 0);
            if (transition === 'fire') {
                this.executeBossSkill(attack.skill.kind, attack.skill.damage, attack.skill.params, events, projectiles);
            }
            if (attack.stage === 'active' && attack.skill.kind === 'charge') {
                const hitWall = attack.activeSec - attack.remaining > 0.05
                    && (attack.direction === 1 ? this.body.blocked?.right : this.body.blocked?.left);
                if (hitWall) {
                    this.wallRecovery = true;
                    attack.stage = 'recovery';
                    attack.remaining = attack.recoverySec;
                    this.visual.skill('charge', 0);
                } else {
                    this.body.setVelocityX(attack.direction * ((attack.skill.params.distance ?? 240) / attack.activeSec));
                }
            }
            if (transition === 'finished') {
                this.bossAttack = null;
                const followup = getBossCombatProfile(this.def.id)?.pressureFollowupSec;
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
        this.dir = player.sprite.x >= this.sprite.x ? 1 : -1;
        this.visual.face(this.dir);
        const profile = getBossCombatProfile(this.def.id);
        const distance = Math.abs(player.sprite.x - this.sprite.x);
        const far = distance > (profile?.nearRange ?? 220) || Math.abs(player.sprite.y - this.sprite.y) > 80;
        this.guardianGuarding = this.def.id === 'enm_boss_guardian' && far;
        this.body.setVelocityX(this.dir * (far ? profile?.advanceSpeed ?? this.def.moveSpeed : distance > 90 ? this.def.moveSpeed * 0.5 : 0));

        // 技能循环
        this.skillCooldown -= dt;
        if (this.skillQueue.length === 0) {
            const phase = this.def.phases[this.phaseIndex] as BossPhaseDef | undefined;
            if (phase !== undefined) { this.skillQueue = phase.skills.map((_, i) => i); }
        }
        if (this.skillCooldown <= 0 && this.skillQueue.length > 0) {
            const phase = this.def.phases[this.phaseIndex];
            let idx = this.skillQueue[0] as number;
            const opening = phase?.skills.findIndex(s => s.kind === this.phaseOpening) ?? -1;
            if (opening >= 0) { idx = opening; }
            else if (far && phase !== undefined) {
                const kinds = this.def.id === 'enm_boss_guardian'
                    ? Math.abs(player.sprite.y - this.sprite.y) > 80 || !phase.skills.some(s => s.kind === 'charge')
                        ? ['guardianStomp'] : ['charge', 'guardianStomp']
                    : this.def.id === 'enm_boss_spider' ? ['spiderWeb', 'spiderDrop', 'spiderEggs'].filter(k => phase.skills.some(s => s.kind === k))
                        : ['echoStep'];
                const kind = kinds[this.pressureIndex++ % kinds.length];
                const selected = phase.skills.findIndex(s => s.kind === kind);
                if (selected >= 0) { idx = selected; }
            }
            const queued = this.skillQueue.indexOf(idx);
            if (queued >= 0) { this.skillQueue.splice(queued, 1); }
            const skill = phase?.skills[idx];
            if (skill !== undefined && phase !== undefined) {
                this.guardianGuarding = false;
                this.wallRecovery = false;
                this.phaseOpening = null;
                this.skillCooldown = skill.cooldownSec;
                this.bossAttack = beginBossAttack(skill, this.dir);
                this.body.setVelocity(0, 0);
                this.visual.windup(skill.kind);
                events.onBossAttackBegan?.(this, this.bossAttack);
            }
        }
    }

    private executeBossSkill(kind: string, damage: number, params: Record<string, number>,
        events: EnemyEvents, projectiles: ProjectilePool | null): void {
        this.visual.skill(kind, params.activeSec);
        switch (kind) {
            case 'charge': {
                const dist = params.distance ?? 240;
                this.body.setVelocityX(this.dir * (dist / 0.5));
                break;
            }
            case 'projectileSpread': {
                if (projectiles === null) { break; }
                const count = Math.floor(params.count ?? 3);
                const spread = params.spreadDeg ?? 30;
                const speed = params.speed ?? 260;
                for (const angle of bossProjectileAngles(this.dir, count, spread)) {
                    projectiles.spawn({
                        x: this.sprite.x + this.dir * (this.def.hurtboxSize.w / 2 + 8), y: this.body.center.y,
                        angleDeg: angle, speed, range: 600, damage,
                        side: 'enemy', sourceId: this.def.id
                    });
                }
                break;
            }
            case 'summon':
            case 'arenaHazard':
                events.onBossSkill(this, kind, { ...params, damage });
                break;
            default:
                break;
        }
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
        return this.wallRecovery && this.bossAttack?.skill.kind === 'charge' && this.bossAttack.stage === 'recovery';
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
        this.skillQueue = [];
        this.skillCooldown = 0;
        this.bossAttack = null;
        this.bossEngaged = false;
        this.guardianGuarding = false;
        this.pressureIndex = 0;
        this.wallRecovery = false;
        this.phaseOpening = null;
        this.abilityContactSuppressed = false;
        if (this.body.checkCollision) { this.body.checkCollision.none = false; }
        this.diving = false;
        this.diveStagger = 0;
        this.flyT = 0;
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

export class EnemyAI {
    private enemies: EnemyEntity[] = [];
    private initialCount = 0;
    private summonColliders: Physics.Arcade.Collider[] = [];
    events: EnemyEvents = { onBossPhase: () => {}, onBossSkill: () => {} };
    projectiles: ProjectilePool | null = null;

    constructor(private scene: Scene, private ctx: LevelContext, private player: PlayerController,
        private groundProbe: (x: number, y: number) => boolean) {
        for (const spawn of ctx.enemySpawns) {
            const def = ConfigRegistry.enemies()[spawn.defId];
            if (def === undefined) { continue; }
            const enemy = new EnemyEntity(scene, def, spawn.x, spawn.y, this.groundProbe);
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
        const enemy = new EnemyEntity(this.scene, def, x, y, this.groundProbe, visualId);
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

/** Boss 场地危险区矩形（arenaHazard 技能产物，LevelScene 持有并检测） */
export interface ArenaHazard {
    rect: Geom.Rectangle;
    startsAtSec: number;
    untilSec: number;
    damage: number;
    sourceId: string;
}
