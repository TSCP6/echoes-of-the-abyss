import { expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { EnemyEntity } from './enemyAI';
import { ENEMIES } from '../data/enemies';
import type { PlayerController } from './playerController';

vi.mock('phaser', () => ({ Geom: {}, Physics: {} }));

it('紫鹰实体向右、向左俯冲时，贴图方向随实际速度更新', () => {
    const velocity = { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } };
    const body = {
        center: { x: 1000, y: 300 }, width: 28, bottom: 312,
        blocked: { left: false, right: false, up: false, down: false },
        velocity, setVelocity(x: number, y: number) { velocity.x = x; velocity.y = y; },
        setVelocityX(x: number) { velocity.x = x; },
        setSize() {}, setOffset() {}, setCollideWorldBounds() {}, setAllowGravity() {}, setEnable() {}
    };
    const sprite = {
        x: 1000, y: 300, body, flipX: false,
        anims: { isPaused: false, pause() {}, resume() {} },
        play() {}, setAlpha() {}, setDepth() {}, setVisible() {},
        setFlipX(flip: boolean) { this.flipX = flip; },
        setPosition(x: number, y: number) { this.x = x; this.y = y; }
    };
    const scene = { physics: { add: { sprite: () => sprite } } } as unknown as Scene;
    const enemy = new EnemyEntity(scene, ENEMIES.find(e => e.id === 'enm_flyer')!, 1000, 300, () => false);
    const player = { sprite: { x: 1100, y: 400 }, body: { center: { x: 1100, y: 400 } } } as unknown as PlayerController;
    const events = { onBossPhase() {}, onBossSkill() {} };
    for (let i = 0; i < 9; i++) { enemy.update(0.1, player, i * 100, events, null); }
    expect(enemy.getNormalCombatState()?.stage).toBe('active');
    expect(velocity.x).toBeGreaterThan(0);
    expect(sprite.flipX).toBe(true);
    enemy.reset();
    player.sprite.x = 900;
    player.body.center.x = 900;
    for (let i = 0; i < 9; i++) { enemy.update(0.1, player, 1000 + i * 100, events, null); }
    expect(enemy.getNormalCombatState()?.stage).toBe('active');
    expect(velocity.x).toBeLessThan(0);
    expect(sprite.flipX).toBe(false);
});
