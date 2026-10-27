import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { CombatResolver } from './combatResolver';
import { validateAll, markValidated, ConfigRegistry } from '../domain/configRegistry';
import { resourceSystem } from '../domain/resourceSystem';
import { weaponService } from '../domain/weaponService';
import { skillService } from '../domain/skillService';
import type { PlayerController } from './playerController';
import type { EnemyAI, EnemyEntity } from './enemyAI';
import type { ProjectilePool, ProjectileSpec } from './projectilePool';
import type { WorldFxLayer } from './worldFxLayer';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const Rectangle = require('../../../node_modules/phaser/src/geom/rectangle/Rectangle.js');
    Rectangle.Overlaps = require('../../../node_modules/phaser/src/geom/rectangle/Overlaps.js');
    return { Geom: { Rectangle }, Physics: {} };
});

function duel(enemyId = 'enm_patrol') {
    let state = 'idle';
    const player = {
        sprite: { x: 100, y: 100, setAlpha() {} }, iFrameUntil: 0,
        body: { x: 90, y: 78, width: 22, height: 44, setVelocityX() {} },
        getMotionState: () => ({ x: 100, y: 100, facing: 1, state })
    } as unknown as PlayerController;
    const enemy = {
        def: ConfigRegistry.enemies()[enemyId], hp: 1, dead: false, sleeping: false,
        sprite: { x: 119, y: 100 },
        getHurtbox: () => ({ x: 105, y: 80, w: 28, h: 32 }),
        isInvincible: () => false,
        applyHit(this: { hp: number; dead: boolean }, damage: number) { this.hp -= damage; this.dead = this.hp <= 0; return this.dead; }
    } as unknown as EnemyEntity;
    const active: { sprite: { x: number; body: { x: number; y: number; width: number; height: number } }; spec: ProjectileSpec; active: boolean }[] = [];
    const projectiles = {
        spawn(spec: ProjectileSpec) { active.push({ active: true, spec, sprite: { x: 119, body: { x: 110, y: 90, width: 10, height: 10 } } }); },
        getActive: () => active.filter(p => p.active), release(p: { active: boolean }) { p.active = false; }
    } as unknown as ProjectilePool;
    const scene = { time: { now: 100, addEvent: () => ({ remove() {} }), delayedCall() {} } } as unknown as Scene;
    const combat = new CombatResolver(scene, player, { getEntities: () => [enemy] } as EnemyAI, projectiles,
        { hitFlash() {}, damageNumber() {} } as unknown as WorldFxLayer);
    combat.setRng(() => 0.5);
    let deaths = 0;
    combat.onPlayerDied = () => { state = 'dead'; deaths++; };
    return { combat, enemy, active, player, deaths: () => deaths, die: () => { state = 'dead'; } };
}

describe('同帧致死结算', () => {
    it.each(['enm_patrol', 'enm_chaser', 'enm_flyer', 'enm_elite',
        'enm_boss_guardian', 'enm_boss_spider', 'enm_boss_echo'])('%s 接触只扣 5 点生命，持续重叠不重复扣血', id => {
        const f = duel(id);
        f.combat.update(1 / 60);
        expect(resourceSystem.getSnapshot().hp).toBe(95);
        f.combat.update(1 / 60);
        expect(resourceSystem.getSnapshot().hp).toBe(95);
    });

    it.each([{ fromX: 119, want: -180 }, { fromX: 81, want: 180 }])(
        '来自 $fromX 的受击使用缩短后的反向击退', ({ fromX, want }) => {
            const f = duel();
            let velocityX = 0;
            f.player.body.setVelocityX = value => { velocityX = value; return f.player.body; };
            f.combat.damagePlayer(5, 'enm_patrol', fromX);
            expect(velocityX).toBe(want);
        });

    it('Boss 危险区普通命中只扣血，连续重叠遵守受击无敌时间', () => {
        const f = duel();
        f.combat.damagePlayer(14, 'enm_boss_guardian', 200);
        expect(resourceSystem.getSnapshot().hp).toBe(86);
        expect(f.deaths()).toBe(0);
        f.combat.damagePlayer(14, 'enm_boss_guardian', 200);
        expect(resourceSystem.getSnapshot().hp).toBe(86);
    });

    it('Boss 危险区致死只触发一次死亡', () => {
        const f = duel();
        resourceSystem.applyDamage(95);
        f.combat.damagePlayer(14, 'enm_boss_guardian', 200);
        f.combat.damagePlayer(14, 'enm_boss_guardian', 200);
        expect(f.deaths()).toBe(1);
    });

    it('接触伤害先致死时，不再用本帧挥击击杀敌人', () => {
        const f = duel();
        resourceSystem.applyDamage(99);
        f.combat.beginMelee(ConfigRegistry.weapons().wpn_shortsword);
        f.combat.update(1 / 60);
        expect(f.deaths()).toBe(1);
        expect(f.enemy.dead).toBe(false);
    });

    it('敌弹先致死时，不再结算本帧玩家的挥击', () => {
        const f = duel();
        resourceSystem.applyDamage(99);
        f.active.push({ active: true, sprite: { x: 100, body: { x: 95, y: 90, width: 10, height: 10 } },
            spec: { x: 100, y: 100, angleDeg: 0, speed: 100, range: 100, damage: 10, side: 'enemy', sourceId: 'enm_boss_spider' } });
        f.combat.beginMelee(ConfigRegistry.weapons().wpn_shortsword);
        f.combat.update(1 / 60);
        expect(f.deaths()).toBe(1);
        expect(f.enemy.dead).toBe(false);
        expect(f.active[0].active).toBe(false);
    });

    it('死亡等待期间不继续结算残留挥击', () => {
        const f = duel();
        f.combat.beginMelee(ConfigRegistry.weapons().wpn_shortsword);
        f.die();
        f.combat.update(1 / 60);
        expect(f.enemy.dead).toBe(false);
    });
});
vi.mock('../EventBus', async () => {
    const { EventEmitter } = await import('node:events');
    return { EventBus: new EventEmitter() };
});

beforeEach(() => {
    expect(validateAll().ok).toBe(true);
    markValidated();
    resourceSystem.refill();
    weaponService.initNewGame();
    skillService.fromSnapshot({ unlocked: [], loadout: [null, null, null, null] });
});

function fixture(facing: 1 | -1) {
    const spawned: ProjectileSpec[] = [];
    const projectiles = { spawn: (spec: ProjectileSpec) => spawned.push(spec) } as unknown as ProjectilePool;
    const player = { getMotionState: () => ({ x: 100, y: 100, facing }) } as PlayerController;
    const combat = new CombatResolver({} as Scene, player, {} as EnemyAI, projectiles, {} as WorldFxLayer);
    return { combat, spawned };
}

describe('玩家弹丸朝向', () => {
    it.each([
        { facing: 1 as const, spread: 0, angle: 0, x: 120 },
        { facing: -1 as const, spread: 0, angle: 180, x: 80 },
        { facing: -1 as const, spread: 15, angle: 195, x: 80 }
    ])('朝向$facing、散射$spread° 时从对应侧向前发射', ({ facing, spread, angle, x }) => {
        const { combat, spawned } = fixture(facing);
        combat.spawnProjectile(ConfigRegistry.weapons().wpn_crossbow, spread);
        expect(spawned).toHaveLength(1);
        expect(spawned[0].x).toBe(x);
        expect(spawned[0].angleDeg).toBe(angle);
        expect(Math.sign(Math.cos(spawned[0].angleDeg * Math.PI / 180))).toBe(facing);
    });
});

describe('攻击等级来源', () => {
    it('副手弹丸使用发射时的副手等级，飞行中切换/升级不改变已有弹丸伤害', () => {
        const f = duel();
        f.player.iFrameUntil = 1000;
        f.enemy.hp = 100;
        weaponService.fromSnapshot({ 'wpn_crossbow#sub': { level: 5 }, 'wpn_shortsword#main': { level: 1 } });
        f.combat.spawnProjectile(ConfigRegistry.weapons().wpn_crossbow, 0, 'sub');
        weaponService.fromSnapshot({ 'wpn_crossbow#sub': { level: 1 }, 'wpn_shortsword#main': { level: 1 } });
        f.combat.update(1 / 60);
        expect(f.enemy.hp).toBe(86); // round(9 * 1.6)
    });

    it('挥击使用发起时的武器等级，不误用后来活动武器的等级', () => {
        const f = duel();
        f.player.iFrameUntil = 1000;
        f.enemy.hp = 100;
        weaponService.fromSnapshot({ 'wpn_shortsword#main': { level: 5 } });
        f.combat.beginMelee(ConfigRegistry.weapons().wpn_shortsword);
        f.combat.activeWeaponId = 'wpn_crossbow';
        f.combat.update(1 / 60);
        expect(f.enemy.hp).toBe(81); // round(12 * 1.6)
    });
});
