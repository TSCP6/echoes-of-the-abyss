import { describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { ENEMIES } from '../data/enemies';
import { EnemyEntity } from './enemyAI';
import type { PlayerController } from './playerController';
import type { ProjectilePool, ProjectileSpec } from './projectilePool';

vi.mock('phaser', () => ({ Geom: {}, Physics: {} }));

function encounter(id: string, px: number, py = 300) {
    const velocity = { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } };
    const def = structuredClone(ENEMIES.find(e => e.id === id)!);
    const body = {
        velocity, blocked: { left: false, right: false, up: false, down: id !== 'enm_flyer' },
        center: { x: 1000, y: 300 }, x: 1000 - def.hurtboxSize.w / 2, y: 300 - def.hurtboxSize.h / 2,
        width: def.hurtboxSize.w, height: def.hurtboxSize.h, bottom: 300 + def.hurtboxSize.h / 2,
        setVelocity(x: number, y: number) { velocity.x = x; velocity.y = y; },
        setVelocityX(x: number) { velocity.x = x; },
        setSize() {}, setOffset() {}, setCollideWorldBounds() {}, setAllowGravity() {}, setEnable() {}
    };
    const sprite = {
        x: 1000, y: 300, body, anims: { isPaused: false, pause() {}, resume() {} },
        play() {}, setAlpha() {}, setDepth() {}, setFlipX() {}, setVisible() {},
        setPosition(x: number, y: number) { this.x = x; this.y = y; }
    };
    const scene = { physics: { add: { sprite: () => sprite } } } as unknown as Scene;
    let ground = true;
    let wall: { x: number; width: number } | null = null;
    const enemy = new EnemyEntity(scene, def, 1000, 300, (x, y) => !!wall && x >= wall.x && x <= wall.x + wall.width || id !== 'enm_flyer' && ground && y > body.bottom);
    const player = { sprite: { x: px, y: py }, body: { center: { x: px, y: py } } } as PlayerController;
    const shots: ProjectileSpec[] = [];
    const pool = { spawn: (spec: ProjectileSpec) => { shots.push(spec); } } as unknown as ProjectilePool;
    const events = { onBossPhase() {}, onBossSkill() {} };
    let time = 0;
    const step = (dt = 0.05) => { time += dt; enemy.update(dt, player, time * 1000, events, pool); };
    const run = (seconds: number) => { for (let t = 0; t < seconds - 0.001; t += 0.05) { step(); } };
    const target = (x: number, y = 300) => { player.sprite.x = x; player.sprite.y = y; player.body.center.set?.(x, y); Object.assign(player.body.center, { x, y }); };
    return { enemy, body, sprite, shots, step, run, target, noGround: () => { ground = false; }, wallAt: (x: number) => { wall = { x, width: 32 }; } };
}

describe('普通敌人攻击行为', () => {
    it('近战接近后先停步前摇，随后扑击，后摇禁止接触伤害', () => {
        const f = encounter('enm_chaser', 1048);
        f.step();
        expect(f.body.velocity.x).toBe(0);
        expect(f.enemy.getNormalCombatState?.()?.stage).toBe('windup');
        f.run(0.35);
        expect(f.enemy.getNormalAttack?.()).not.toBeNull();
        f.run(0.25);
        expect(f.body.velocity.x).toBe(0);
        expect(f.enemy.suppressesContactDamage?.()).toBe(true);
    });

    it('远程在中距离停步瞄准，前摇结束只发一颗有限射程的敌弹', () => {
        const f = encounter('enm_patrol', 1200);
        f.step();
        expect(f.body.velocity.x).toBe(0);
        expect(f.shots).toHaveLength(0);
        f.run(0.75);
        expect(f.shots).toHaveLength(1);
        expect(f.shots[0]).toMatchObject({ side: 'enemy', sourceId: 'enm_patrol' });
        expect(f.shots[0].range).toBeLessThanOrEqual(600);
        f.run(1);
        expect(f.shots).toHaveLength(1);
    });

    it('近战追击和远程退让都不会主动走下悬崖', () => {
        for (const [id, x] of [['enm_chaser', 1180], ['enm_patrol', 1050]] as const) {
            const f = encounter(id, x);
            f.noGround(); f.step();
            expect(f.body.velocity.x).toBe(0);
        }
    });

    it('紫鹰先追踪到玩家上方，不会发现玩家即无前摇俯冲', () => {
        const f = encounter('enm_flyer', 1120, 300);
        f.step();
        expect(f.body.velocity.y).toBeLessThan(0);
        expect(f.body.velocity.length()).toBeLessThan(240);
        expect(f.enemy.getNormalAttack?.()).toBeNull();
    });

    it('紫鹰扑空有超时，恢复期停下并关闭接触伤害', () => {
        const f = encounter('enm_flyer', 1100, 400);
        f.step(); f.run(0.7);
        f.target(1400, 500);
        f.run(1);
        expect(f.body.velocity.length()).toBe(0);
        expect(f.enemy.suppressesContactDamage?.()).toBe(true);
    });

    it('目标与紫鹰重合也不会产生非有限速度', () => {
        const f = encounter('enm_flyer', 1000, 300);
        f.step();
        expect(Number.isFinite(f.body.velocity.x)).toBe(true);
        expect(Number.isFinite(f.body.velocity.y)).toBe(true);
    });
});

describe('第三章精英尾刃集成',()=>{
    it('实体扫描去程墙体提前折返，回程受阻立即清除尾刃', () => {
        const f = encounter('enm_elite', 1120);
        f.enemy.enableEliteTail(); f.step(); f.run(0.8);
        f.wallAt(1100);
        for (let i = 0; i < 20 && f.enemy.getEliteTailState()?.stage !== 'inbound'; i++) { f.step(); }
        const returning = f.enemy.getEliteTailState()!;
        expect(returning.stage).toBe('inbound');
        expect(returning.blade!.x).toBeLessThan(1100);
        f.wallAt(returning.blade!.x - 24); f.step();
        expect(f.enemy.getEliteTailState()?.stage).toBe('recovery');
        expect(f.enemy.getNormalAttack()).toBeNull();
    });

    it('有明显停步前摇，释放飞刃后有独立伤害盒，同次只命中一次',()=>{
        const f=encounter('enm_elite',1120);f.enemy.enableEliteTail();f.step();
        expect(f.body.velocity.x).toBe(0);expect(f.enemy.getEliteTailState()?.stage).toBe('windup');
        f.run(0.8);expect(f.enemy.getNormalAttack()).not.toBeNull();
        f.enemy.consumeNormalAttack();expect(f.enemy.getNormalAttack()).toBeNull();
        f.enemy.applyHit(1,900);expect(f.enemy.getEliteTailState()?.blade).toBeNull();
        expect(f.enemy.suppressesContactDamage()).toBe(true);
        f.enemy.reset();expect(f.enemy.getEliteTailState()?.stage).toBe('idle');
    });
    it('共享起手闸可拒绝本帧施法，并且不会主动走下悬崖',()=>{
        const f=encounter('enm_elite',1180);f.enemy.enableEliteTail(()=>false);f.noGround();f.step();
        expect(f.enemy.getEliteTailState()?.stage).toBe('idle');expect(f.body.velocity.x).toBe(0);
    });
});
