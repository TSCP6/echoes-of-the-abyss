import { describe, expect, it } from 'vitest';
import type { Physics } from 'phaser';
import { EnemyVisual, enemyTexture } from './enemyVisuals';

function fixture(id = 'enm_boss_guardian') {
    const played: string[] = [];
    const sprite = {
        alpha: 1,
        flipX: false,
        anims: {
            isPaused: false,
            pause() { this.isPaused = true; },
            resume() { this.isPaused = false; },
            stop() { this.isPaused = false; }
        },
        play(key: string) { played.push(key); return this; },
        setAlpha(alpha: number) { this.alpha = alpha; return this; },
        setFlipX(flip: boolean) { this.flipX = flip; return this; }
    };
    const visual = new EnemyVisual(sprite as unknown as Physics.Arcade.Sprite, id);
    return { visual, sprite, played };
}

describe('敌人美术状态优先级', () => {
    it('蚂蚁源图朝左，移动朝向应与源图一致', () => {
        const { visual, sprite } = fixture('enm_patrol');
        visual.face(-1);
        expect(sprite.flipX).toBe(false);
        visual.face(1);
        expect(sprite.flipX).toBe(true);
    });
    it('按敌人 ID 选择贴图，三个 Boss 不再被迫共用美术', () => {
        expect(enemyTexture('enm_boss_guardian', 'boss')).toBe('guardian_idle');
        expect(enemyTexture('enm_boss_spider', 'boss')).toBe('spider_idle');
        expect(enemyTexture('enm_boss_echo', 'boss')).toBe('echo_idle');
        expect(enemyTexture('enm_elite', 'patrol')).toBe('enemy_patrol');
        expect(enemyTexture('enm_patrol', 'patrol')).toBe('ant_run');
    });

    it('移动状态不能抢断施法，施法结束后恢复待机', () => {
        const { visual, played } = fixture();
        visual.skill('projectileSpread');
        visual.update(0.2, 'move');
        visual.update(0.2, 'move');
        expect(played.at(-1)).toBe('guardian-shoot');
        visual.update(0.6, 'idle');
        expect(played.at(-1)).toBe('guardian-idle');
    });

    it('受击打断施法，死亡打断受击且不会每帧重启动画', () => {
        const { visual, played } = fixture();
        visual.skill('charge');
        visual.update(0, 'hit');
        expect(played.at(-1)).toBe('guardian-immune');
        visual.update(0, 'dead');
        visual.update(0.2, 'dead');
        expect(played.filter((key) => key === 'guardian-death')).toHaveLength(1);
        expect(visual.deathDuration).toBeCloseTo(1.4);
        visual.skill('charge');
        expect(played.at(-1)).toBe('guardian-death');
    });

    it('阶段切换优先于技能，结束后不恢复过期技能', () => {
        const { visual, played } = fixture();
        visual.skill('charge');
        visual.update(0.1, 'phase');
        expect(played.at(-1)).toBe('guardian-glow');
        visual.update(0.1, 'idle');
        expect(played.at(-1)).toBe('guardian-idle');
    });

    it('预算休眠暂停帧动画与动作计时，唤醒后接着播放', () => {
        const { visual, sprite, played } = fixture();
        visual.skill('projectileSpread');
        visual.update(2, 'move', true);
        expect(sprite.anims.isPaused).toBe(true);
        visual.update(0.1, 'move');
        expect(sprite.anims.isPaused).toBe(false);
        expect(played.at(-1)).toBe('guardian-shoot');
    });

    it('重置清除死亡和动作，完整恢复动画与透明度', () => {
        const { visual, sprite, played } = fixture('enm_patrol');
        visual.update(0.2, 'dead');
        expect(sprite.alpha).toBeCloseTo(0.5);
        visual.reset();
        expect(sprite.alpha).toBe(1);
        expect(played.at(-1)).toBe('ant-idle');
        expect(visual.frameSize).toBe(96);
    });

    it.each([
        ['enm_boss_spider', 'spider', 160, 0.5],
        ['enm_boss_echo', 'echo', 200, 1.8]
    ])('%s 使用独立施法、阶段与死亡动画，死亡后技能不能重启', (id, prefix, size, deathDuration) => {
        const { visual, played } = fixture(id as string);
        expect(visual.frameSize).toBe(size);
        visual.windup('summon');
        expect(played.at(-1)).toBe(`${prefix}-summon`);
        visual.update(0.1, 'move');
        expect(played.at(-1)).toBe(`${prefix}-summon`);
        visual.skill('projectileSpread');
        expect(played.at(-1)).toBe(`${prefix}-shoot`);
        visual.update(0.1, 'phase');
        expect(played.at(-1)).toBe(`${prefix}-phase`);
        visual.update(0.1, 'dead');
        visual.skill('summon');
        expect(played.at(-1)).toBe(`${prefix}-death`);
        expect(visual.deathDuration).toBeCloseTo(deathDuration as number);
        visual.reset();
        expect(played.at(-1)).toBe(`${prefix}-idle`);
    });
});
