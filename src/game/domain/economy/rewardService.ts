/** 奖励领域桥接：材料进入经济余额，其余物品遵守背包容量。 */
import { ConfigRegistry } from '../shared/configRegistry';
import { economyService, type LootRoll } from './economyService';
import { inventoryStore } from '../player/inventoryStore';
import { progressService } from '../progression/progressService';
import { CHEST_COINS, CHEST_MATERIAL_COUNTS, CHEST_CHAPTER_COIN_STEP, ENEMY_MATERIAL_COUNTS } from '../../data/rewardDefaults';

export interface GrantedReward {
    /** 实际入账金币（已扣除余额上限截断）。 */
    coins: number;
    materials: Record<string, number>;
    items: LootRoll;
    /** 由场景保留为世界拾取物，稍后腾出背包再拾取。 */
    overflow: LootRoll;
}

/** 由调用方先用 ProgressService 认领宝箱；本函数只负责发放一次奖励。 */
export function grantChestReward(levelId: string, chestId: string): GrantedReward {
    const result: GrantedReward = { coins: 0, materials: {}, items: [], overflow: [] };
    const level = ConfigRegistry.levels().find((def) => def.id === levelId);
    if (!level || !chestId) { return result; }
    const count = CHEST_MATERIAL_COUNTS[level.sceneId];
    if (count === undefined) { return result; }
    economyService.addMaterial('itm_relic_shard', count);
    result.materials.itm_relic_shard = count;
    const before = economyService.getCoins();
    economyService.addCoins(CHEST_COINS + (level.sceneId - 1) * CHEST_CHAPTER_COIN_STEP);
    result.coins = economyService.getCoins() - before;
    return result;
}

/** 兼容旧调用方：一次认领并发放；金币现在直接到账，不能再次生成金币奖励。 */
export function claimChestReward(levelId: string, chestId: string): { materialCount: number; coins: number } | null {
    if (!progressService.collectChest(levelId, chestId)) { return null; }
    const reward = grantChestReward(levelId, chestId);
    return { materialCount: reward.materials.itm_relic_shard ?? 0, coins: reward.coins };
}

/** 固定材料绕过背包容量；随机部分复用现有掉落权重与数量分布。 */
export function grantEnemyLoot(enemyId: string, rng: () => number = Math.random): GrantedReward {
    const result: GrantedReward = { coins: 0, materials: {}, items: [], overflow: [] };
    if (!ConfigRegistry.enemies()[enemyId]) { return result; }
    const fixed = ENEMY_MATERIAL_COUNTS[enemyId] ?? 0;
    if (fixed > 0) {
        economyService.addMaterial('itm_relic_shard', fixed);
        result.materials.itm_relic_shard = fixed;
    }
    for (const entry of enemyRewardItems(enemyId, rng)) {
        const granted = grantRewardItem(entry.itemId, entry.count);
        if (granted.added > 0) {
            if (ConfigRegistry.items()[entry.itemId]?.category === 'material') {
                result.materials[entry.itemId] = (result.materials[entry.itemId] ?? 0) + granted.added;
            } else { result.items.push({ itemId: entry.itemId, count: granted.added }); }
        }
        if (granted.remaining > 0) { result.overflow.push({ itemId: entry.itemId, count: granted.remaining }); }
    }
    return result;
}

/** 背包无法接收的数量交还世界拾取物保留，避免满包吞掉奖励。 */
export function grantRewardItem(itemId: string, count: number): { added: number; remaining: number } {
    if (!Number.isInteger(count) || count <= 0) { return { added: 0, remaining: 0 }; }
    const def = ConfigRegistry.items()[itemId];
    if (!def) { return { added: 0, remaining: count }; }
    if (def.category === 'material') {
        economyService.addMaterial(itemId, count);
        return { added: count, remaining: 0 };
    }
    const result = inventoryStore.addItem(itemId, count);
    return result.ok
        ? { added: result.value.added, remaining: result.value.overflowLeft }
        : { added: 0, remaining: count };
}

/** 复用配置的权重与数量分布，不在场景内另写概率。 */
export function enemyRewardItems(enemyId: string, rng: () => number): LootRoll {
    const enemy = ConfigRegistry.enemies()[enemyId];
    return enemy?.lootTableId ? economyService.rollLoot(enemy.lootTableId, rng) : [];
}
