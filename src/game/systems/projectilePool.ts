/**
 * MOD-06 ProjectilePool（Phaser 呈现层）—— 弹丸与投掷物对象池（DD-13 容量 32）。
 * 射程/碰撞销毁（FR-04 规则 2：超射程或命中瓦片即销毁，AT-14）；
 * 池耗尽复用最老实例（不排队不阻塞，ARCH-12）。
 * 弹丸伤害源记录 sourceId/side，供 CombatResolver 结算（K7 同帧次序）。
 */
import { Physics, type Scene } from 'phaser';
import type { LevelContext } from './levelLoader';

const POOL = 32;

export interface ProjectileSpec {
    x: number; y: number;
    angleDeg: number;
    speed: number;
    range: number;
    damage: number;
    side: 'player' | 'enemy';
    sourceId: string;
    /** 玩家发射时记录武器实例等级，命中时不串用后来活动的武器。 */
    weaponLevelFactor?: number;
}

export interface Projectile {
    sprite: Physics.Arcade.Sprite;
    active: boolean;
    traveled: number;
    spec: ProjectileSpec | null;
}

export class ProjectilePool {
    private pool: Projectile[] = [];

    constructor(scene: Scene, ctx: LevelContext) {
        for (let i = 0; i < POOL; i++) {
            const sprite = scene.physics.add.sprite(-9999, -9999, 'fruit_apple', 0);
            sprite.setDepth(8);
            sprite.setScale(0.35);
            sprite.setVisible(false);
            const body = sprite.body as Physics.Arcade.Body;
            body.setAllowGravity(false);
            body.setSize(12, 12);
            this.pool.push({ sprite, active: false, traveled: 0, spec: null });
        }
        // 弹丸 vs 瓦片：命中即销毁（FR-04 规则 2）
        scene.physics.add.collider(this.pool.map((p) => p.sprite), ctx.collisionGroup, (obj) => {
            const hit = obj as Physics.Arcade.Sprite;
            const proj = this.pool.find((p) => p.sprite === hit);
            if (proj !== undefined) { this.release(proj); }
        });
    }

    spawn(spec: ProjectileSpec): void {
        const free = this.pool.find((p) => !p.active);
        const slot = free ?? this.pool.reduce((a, b) => (a.traveled > b.traveled ? a : b));
        slot.active = true;
        slot.traveled = 0;
        slot.spec = spec;
        slot.sprite.setVisible(true);
        slot.sprite.setPosition(spec.x, spec.y);
        const rad = (spec.angleDeg * Math.PI) / 180;
        (slot.sprite.body as Physics.Arcade.Body).setVelocity(Math.cos(rad) * spec.speed, Math.sin(rad) * spec.speed);
        slot.sprite.setRotation(rad);
    }

    release(p: Projectile): void {
        p.active = false;
        p.spec = null;
        p.sprite.setVisible(false);
        p.sprite.setPosition(-9999, -9999);
        (p.sprite.body as Physics.Arcade.Body).setVelocity(0, 0);
    }

    getActive(): Projectile[] { return this.pool.filter((p) => p.active); }

    /** 管线阶段 3：射程检查（FR-04 规则 2 / AT-14） */
    update(dt: number): void {
        for (const p of this.pool) {
            if (!p.active || p.spec === null) { continue; }
            const body = p.sprite.body as Physics.Arcade.Body;
            p.traveled += Math.hypot(body.velocity.x, body.velocity.y) * dt;
            if (p.traveled >= p.spec.range) { this.release(p); }
        }
    }

    destroy(): void {
        for (const p of this.pool) { p.sprite.destroy(); }
        this.pool = [];
    }
}
