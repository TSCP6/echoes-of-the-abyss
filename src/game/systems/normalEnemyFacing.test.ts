import { expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { EnemyEntity } from './enemyAI';
import { ENEMIES } from '../data/enemies';
import type { PlayerController } from './playerController';

vi.mock('phaser', () => ({ Geom: {}, Physics: {} }));

it('紫鹰实体向右、向左俯冲时，贴图方向随实际速度更新', () => {
    const velocity = { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } };
    const body = {
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
    const enemy = new EnemyEntity(scene, ENEMIES.find(e => e.id === 'enm_flyer')!, 1000, 300, () => true);
    const player = { sprite: { x: 1200, y: 300 } } as unknown as PlayerController;
    const events = { onBossPhase() {}, onBossSkill() {} };
    enemy.update(0.1, player, 100, events, null);
    expect(velocity.x).toBe(240);
    expect(sprite.flipX).toBe(true);
    enemy.reset();
    player.sprite.x = 800;
    enemy.update(0.1, player, 200, events, null);
    expect(velocity.x).toBe(-240);
    expect(sprite.flipX).toBe(false);
});
