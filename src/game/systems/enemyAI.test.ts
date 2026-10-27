import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { EnemyAI, EnemyEntity } from './enemyAI';
import { validateAll, markValidated } from '../domain/configRegistry';
import type { LevelContext } from './levelLoader';
import { ENEMIES } from '../data/enemies';
import type { PlayerController } from './playerController';

vi.mock('phaser', () => ({ Geom: {}, Physics: {} }));

beforeEach(() => { expect(validateAll().ok).toBe(true); markValidated(); });

function guardian() {
    const velocity = { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } };
    const body = {
        velocity, center: { x: 1000, y: 300 },
        setVelocity(x: number, y: number) { velocity.x = x; velocity.y = y; },
        setVelocityX(x: number) { velocity.x = x; },
        setSize() {}, setOffset() {}, setCollideWorldBounds() {}, setAllowGravity() {}, setEnable() {}
    };
    const sprite = {
        x: 1000, y: 300, body,
        anims: { isPaused: false, pause() {}, resume() {} },
        play() {}, setAlpha() {}, setDepth() {}, setFlipX() {}, setVisible() {},
        setPosition(x: number, y: number) { this.x = x; this.y = y; }
    };
    const scene = { physics: { add: { sprite: () => sprite } } } as unknown as Scene;
    const def = ENEMIES.find(e => e.id === 'enm_boss_guardian')!;
    const enemy = new EnemyEntity(scene, def, 1000, 300, () => true);
    const playerSprite = { x: 0, y: 300 };
    const player = { sprite: playerSprite } as unknown as PlayerController;
    const events = { onBossPhase: vi.fn(), onBossSkill: vi.fn() };
    return { enemy, body, player, playerSprite, events };
}

function summons() {
    const f = guardian();
    const collisions: unknown[][] = [];
    const sprites: { destroyed: boolean }[] = [];
    const scene = { physics: { add: {
        sprite: () => {
            const sprite = { ...f.enemy.sprite, destroyed: false, destroy() { this.destroyed = true; } };
            sprites.push(sprite);
            return sprite;
        },
        collider: (...args: unknown[]) => { collisions.push(args); return { destroy() {} }; }
    } } } as unknown as Scene;
    const ctx = { enemySpawns: [{ defId: 'enm_boss_spider', x: 1000, y: 300 }], collisionGroup: {} } as LevelContext;
    const ai = new EnemyAI(scene, ctx, f.player, () => true);
    return { ai, collisions, sprites, ctx };
}

describe('Boss 实体攻击集成', () => {
    it('召唤地面怪物接入瓦片碰撞，避免生成后掉穿地面', () => {
        const f = summons();
        f.ai.summonAt(900, 300, 'enm_patrol', 'spiderling');
        const spawned = f.ai.getEntities()[1];
        expect(f.collisions).toContainEqual([spawned.sprite, f.ctx.collisionGroup]);
    });

    it('重试销毁召唤物，只重置关卡原有敌人', () => {
        const f = summons();
        f.ai.summonAt(900, 300, 'enm_patrol', 'spiderling');
        f.ai.summonAt(1100, 300, 'enm_flyer', 'echo_spirit');
        f.ai.resetAll();
        expect(f.ai.getEntities()).toHaveLength(1);
        expect(f.sprites[0].destroyed).toBe(false);
        expect(f.sprites.slice(1).every(s => s.destroyed)).toBe(true);
    });

    it('远处 Boss 不发动技能、不隔着整张地图攻击玩家', () => {
        const f = guardian();
        for (let i = 0; i < 100; i++) { f.enemy.update(0.1, f.player, i * 100, f.events, null); }
        expect(f.enemy.getBossAttack()).toBe(null);
        expect(f.events.onBossSkill).not.toHaveBeenCalled();
        expect(f.events.onBossPhase).not.toHaveBeenCalled();
        expect(f.body.velocity.x).toBe(0);
    });

    it('进入范围后先预警，冲刺持续多帧且方向锁定', () => {
        const f = guardian();
        f.playerSprite.x = 800;
        f.enemy.update(0.1, f.player, 100, f.events, null);
        expect(f.enemy.getBossAttack()?.stage).toBe('windup');
        expect(f.body.velocity.x).toBe(0);
        f.playerSprite.x = 1200;
        for (let i = 0; i < 7; i++) { f.enemy.update(0.1, f.player, 200 + i * 100, f.events, null); }
        expect(f.enemy.getBossAttack()?.stage).toBe('active');
        expect(f.body.velocity.x).toBe(-480);
        f.enemy.update(0.1, f.player, 1000, f.events, null);
        expect(f.body.velocity.x).toBe(-480);
        f.enemy.reset();
        expect(f.enemy.getBossAttack()).toBe(null);
        expect(f.enemy.bossEngaged).toBe(false);
    });
});
