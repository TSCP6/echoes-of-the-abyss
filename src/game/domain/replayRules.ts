import { REPLAY_TIERS, CHAPTER_GROWTH } from '../data/replayDefaults';
import type { EnemyDef } from './types';

export function replayProfile(levelId: string, clearCount: number) {
    const count = Number.isSafeInteger(clearCount) && clearCount >= 0 ? clearCount : 0;
    const replayTier = Math.min(count, REPLAY_TIERS.length - 1);
    const tier = REPLAY_TIERS[replayTier];
    const chapter = CHAPTER_GROWTH[Number(levelId.split('-')[0]) - 1] ?? CHAPTER_GROWTH[0];
    return { replayTier, coinPercent: tier.coinPercent, bossHpPercent: tier.bossHpPercent,
        hpPercent: chapter.hpPercent * tier.hpPercent / 100, damagePercent: chapter.damagePercent };
}

export type ReplayProfile = ReturnType<typeof replayProfile>;

/** 实例持有自己的生命配置，不修改注册表，也不缩短既有前摇。 */
export function scaleEnemy(def: EnemyDef, profile: ReplayProfile): EnemyDef {
    return { ...def, hp: Math.round(def.hp * (def.kind === 'boss' ? profile.bossHpPercent : profile.hpPercent) / 100) };
}
