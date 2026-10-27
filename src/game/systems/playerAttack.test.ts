import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { CombatResolver } from './combatResolver';
import { PlayerController } from './playerController';
import type { InputGateway } from './inputGateway';
import type { EnemyAI } from './enemyAI';
import type { ProjectilePool, ProjectileSpec } from './projectilePool';
import type { WorldFxLayer } from './worldFxLayer';
import { validateAll, markValidated } from '../domain/configRegistry';
import { inventoryStore } from '../domain/inventoryStore';
import { weaponService } from '../domain/weaponService';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return { Physics: {}, Geom: { Rectangle: require('../../../node_modules/phaser/src/geom/rectangle/Rectangle.js') } };
});

beforeEach(() => {
    expect(validateAll().ok).toBe(true);
    markValidated();
    inventoryStore.initNewGame();
    weaponService.initNewGame();
});

function fixture() {
    let animation = 'player-idle';
    const body = { velocity: { x: 0, y: 0 }, blocked: { down: true }, touching: { down: true },
        setSize() {}, setOffset() {}, setBounce() {} };
    const sprite = { x: 100, y: 100, body, setCollideWorldBounds() {}, setDepth() {},
        play(key: string) { animation = key; } };
    const scene = { sys: { isActive: () => true }, physics: { add: { sprite: () => sprite } } } as unknown as Scene;
    const player = new PlayerController(scene, {} as InputGateway);
    const spawned: ProjectileSpec[] = [];
    const notices: string[] = [];
    const attacks: string[] = [];
    const combat = new CombatResolver(scene, player, {} as EnemyAI,
        { spawn: (spec: ProjectileSpec) => { spawned.push(spec); } } as unknown as ProjectilePool, {} as WorldFxLayer);
    combat.onAttackRejected = (message: string) => notices.push(message);
    combat.onAttackBegan = (type: string) => attacks.push(type);
    return { player, combat, spawned, notices, attacks, animation: () => animation };
}

describe('主副手攻击反馈', () => {
    it('副手射击扣一发弹药，播放射击动作并报告远程音效类型', () => {
        const f = fixture();
        expect(f.combat.tryAttack('sub')).toBe(true);
        expect(inventoryStore.countItem('itm_arrow')).toBe(19);
        expect(f.spawned).toHaveLength(1);
        expect(f.spawned[0].sourceId).toBe('wpn_crossbow');
        expect(f.animation()).toBe('player-shoot');
        expect(f.attacks).toEqual(['ranged']);
    });

    it('空仓提示弹药不足，不进入攻击态、不生成弹丸，也不占用攻击硬直', () => {
        inventoryStore.consumeItem('itm_arrow', 20);
        const f = fixture();
        expect(f.combat.tryAttack('sub')).toBe(false);
        expect(f.notices).toEqual(['弹药不足']);
        expect(f.player.getState()).toBe('idle');
        expect(f.animation()).toBe('player-idle');
        expect(f.spawned).toHaveLength(0);
        expect(f.attacks).toEqual([]);
        inventoryStore.addItem('itm_arrow', 1);
        expect(f.combat.tryAttack('sub')).toBe(true);
        expect(inventoryStore.countItem('itm_arrow')).toBe(0);
    });

    it('主手近战播放挥击动作，副手装备轻弩也不会报告射击音效', () => {
        const f = fixture();
        expect(f.combat.tryAttack('main')).toBe(true);
        expect(f.animation()).toBe('player-swing');
        expect(f.attacks).toEqual(['melee']);
        expect(f.spawned).toHaveLength(0);
        expect(inventoryStore.countItem('itm_arrow')).toBe(20);
    });

    it('硬直中的副手射击不扣弹药、不重复发射', () => {
        const f = fixture();
        f.combat.tryAttack('main');
        expect(f.combat.tryAttack('sub')).toBe(false);
        expect(inventoryStore.countItem('itm_arrow')).toBe(20);
        expect(f.spawned).toHaveLength(0);
        expect(f.notices).toEqual([]);
    });

    it('切换武器期间不扣弹药、不进入攻击态', () => {
        const f = fixture();
        weaponService.toggleHand();
        expect(f.combat.tryAttack('sub')).toBe(false);
        expect(inventoryStore.countItem('itm_arrow')).toBe(20);
        expect(f.player.getState()).toBe('idle');
    });

    it('主手装备远程武器时也遵守空仓检查', () => {
        inventoryStore.fromSnapshot({ ...inventoryStore.toSnapshot(), equipped: { main: 'wpn_crossbow', sub: null } });
        inventoryStore.consumeItem('itm_arrow', 20);
        const f = fixture();
        expect(f.combat.tryAttack('main')).toBe(false);
        expect(f.notices).toEqual(['弹药不足']);
        expect(f.player.getState()).toBe('idle');
    });
});
