import { beforeEach, describe, expect, it } from 'vitest';
import { validateAll, markValidated } from './configRegistry';
import { progressService } from './progressService';
import { economyService } from './economyService';
import { inventoryStore } from './inventoryStore';
import { grantChestReward, grantEnemyLoot, enemyRewardItems, grantRewardItem } from './rewardService';

beforeEach(() => {
    expect(validateAll().ok).toBe(true);
    markValidated();
    progressService.reset();
    economyService.fromSnapshot({ coins: 0, materials: {} });
    inventoryStore.fromSnapshot({ capacity: 20, slots: [], equipped: { main: null, sub: null } });
});

describe('宝箱奖励与世界掉落', () => {
    it.each([['1-1', 1, 40], ['2-2', 2, 60], ['3-3', 3, 80]] as const)('章节 %s 宝箱直接发放固定材料和金币', (levelId, count, coins) => {
        const reward = grantChestReward(levelId, 'chest_a');
        expect(reward.coins).toBe(coins);
        expect(reward.materials).toEqual({ itm_relic_shard: count });
        expect(economyService.getCoins()).toBe(coins);
        expect(economyService.getMaterials().itm_relic_shard).toBe(count);
    });

    it('前两关宝箱足够强化一次并留补给金币', () => {
        grantChestReward('1-1', 'a'); grantChestReward('1-2', 'a');
        expect(economyService.spend(economyService.upgradeCost(1)).ok).toBe(true);
        expect(economyService.getCoins()).toBeGreaterThanOrEqual(20);
    });

    it('宝箱返回实际入账金币，未知关卡不产生奖励', () => {
        economyService.fromSnapshot({ coins: 99998, materials: {} });
        expect(grantChestReward('1-1', 'a').coins).toBe(1);
        expect(grantChestReward('9-9', 'a')).toEqual({ coins: 0, materials: {}, items: [], overflow: [] });
    });

    it.each([['enm_elite', 1], ['enm_boss_guardian', 3], ['enm_boss_spider', 5], ['enm_boss_echo', 8]] as const)('满包时 %s 保底材料仍入账，随机物品保留余量', (id, fixed) => {
        inventoryStore.addItem('itm_potion_hp_s', 1980);
        const reward = grantEnemyLoot(id, () => 0.999);
        expect(economyService.getMaterials().itm_relic_shard).toBe(fixed);
        expect(reward.overflow.length).toBe(1);
        expect(reward.items).toEqual([]);
    });

    it('随机材料与固定材料累加；普通敌人保留原掉落表', () => {
        const reward = grantEnemyLoot('enm_boss_guardian', () => 0);
        expect(reward.materials).toEqual({ itm_relic_shard: 8 });
        expect(grantEnemyLoot('enm_patrol', () => 0).materials).toEqual({ itm_relic_shard: 1 });
        expect(grantEnemyLoot('unknown', () => 0).materials).toEqual({});
    });

    it('背包满时材料仍直接加入强化余额', () => {
        inventoryStore.addItem('itm_potion_hp_s', 1980);
        expect(grantRewardItem('itm_relic_shard', 3)).toEqual({ added: 3, remaining: 0 });
        expect(economyService.getMaterials().itm_relic_shard).toBe(3);
        expect(inventoryStore.countItem('itm_relic_shard')).toBe(0);
    });

    it('消耗品部分加入后保留余量，背包全满保留全部奖励', () => {
        inventoryStore.addItem('itm_potion_hp_s', 1979);
        expect(grantRewardItem('itm_potion_hp_s', 3)).toEqual({ added: 1, remaining: 2 });
        expect(inventoryStore.countItem('itm_potion_hp_s')).toBe(1980);
        expect(grantRewardItem('itm_arrow', 4)).toEqual({ added: 0, remaining: 4 });
    });

    it('敌人配置掉落表实际产出材料、弹药和 Boss 材料', () => {
        expect(enemyRewardItems('enm_patrol', () => 0)).toEqual([{ itemId: 'itm_relic_shard', count: 1 }]);
        expect(enemyRewardItems('enm_patrol', () => 0.999)).toEqual([{ itemId: 'itm_potion_hp_s', count: 1 }]);
        expect(enemyRewardItems('enm_flyer', () => 0)).toEqual([{ itemId: 'itm_arrow', count: 2 }]);
        expect(enemyRewardItems('enm_boss_guardian', () => 0)).toEqual([{ itemId: 'itm_relic_shard', count: 5 }]);
        expect(enemyRewardItems('unknown', () => 0)).toEqual([]);
    });
});
