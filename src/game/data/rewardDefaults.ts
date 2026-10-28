/** 宝箱与强敌的稳定成长资源；随机部分继续读取 lootTables。 */
export const CHEST_MATERIAL_COUNTS: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 3 };
export const CHEST_COINS = 40;
export const CHEST_CHAPTER_COIN_STEP = 20;
/** 首通稳定收入，普通关30/60/90，Boss关100/200/300。 */
export const FIRST_CLEAR_COINS = { normal: 30, boss: 100 } as const;
export const ENEMY_MATERIAL_COUNTS: Readonly<Record<string, number>> = {
    enm_elite: 1,
    enm_boss_guardian: 3,
    enm_boss_spider: 5,
    enm_boss_echo: 8
};
