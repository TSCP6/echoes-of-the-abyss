/**
 * DR-01 数据配置层装配出口（7.2.1 目录约定的 index.ts）。
 * 本文件只做原始表的再导出，不含逻辑；校验与只读门面归 MOD-23 ConfigRegistry（领域层）。
 */
export { WEAPONS, INITIAL_WEAPONS, INITIAL_EQUIP } from './weapons';
export { ENEMIES } from './enemies';
export { SKILLS, SKP_TOTAL_COST } from './skills';
export { ITEMS } from './items';
export { LEVELS, LEVEL_ORDER, BOSS_SKP_REWARD } from './levels';
export { GOODS } from './goods';
export { LOOT_TABLES } from './lootTables';
export {
    PLAYER_DEFAULTS, HP_MAX_CAP, SP_MAX_CAP,
    SP_REGEN_PER_SEC, SP_KILL_GAIN, OUT_OF_COMBAT_DELAY_SEC,
    DEATH_COIN_LOSS_RATIO, DEATH_COIN_LOSS_CAP, COINS_CAP,
    SKP_OBTAINABLE_TOTAL, SKP_FROM_SHARDS, SKP_FROM_BOSSES, SKP_FULL_UNLOCK_COST
} from './playerDefaults';
export type { ConfigValidationError } from '../domain/shared/configRegistry';
export { validateAll, ConfigRegistry, markValidated } from '../domain/shared/configRegistry';
