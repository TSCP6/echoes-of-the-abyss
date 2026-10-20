/**
 * TT-01：WeaponService 单测（FR-05 规则 3/5/6 + FR-10 规则 3 + AT-17/18/19/36）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WeaponService } from './weaponService';
import { validateAll, markValidated } from './configRegistry';
import { economyService } from './economyService';
import { inventoryStore } from './inventoryStore';

beforeEach(() => {
    const r = validateAll();
    if (!r.ok) { throw new Error('config invalid'); }
    markValidated();
});

describe('WeaponService（FR-05/FR-10）', () => {
    let ws: WeaponService;
    beforeEach(() => {
        economyService.fromSnapshot({ coins: 0, materials: {} }); // 全局单例残留重置
        ws = new WeaponService();
        inventoryStore.initNewGame();
        ws.initNewGame();
    });

    it('等级系数：1 级 = 1.0，2 级 = 1.15（AT-17 前置）', () => {
        expect(ws.getLevelFactor('wpn_shortsword')).toBe(1);
        economyService.addCoins(100);
        economyService.addMaterial('itm_relic_shard', 2);
        const r = ws.levelUp('wpn_shortsword');
        expect(r.ok).toBe(true);
        expect(ws.getLevelFactor('wpn_shortsword')).toBeCloseTo(1.15, 10);
    });

    it('升级成本缺一即失败（AT-36）', () => {
        economyService.addCoins(100); // 有金币无残片
        const r = ws.levelUp('wpn_shortsword');
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('MATERIAL_INSUFFICIENT'); }
        economyService.addMaterial('itm_relic_shard', 1);
        const r2 = ws.levelUp('wpn_shortsword');
        expect(r2.ok).toBe(true); // 60 金币 + 1 残片齐
    });

    it('满级拒绝（FR-05 边界）', () => {
        economyService.addCoins(99999);
        economyService.addMaterial('itm_relic_shard', 99);
        for (let i = 0; i < 4; i++) { expect(ws.levelUp('wpn_shortsword').ok).toBe(true); }
        const r = ws.levelUp('wpn_shortsword');
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('MAX_LEVEL'); }
    });

    it('切换 0.20 s 攻击锁（FR-05 规则 5）', () => {
        ws.toggleHand();
        expect(ws.isSwitchLocked()).toBe(true);
        ws.tickSwitchLock(0.19);
        expect(ws.isSwitchLocked()).toBe(true);
        ws.tickSwitchLock(0.02);
        expect(ws.isSwitchLocked()).toBe(false);
    });

    it('弹药 0 拒射（AT-19）', () => {
        while (inventoryStore.countItem('itm_arrow') > 0) { inventoryStore.consumeItem('itm_arrow', 99); }
        const r = ws.consumeAmmo('wpn_crossbow');
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('AMMO_EMPTY'); }
        inventoryStore.addItem('itm_arrow', 1);
        expect(ws.consumeAmmo('wpn_crossbow').ok).toBe(true);
        expect(inventoryStore.countItem('itm_arrow')).toBe(0);
    });

    it('近战不耗弹药', () => {
        expect(ws.consumeAmmo('wpn_shortsword').ok).toBe(true);
    });

    it('快照往返保持等级', () => {
        economyService.addCoins(100);
        economyService.addMaterial('itm_relic_shard', 1);
        ws.levelUp('wpn_shortsword');
        const snap = ws.toSnapshot();
        const ws2 = new WeaponService();
        ws2.fromSnapshot(snap);
        expect(ws2.getLevel('wpn_shortsword', 'main')).toBe(2);
    });
});
