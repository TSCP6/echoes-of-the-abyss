/** 通关次数对应重玩档位；金币按百分整数累计，避免逐枚取整抬高收益。 */
export const REPLAY_TIERS = [
    { hpPercent: 100, bossHpPercent: 100, coinPercent: 100 },
    { hpPercent: 110, bossHpPercent: 105, coinPercent: 65 },
    { hpPercent: 120, bossHpPercent: 110, coinPercent: 40 },
    { hpPercent: 130, bossHpPercent: 115, coinPercent: 25 }
] as const;

export const CHAPTER_GROWTH = [
    { hpPercent: 100, damagePercent: 100 },
    { hpPercent: 110, damagePercent: 108 },
    { hpPercent: 120, damagePercent: 115 }
] as const;
