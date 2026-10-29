import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigRegistry, markValidated, validateAll } from './configRegistry';
import { progressService } from './progressService';
import { recordStore } from './recordStore';
import { inventoryStore } from './inventoryStore';
import { weaponService } from './weaponService';
import { economyService } from './economyService';
import { canFinishCampaign, campaignSummary, claimVictoryLoot } from './campaignVictory';

beforeEach(() => {
    expect(validateAll().ok).toBe(true); markValidated();
    progressService.reset();
    recordStore.fromSnapshot({ bestTimeSec: {}, bestShards: {}, totalDeaths: 0, totalKills: 0, totalPlaySec: 0 });
    inventoryStore.fromSnapshot({ capacity: 20, slots: [], equipped: { main: null, sub: null } });
    weaponService.initNewGame(); economyService.fromSnapshot({ coins: 0, materials: {} });
});

describe('终章胜利', () => {
    it('只有最后一关且前十一关全部完成才触发终章', () => {
        expect(canFinishCampaign('3-4')).toBe(false);
        for (const l of ConfigRegistry.levels().slice(0, -1)) { progressService.completeLevel(l.id); }
        expect(canFinishCampaign('2-4')).toBe(false);
        expect(canFinishCampaign('3-4')).toBe(true);
    });
    it('三章按实际配置统计，重复和未知碎片不能获得完整回响', () => {
        const snap = progressService.toSnapshot();
        snap.collectedShards = Array(36).fill('unknown'); progressService.fromSnapshot(snap);
        expect(campaignSummary().completeEcho).toBe(false);
        for (const level of ConfigRegistry.levels()) {
            progressService.completeLevel(level.id);
            for (const key of ['a', 'b', 'c']) { progressService.collectShard(level.id, key); }
        }
        progressService.openChest('2-3', 'chest_1');
        const view = campaignSummary();
        expect(view.completed).toBe(true);
        expect(view.shards).toBe(36); expect(view.completeEcho).toBe(true);
        expect(view.chapters.map(c => [c.cleared, c.total, c.shards])).toEqual([[4, 4, 12], [4, 4, 12], [4, 4, 12]]);
        expect(view.chests).toBe(1);
    });
    it('记录展示累计值与最终关最佳用时；快照不受后续变更影响', () => {
        recordStore.addPlayTime(100); recordStore.addPlayTime(50); recordStore.addDeath();
        recordStore.submitResult('3-4', 42.3, 2); economyService.addCoins(87);
        const view = campaignSummary(); recordStore.addPlayTime(60);
        expect(view.playSec).toBe(150); expect(view.deaths).toBe(1);
        expect(view.finalBestSec).toBe(42.3); expect(view.coins).toBe(87);
    });
    it('满包的最终掉落能存档往返，腾出空间后只领取一次', () => {
        inventoryStore.addItem('itm_potion_hp_s', 1980);
        progressService.setVictoryLoot([{ itemId: 'itm_potion_hp_l', count: 2 }]);
        claimVictoryLoot();
        const snapshot = progressService.toSnapshot(); progressService.reset(); progressService.fromSnapshot(snapshot);
        expect(progressService.getVictoryLoot()).toEqual([{ itemId: 'itm_potion_hp_l', count: 2 }]);
        inventoryStore.fromSnapshot({ capacity: 20, slots: [], equipped: { main: null, sub: null } });
        claimVictoryLoot(); claimVictoryLoot();
        expect(inventoryStore.countItem('itm_potion_hp_l')).toBe(2);
        expect(progressService.getVictoryLoot()).toEqual([]);
    });
    it('旧档没有待领取奖励时正常恢复；损坏条目不会进入领取流程', () => {
        const snapshot = progressService.toSnapshot(); delete snapshot.victoryLoot;
        progressService.fromSnapshot(snapshot); expect(progressService.getVictoryLoot()).toEqual([]);
        progressService.setVictoryLoot([{ itemId: 'unknown', count: 2 }, { itemId: 'itm_arrow', count: -1 }]);
        expect(progressService.getVictoryLoot()).toEqual([]);
    });
});
