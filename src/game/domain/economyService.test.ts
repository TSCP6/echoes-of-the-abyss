/**
 * TT-01：EconomyService 单测（FR-09/10/11 经济规则 + AT-33/36/40）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EconomyService } from './economyService';
import { resetWarnThrottle } from './warn';

describe('EconomyService', () => {
    let ec: EconomyService;
    beforeEach(() => {
        resetWarnThrottle();
        ec = new EconomyService();
    });

    it('addCoins 累加；上限 99999 达上限 rejected（AT-33）', () => {
        ec.addCoins(300);
        expect(ec.getCoins()).toBe(300);
        ec.addCoins(99999);
        expect(ec.getCoins()).toBe(99999);
        const r = ec.addCoins(1);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.rejected).toBe(true);
            expect(r.value.coins).toBe(99999);
        }
    });

    it('spend 事务：材料不足整体不扣（K3）', () => {
        ec.addCoins(100);
        const r = ec.spend({ coins: 50, materials: { itm_relic_shard: 1 } });
        expect(r.ok).toBe(false);
        expect(ec.getCoins()).toBe(100); // 金币未被扣
    });

    it('spend 成功：金币与材料同扣（AT-36 前置）', () => {
        ec.addCoins(100);
        ec.addMaterial('itm_relic_shard', 2);
        const r = ec.spend({ coins: 60, materials: { itm_relic_shard: 1 } });
        expect(r.ok).toBe(true);
        expect(ec.getCoins()).toBe(40);
        expect(ec.getMaterials()['itm_relic_shard']).toBe(1);
    });

    it('upgradeCost：1→2 = 60 金币 + 1 残片；2→3 = 170 + 2（AT-36/附录A）', () => {
        expect(ec.upgradeCost(1)).toEqual({ coins: 60, materials: { itm_relic_shard: 1 } });
        expect(ec.upgradeCost(2)).toEqual({ coins: 170, materials: { itm_relic_shard: 2 } });
        expect(ec.upgradeCost(3).coins).toBe(312);
        expect(ec.upgradeCost(4).coins).toBe(480);
    });

    it('死亡不扣金币，包括低余额和上限余额', () => {
        for (const balance of [3, 100, 99999]) {
            ec.fromSnapshot({ coins: balance, materials: {} });
            expect(ec.applyDeathPenalty().lostCoins).toBe(0);
            expect(ec.getCoins()).toBe(balance);
        }
    });

    it('真实余额变更通知保存，失败、封顶与读档不通知', () => {
        const dirty = vi.fn();
        ec.onDirty(dirty);
        ec.fromSnapshot({ coins: 99998, materials: {} });
        expect(dirty).not.toHaveBeenCalled();
        ec.addCoins(2);
        expect(dirty).toHaveBeenCalledTimes(1);
        ec.addCoins(1);
        ec.addMaterial('itm_relic_shard', 0);
        ec.spend({ coins: 100000 });
        expect(dirty).toHaveBeenCalledTimes(1);
        ec.addMaterial('itm_relic_shard', 2);
        ec.spend({ coins: 60, materials: { itm_relic_shard: 1 } });
        expect(dirty).toHaveBeenCalledTimes(3);
    });

    it('rollLoot：rng 注入确定性（权重命中首条/末条）', () => {
        const roll = ec.rollLoot('loot_patrol', () => 0.0);
        expect(roll[0].itemId).toBe('itm_relic_shard'); // 权重 8 首条
        expect(roll[0].count).toBe(1);
        const roll2 = ec.rollLoot('loot_patrol', () => 0.999);
        expect(roll2[0].itemId).toBe('itm_potion_hp_s'); // 末条
    });

    it('rollLoot：表不存在 → 空掉落', () => {
        expect(ec.rollLoot('loot_none', Math.random)).toEqual([]);
    });
});
