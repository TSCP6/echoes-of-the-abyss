import { describe, expect, it } from 'vitest';
import type { Physics } from 'phaser';
import { EnemyVisual, enemyTexture } from '../../../../src/game/systems/enemies/enemyVisuals';

describe('普通敌人美术接入', () => {
    it.each([
        ['enm_chaser', 'chaser', 'chaser_run', 'chaser'],
        ['enm_flyer', 'flyer', 'flyer_fly', 'flyer'],
        ['enm_elite', 'patrol', 'elite_move', 'elite']
    ])('%s 使用独立贴图和完整状态，死亡后可重置', (id, kind, texture, prefix) => {
        const played: string[] = [];
        const sprite = {
            flipX: false, alpha: 1,
            anims: { isPaused: false, resume() {}, pause() {}, stop() {} },
            play(key: string) { played.push(key); },
            setAlpha(alpha: number) { this.alpha = alpha; },
            setFlipX(flip: boolean) { this.flipX = flip; }
        };
        expect(enemyTexture(id, kind)).toBe(texture);
        const visual = new EnemyVisual(sprite as unknown as Physics.Arcade.Sprite, id);
        expect(visual.hasArt).toBe(true);
        expect(visual.frameSize).toBe(128);
        expect(played.at(-1)).toBe(`${prefix}-idle`);
        visual.update(0.1, 'move');
        expect(played.at(-1)).toBe(`${prefix}-move`);
        visual.face(-1);
        expect(sprite.flipX).toBe(false);
        visual.face(1);
        expect(sprite.flipX).toBe(true);
        visual.update(0, 'hit');
        expect(played.at(-1)).toBe(`${prefix}-hit`);
        visual.update(0.1, 'dead');
        visual.update(0.1, 'dead');
        expect(played.filter(key => key === 'normal-enemy-death')).toHaveLength(1);
        expect(visual.deathDuration).toBe(0.6);
        visual.reset();
        expect(played.at(-1)).toBe(`${prefix}-idle`);
        expect(sprite.alpha).toBe(1);
    });
});
