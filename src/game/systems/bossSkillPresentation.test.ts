import { describe, expect, it } from 'vitest';
import { bossProjectileAngles, bossSummonPositions, bossProjectileTexture } from './bossSkillPresentation';

describe('Boss 技能预警与执行的共享几何', () => {
    it('扇形预警左右对称且单发弹没有除零', () => {
        expect(bossProjectileAngles(1, 3, 24)).toEqual([-12, 0, 12]);
        expect(bossProjectileAngles(-1, 3, 24)).toEqual([168, 180, 192]);
        expect(bossProjectileAngles(-1, 1, 30)).toEqual([180]);
    });

    it('四个召唤落点各不重叠，预警和生成使用相同坐标', () => {
        expect(bossSummonPositions(1000, 700, 4)).toEqual([
            { x: 928, y: 700 }, { x: 1072, y: 700 }, { x: 872, y: 700 }, { x: 1128, y: 700 }
        ]);
    });

    it('按伤害来源选择弹丸外观，敌我不会因对象池复用串用贴图', () => {
        expect(bossProjectileTexture('enm_boss_spider', 'enemy')).toBe('projectile_spider');
        expect(bossProjectileTexture('enm_boss_echo', 'enemy')).toBe('projectile_echo');
        expect(bossProjectileTexture('enm_boss_guardian', 'enemy')).toBe('projectile_enemy');
        expect(bossProjectileTexture('wpn_crossbow', 'player')).toBe('projectile_player');
    });
});
