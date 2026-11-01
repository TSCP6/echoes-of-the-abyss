import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { CombatResolver } from '../../../../src/game/systems/combat/combatResolver';
import { PlayerController } from '../../../../src/game/systems/player/playerController';
import type { InputGateway } from '../../../../src/game/systems/player/inputGateway';
import type { EnemyAI } from '../../../../src/game/systems/enemies/enemyAI';
import type { ProjectilePool, ProjectileSpec } from '../../../../src/game/systems/combat/projectilePool';
import type { WorldFxLayer } from '../../../../src/game/systems/presentation/worldFxLayer';
import { validateAll, markValidated } from '../../../../src/game/domain/shared/configRegistry';
import { inventoryStore } from '../../../../src/game/domain/player/inventoryStore';
import { weaponService } from '../../../../src/game/domain/player/weaponService';

vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return { Physics: {}, Geom: { Rectangle: require('../../../../node_modules/phaser/src/geom/rectangle/Rectangle.js') } };
});

beforeEach(() => {
    expect(validateAll().ok).toBe(true);
    markValidated();
    inventoryStore.initNewGame();
    weaponService.initNewGame();
});

function fixture() {
    let animation = 'player-idle';
    const body = { velocity: { x: 0, y: 0 }, blocked: { down: true }, touching: { down: true }, bottom: 100, top: 56,
        setSize() {}, setOffset() {}, setBounce() {},
        setVelocity(x: number, y: number) { this.velocity = { x, y }; },
        setVelocityX(x: number) { this.velocity.x = x; }, setVelocityY(y: number) { this.velocity.y = y; } };
    const sprite = { x: 100, y: 100, body, setCollideWorldBounds() {}, setDepth() {},
        play(key: string) { animation = key; } };
    const scene = { sys: { isActive: () => true }, time: { now: 0 }, physics: { add: { sprite: () => sprite } } } as unknown as Scene;
    const keys = { down: false, jump: false };
    const player = new PlayerController(scene, {
        isDown: (action: string) => action === 'moveDown' && keys.down,
        justPressed: (action: string) => action === 'jump' && keys.jump,
        justReleased: () => false
    } as unknown as InputGateway);
    const spawned: ProjectileSpec[] = [];
    const notices: string[] = [];
    const attacks: string[] = [];
    const visuals: { id: string; rect?: { x: number; y: number; width: number; height: number } }[] = [];
    const combat = new CombatResolver(scene, player, {} as EnemyAI,
        { spawn: (spec: ProjectileSpec) => { spawned.push(spec); } } as unknown as ProjectilePool, {} as WorldFxLayer);
    combat.onAttackRejected = (message: string) => notices.push(message);
    combat.onAttackBegan = (type: string) => attacks.push(type);
    combat.onWeaponVisual = (def, rect) => visuals.push({ id: def.id, rect });
    return { player, combat, spawned, notices, attacks, visuals, keys, animation: () => animation };
}

describe('主副手攻击反馈', () => {
    it('近战动画接收实际判定矩形，空仓不播放武器效果', () => {
        const f = fixture();
        f.combat.tryAttack('main');
        expect(f.visuals[0]).toEqual({ id: 'wpn_shortsword', rect: expect.objectContaining({ x: 111, y: 82, width: 40, height: 36 }) });
        const g = fixture();
        inventoryStore.consumeItem('itm_arrow', 20);
        g.combat.tryAttack('sub');
        expect(g.visuals).toHaveLength(0);
    });

    it('冲刺按配置距离保持速度，不被下一帧移动减速覆盖', () => {
        const f = fixture();
        f.player.startDash(240, 200);
        f.player.update(50);
        expect(f.player.body.velocity.x).toBe(1200);
        f.player.update(150);
        expect(f.player.body.velocity.x).toBe(0);
    });

    it('下加跳只穿透当前单向平台，不穿透下方平台', () => {
        const f = fixture(); f.keys.down = true; f.keys.jump = true;
        f.player.noteOnewaySupport(100, 32);
        f.player.update(16);
        expect(f.player.body.velocity.y).toBeGreaterThan(0);
        expect(f.player.canCollideOneway(100)).toBe(false);
        expect(f.player.canCollideOneway(164)).toBe(true);
    });

    it('实心地面下加跳保持正常跳跃，不关闭实体碰撞', () => {
        const f = fixture(); f.keys.down = true; f.keys.jump = true;
        f.player.update(16);
        expect(f.player.body.velocity.y).toBeLessThan(0);
    });
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
