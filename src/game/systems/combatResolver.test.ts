import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { CombatResolver } from './combatResolver';
import { validateAll, markValidated, ConfigRegistry } from '../domain/configRegistry';
import { resourceSystem } from '../domain/resourceSystem';
import { weaponService } from '../domain/weaponService';
import { skillService } from '../domain/skillService';
import type { PlayerController } from './playerController';
import type { EnemyAI } from './enemyAI';
import type { ProjectilePool, ProjectileSpec } from './projectilePool';
import type { WorldFxLayer } from './worldFxLayer';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const Rectangle = require('../../../node_modules/phaser/src/geom/rectangle/Rectangle.js');
    Rectangle.Overlaps = require('../../../node_modules/phaser/src/geom/rectangle/Overlaps.js');
    return { Geom: { Rectangle }, Physics: {} };
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
