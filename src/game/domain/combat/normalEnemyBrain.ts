import type { EnemyDef } from '../shared/types';

interface CombatTiming {
    damage: number; windupSec: number; activeSec: number; recoverySec: number;
    cooldownSec: number; lostSec: number; leashRange: number;
}
export type NormalEnemyCombatDef = CombatTiming & (
    | { kind: 'melee'; attackRange: number; reach: number; height: number; lungeSpeed: number }
    | { kind: 'ranged'; minRange: number; maxRange: number; retreatDistance: number; projectileSpeed: number; projectileRange: number }
    | { kind: 'dive'; trackSpeed: number; hoverHeight: number; attackRange: number; lockSec: number; diveSpeed: number; diveDistance: number; cruiseRadius: number }
);
export type NormalEnemyStage = 'patrol' | 'chase' | 'windup' | 'active' | 'recovery' | 'cooldown' | 'return';
export interface EnemyPoint { x: number; y: number }
export interface NormalEnemyInput extends EnemyPoint {
    player: EnemyPoint;
    canMoveLeft: boolean; canMoveRight: boolean;
    blocked: boolean; visible: boolean; playerAlive: boolean;
}
export interface NormalEnemyAttack {
    rect: { x: number; y: number; width: number; height: number };
    damage: number;
    fromX?: number;
}
export interface NormalEnemySnapshot {
    kind: NormalEnemyCombatDef['kind']; stage: NormalEnemyStage; facing: 1 | -1;
    target: EnemyPoint; locked: boolean; progress: number;
    attack: NormalEnemyAttack | null;
    warning: NormalEnemyAttack['rect'] | null;
}
export interface NormalEnemyMotion { vx: number; vy: number; fire: boolean }

/** 普通敌人的决策与攻击几何；输入为实际刚体中心，不依赖 Phaser 或 DOM。 */
export class NormalEnemyBrain {
    private stage: NormalEnemyStage = 'patrol';
    private facing: 1 | -1 = 1;
    private remaining = 0;
    private cooldown = 0;
    private lost = 0;
    private retreated = 0;
    private cruiseT = 0;
    private target: EnemyPoint;
    private lastSeen: EnemyPoint;
    private locked = false;
    private diveStart: EnemyPoint;
    private diveVelocity = { x: 0, y: 0 };
    private delivered = false;
    private returningHome = false;
    private engaged = false;
    private position: EnemyPoint;

    constructor(readonly def: EnemyDef, readonly combat: NormalEnemyCombatDef, readonly home: EnemyPoint) {
        this.position = { ...home };
        this.target = { ...home };
        this.lastSeen = { ...home };
        this.diveStart = { ...home };
    }

    private enter(stage: NormalEnemyStage, duration = 0): void {
        this.stage = stage;
        this.remaining = duration;
        if (stage === 'windup') { this.delivered = false; this.locked = this.combat.kind === 'melee'; }
        if (stage === 'recovery') { this.cooldown = this.combat.cooldownSec; }
    }

    interrupt(): void {
        // 中断前摇不会保留无限期施招状态，也不会在受击结束后补发攻击。
        if (['windup', 'active'].includes(this.stage)) { this.enter('recovery', this.combat.recoverySec); }
    }

    consumeAttack(): void { this.delivered = true; }

    get snapshot(): NormalEnemySnapshot {
        let attack: NormalEnemyAttack | null = null;
        const c = this.combat;
        if (['windup', 'active'].includes(this.stage) && c.kind !== 'ranged') {
            const width = c.kind === 'melee' ? c.reach : this.def.hurtboxSize.w;
            const height = c.kind === 'melee' ? c.height : this.def.hurtboxSize.h;
            const x = c.kind === 'melee'
                ? this.position.x + (this.facing === 1 ? this.def.hurtboxSize.w / 2 : -this.def.hurtboxSize.w / 2 - width)
                : this.position.x - width / 2;
            attack = { rect: { x, y: this.position.y - height / 2, width, height }, damage: c.damage };
        }
        return { kind: c.kind, stage: this.stage, facing: this.facing, target: { ...this.target }, locked: this.locked,
            progress: this.stage === 'windup' ? 1 - this.remaining / c.windupSec : 0,
            warning: c.kind === 'melee' && this.stage === 'windup' ? attack?.rect ?? null : null,
            attack: this.stage === 'active' && !this.delivered ? attack : null };
    }

    /** 读取本帧物理位置；伤害结算先于下一次 AI tick，不使用上一帧的攻击盒。 */
    syncPosition(position: EnemyPoint): void { this.position = { ...position }; }

    tick(dt: number, input: NormalEnemyInput): NormalEnemyMotion {
        this.syncPosition(input);
        const c = this.combat;
        const motion = { vx: 0, vy: 0, fire: false };
        const dx = input.player.x - input.x;
        const dy = input.player.y - input.y;
        const distance = Math.hypot(dx, dy);
        const homeDistance = Math.hypot(input.x - this.home.x, input.y - this.home.y);
        const sees = input.playerAlive && input.visible && distance <= this.def.detectRange
            && (c.kind === 'dive' || Math.abs(dy) <= 48);
        if (sees && !this.returningHome) { this.engaged = true; this.lastSeen = { ...input.player }; }
        this.lost = sees ? 0 : this.lost + dt;
        const pursue = input.playerAlive && this.lost < c.lostSec && homeDistance < c.leashRange;

        if (this.stage === 'recovery') {
            this.remaining -= dt;
            if (this.remaining <= 0) { this.enter(c.kind === 'dive' ? 'return' : 'cooldown'); }
            return motion;
        }
        this.cooldown = Math.max(0, this.cooldown - dt);
        if (this.stage === 'windup') {
            if (!input.playerAlive) { this.enter('recovery', c.recoverySec); return motion; }
            this.remaining -= dt;
            if (!this.locked) {
                this.target = { ...input.player };
                this.facing = dx >= 0 ? 1 : -1;
                this.locked = this.remaining <= (c.kind === 'dive' ? c.lockSec : 0.18);
            }
            if (this.remaining <= 0) {
                this.enter('active', c.activeSec);
                if (c.kind === 'ranged') { motion.fire = true; }
                if (c.kind === 'dive') {
                    this.diveStart = { x: input.x, y: input.y };
                    const tx = this.target.x - input.x, ty = this.target.y - input.y;
                    const length = Math.hypot(tx, ty);
                    this.diveVelocity = length > 0.001
                        ? { x: tx / length * c.diveSpeed, y: ty / length * c.diveSpeed } : { x: 0, y: c.diveSpeed };
                }
            } else { return motion; }
        } else if (this.stage === 'active') {
            this.remaining -= dt;
        }
        if (this.stage === 'active') {
            const passed = c.kind === 'dive' && (this.target.x - input.x) * this.diveVelocity.x
                + (this.target.y - input.y) * this.diveVelocity.y <= 0;
            const endDive = c.kind === 'dive' && (input.blocked || passed
                || Math.hypot(input.x - this.diveStart.x, input.y - this.diveStart.y) >= c.diveDistance);
            if (this.remaining <= 0 || endDive || !input.playerAlive) {
                this.enter('recovery', c.recoverySec);
                return motion;
            }
            if (c.kind === 'melee') { motion.vx = this.safeGroundSpeed(this.facing * c.lungeSpeed, input); }
            if (c.kind === 'dive') { motion.vx = this.diveVelocity.x; motion.vy = this.diveVelocity.y; }
            return motion;
        }

        if (c.kind === 'dive') {
            if (this.engaged && !pursue || homeDistance >= c.leashRange) { this.returningHome = true; }
            if (this.returningHome) {
                this.enter('return');
                if (homeDistance > 12) { return this.flyToward(this.home, input, c.trackSpeed); }
                this.returningHome = false; this.engaged = false; this.lost = c.lostSec;
            }
            if (!sees && !this.engaged) {
                this.enter('patrol'); this.cruiseT += dt;
                return this.flyToward({ x: this.home.x + Math.cos(this.cruiseT * 1.2) * c.cruiseRadius,
                    y: this.home.y + Math.sin(this.cruiseT * 2.4) * 24 }, input, this.def.moveSpeed);
            }
            const tracked = sees ? input.player : this.lastSeen;
            this.facing = tracked.x >= input.x ? 1 : -1;
            if (sees && this.cooldown <= 0 && distance <= c.attackRange && dy >= 40) {
                this.target = { ...input.player }; this.enter('windup', c.windupSec); return motion;
            }
            this.enter(this.cooldown > 0 ? 'return' : 'chase');
            return this.flyToward({ x: tracked.x - this.facing * 60, y: tracked.y - c.hoverHeight }, input, c.trackSpeed);
        }

        if (!pursue && this.engaged) { this.returningHome = true; }
        if (this.returningHome) {
            this.enter('return'); this.retreated = 0;
            if (Math.abs(input.x - this.home.x) > 12) {
                this.facing = input.x < this.home.x ? 1 : -1;
                motion.vx = this.safeGroundSpeed(this.facing * this.def.moveSpeed, input);
                return motion;
            }
            this.returningHome = false; this.engaged = false;
        }
        if (!sees) {
            if (this.engaged && pursue) {
                this.enter('chase');
                const rememberedDx = this.lastSeen.x - input.x;
                this.facing = rememberedDx >= 0 ? 1 : -1;
                if (Math.abs(rememberedDx) > (c.kind === 'melee' ? 12 : c.maxRange)) {
                    motion.vx = this.safeGroundSpeed(this.facing * this.def.moveSpeed, input);
                }
                return motion;
            }
            this.enter('patrol');
            if (input.x - this.home.x > 128) { this.facing = -1; }
            if (input.x - this.home.x < -128) { this.facing = 1; }
            if (!(this.facing === 1 ? input.canMoveRight : input.canMoveLeft)) { this.facing = this.facing === 1 ? -1 : 1; }
            motion.vx = this.safeGroundSpeed(this.facing * this.def.moveSpeed, input);
            return motion;
        }
        this.facing = dx >= 0 ? 1 : -1;
        this.enter(this.cooldown > 0 ? 'cooldown' : 'chase');
        if (c.kind === 'melee') {
            if (Math.abs(dx) <= c.attackRange) {
                if (this.cooldown <= 0) { this.target = { ...input.player }; this.enter('windup', c.windupSec); }
            } else { motion.vx = this.safeGroundSpeed(this.facing * this.def.moveSpeed, input); }
        } else {
            if (Math.abs(dx) < c.minRange && this.retreated < c.retreatDistance) {
                motion.vx = this.safeGroundSpeed(-this.facing * this.def.moveSpeed, input);
                this.retreated += Math.abs(motion.vx) * dt;
            } else if (Math.abs(dx) > c.maxRange) {
                motion.vx = this.safeGroundSpeed(this.facing * this.def.moveSpeed, input);
            }
            if (motion.vx === 0 && this.cooldown <= 0 && Math.abs(dx) <= c.maxRange) {
                this.target = { ...input.player }; this.enter('windup', c.windupSec);
            }
        }
        return motion;
    }

    private safeGroundSpeed(speed: number, input: NormalEnemyInput): number {
        return (speed > 0 ? input.canMoveRight : input.canMoveLeft) ? speed : 0;
    }

    private flyToward(target: EnemyPoint, input: EnemyPoint, speed: number): NormalEnemyMotion {
        const dx = target.x - input.x, dy = target.y - input.y;
        const factor = Math.min(2, speed / Math.max(0.001, Math.hypot(dx, dy)));
        return { vx: dx * factor, vy: dy * factor, fire: false };
    }
}
