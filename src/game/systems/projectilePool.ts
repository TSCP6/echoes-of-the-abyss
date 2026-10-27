/**
 * MOD-06 ProjectilePool（Phaser 呈现层）—— 弹丸与投掷物对象池（DD-13 容量 32）。
 * 射程/碰撞销毁（FR-04 规则 2：超射程或命中瓦片即销毁，AT-14）；
 * 池耗尽复用最老实例（不排队不阻塞，ARCH-12）。
 * 弹丸伤害源记录 sourceId/side，供 CombatResolver 结算（K7 同帧次序）。
 */
import { Physics, type Scene } from 'phaser';
import type { LevelContext } from './levelLoader';
import { bossProjectileTexture } from './bossSkillPresentation';

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
        // Enemy shots read as danger rather than collectible fruit.
        for (const [key, color, size] of [['projectile_enemy', 0xff653f, 24], ['projectile_player', 0xffe066, 12]] as const) {
            if (scene.textures.exists(key)) { continue; }
            const g = scene.make.graphics();
            g.fillStyle(color, 0.3);
            g.fillCircle(size / 2, size / 2, size / 2);
            g.fillStyle(color, 1);
            g.fillCircle(size / 2, size / 2, size / 3);
            g.fillStyle(0xfff1c9, 1);
            g.fillCircle(size / 2, size / 2, size / 6);
            g.generateTexture(key, size, size);
            g.destroy();
        }
        for (const [key, color] of [['projectile_spider', 0xa3ed58], ['projectile_echo', 0xbb91ff]] as const) {
            if (scene.textures.exists(key)) { continue; }
            const g = scene.make.graphics();
            g.fillStyle(color, 0.22);
            g.fillCircle(16, 16, 16);
            g.lineStyle(2, 0xff7058, 0.9);
            g.strokeCircle(16, 16, 10);
            g.fillStyle(color, 1);
            g.fillCircle(16, 16, 8);
            g.fillStyle(0xffffff, 1);
            if (key === 'projectile_spider') {
                g.fillCircle(14, 14, 3);
                g.lineStyle(1, 0xf0ffd6, 0.9);
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    g.lineBetween(16, 16, 16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11);
                }
            } else {
                g.fillTriangle(10, 10, 23, 16, 10, 22);
            }
            g.generateTexture(key, 32, 32);
            g.destroy();
        }
        for (let i = 0; i < POOL; i++) {
            const sprite = scene.physics.add.sprite(-9999, -9999, 'projectile_player');
            sprite.setDepth(8);
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
        slot.sprite.setTexture(bossProjectileTexture(spec.sourceId, spec.side));
        (slot.sprite.body as Physics.Arcade.Body).setSize(12, 12, true);
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

    clear(): void {
        for (const projectile of this.pool) { if (projectile.active) { this.release(projectile); } }
    }

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
