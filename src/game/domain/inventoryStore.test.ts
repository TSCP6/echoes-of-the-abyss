/**
 * TT-01：InventoryStore 单测（FR-08 规则 3/5/6/8 + AT-27~30 + EX-10）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryStore, CAPACITY } from './inventoryStore';
import { validateAll, markValidated } from './configRegistry';
import { resourceSystem } from './resourceSystem';

beforeEach(() => {
    const r = validateAll();
    if (!r.ok) { throw new Error('config invalid'); }
    markValidated();
});

describe('InventoryStore（FR-08）', () => {
    let inv: InventoryStore;
    beforeEach(() => { inv = new InventoryStore(); });

    it('堆叠合并优先于占空格（FR-08 规则 3）', () => {
        inv.addItem('itm_potion_hp_s', 99);
        inv.addItem('itm_potion_hp_s', 1);
        const snap = inv.getSnapshot();
        const filled = snap.slots.filter((s) => s !== null);
        expect(filled).toHaveLength(2); // 99 满叠 + 1 新格
        expect(filled[0]?.count).toBe(99);
        expect(filled[1]?.count).toBe(1);
    });

    it('背包满拒收（AT-27 / EX-10）', () => {
        for (let i = 0; i < CAPACITY; i++) { inv.addItem('wpn_daggers'); } // 武器不堆叠，20 格占满
        const r = inv.addItem('itm_potion_hp_s', 1);
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('INVENTORY_FULL'); }
    });

    it('部分入包：overflowLeft 正确', () => {
        for (let i = 0; i < CAPACITY - 1; i++) { inv.addItem('wpn_daggers'); }
        const r = inv.addItem('itm_potion_hp_s', 120); // 1 空格 99 + 溢出 21
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.added).toBe(99);
            expect(r.value.overflowLeft).toBe(21);
        }
    });

    it('使用药水回复 HP 且数量减 1（AT-28）', () => {
        resourceSystem.applyDamage(50); // hp 50
        inv.addItem('itm_potion_hp_s', 2);
        const r = inv.useItem(0);
        expect(r.ok).toBe(true);
        if (r.ok && 'hpRestored' in r.value) {
            expect(r.value.hpRestored).toBe(30);
        }
        expect(resourceSystem.getSnapshot().hp).toBe(80);
        expect(inv.getSnapshot().slots[0]?.count).toBe(1);
    });

    it('回复不超上限（AT-28 边界）', () => {
        resourceSystem.applyDamage(10); // hp 90
        inv.addItem('itm_potion_hp_s', 1);
        inv.useItem(0);
        expect(resourceSystem.getSnapshot().hp).toBe(100);
    });

    it('装备回退来源格不丢失（AT-29）', () => {
        inv.addItem('wpn_daggers');   // slot0
        inv.addItem('wpn_greataxe');  // slot1
        inv.equip(0, 'main');
        inv.equip(1, 'main');         // 原主手 daggers 应回背包
        const snap = inv.getSnapshot();
        expect(snap.equipped.main).toBe('wpn_greataxe');
        const ids = snap.slots.filter((s) => s !== null).map((s) => s?.itemId);
        expect(ids).toContain('wpn_daggers'); // 未丢失
    });

    it('整理：类别排序 + 堆叠合并（AT-30）', () => {
        inv.addItem('itm_relic_shard', 5);   // material
        inv.addItem('wpn_daggers');           // weapon
        inv.addItem('itm_potion_hp_s', 3);    // consumable
        inv.addItem('itm_potion_hp_s', 4);    // consumable 可合并
        inv.sort();
        const snap = inv.getSnapshot();
        const filled = snap.slots.filter((s) => s !== null) as Array<{ itemId: string; count: number }>;
        expect(filled.map((f) => f.itemId)).toEqual(['wpn_daggers', 'itm_potion_hp_s', 'itm_relic_shard']);
        expect(filled[1].count).toBe(7);
    });

    it('丢弃与移动', () => {
        inv.addItem('itm_potion_hp_s', 3);
        const d = inv.dropItem(0);
        expect(d.ok).toBe(true);
        expect(inv.getSnapshot().slots[0]).toBeNull();
        inv.addItem('itm_dart', 5);
        inv.moveSlot(0, 3);
        expect(inv.getSnapshot().slots[3]?.itemId).toBe('itm_dart');
    });

    it('consumeItem 跨格扣减', () => {
        inv.addItem('itm_arrow', 99);
        inv.addItem('itm_arrow', 10);
        expect(inv.consumeItem('itm_arrow', 100)).toBe(true);
        expect(inv.countItem('itm_arrow')).toBe(9);
        expect(inv.consumeItem('itm_arrow', 10)).toBe(false);
    });

    it('新档经 JSON 存档往返后保留短剑、轻弩与初始物品', () => {
        inv.initNewGame();
        const restored = new InventoryStore();
        restored.fromSnapshot(JSON.parse(JSON.stringify(inv.toSnapshot())));
        expect(restored.getSnapshot().equipped).toEqual({ main: 'wpn_shortsword', sub: 'wpn_crossbow' });
        expect(restored.countItem('itm_potion_hp_s')).toBe(2);
        expect(restored.countItem('itm_arrow')).toBe(20);
    });

    it.each([
        { hand: 'main', initial: 'wpn_shortsword', replacement: 'wpn_daggers', name: '遗迹短剑' },
        { hand: 'sub', initial: 'wpn_crossbow', replacement: 'wpn_dartgun', name: '轻弩' }
    ] as const)('换下的 $initial 可保存、读回并重新装备', ({ hand, initial, replacement, name }) => {
        inv.initNewGame();
        inv.addItem(replacement);
        inv.equip(2, hand);
        const restored = new InventoryStore();
        restored.fromSnapshot(JSON.parse(JSON.stringify(inv.toSnapshot())));
        expect(restored.getSnapshot().equipped[hand]).toBe(replacement);
        expect(restored.countItem(initial)).toBe(1);
        const slot = restored.getSnapshot().slots.findIndex((s) => s?.itemId === initial);
        expect(restored.getTooltip(slot)?.name).toBe(name);
        expect(restored.equip(slot, hand).ok).toBe(true);
        expect(restored.getSnapshot().equipped[hand]).toBe(initial);
        expect(restored.countItem(replacement)).toBe(1);
    });

    it('读档拒绝将药水或未知 id 当作装备武器', () => {
        inv.fromSnapshot({ capacity: 20, slots: [], equipped: { main: 'itm_potion_hp_s', sub: 'wpn_unknown' } });
        expect(inv.getSnapshot().equipped).toEqual({ main: null, sub: null });
    });

    it('仅凭已有等级记录恢复旧档丢失的初始装备，重复修复不重复发放', () => {
        inv.fromSnapshot({ capacity: 20, slots: [], equipped: { main: null, sub: null } });
        expect(inv.restoreMissingInitialWeapons(['wpn_shortsword', 'wpn_crossbow'])).toBe(true);
        expect(inv.getSnapshot().equipped).toEqual({ main: 'wpn_shortsword', sub: 'wpn_crossbow' });
        expect(inv.restoreMissingInitialWeapons(['wpn_shortsword', 'wpn_crossbow'])).toBe(false);
        expect(inv.countItem('wpn_shortsword')).toBe(0);
        expect(inv.countItem('wpn_crossbow')).toBe(0);
    });

    it('修复旧档不覆盖已有装备，也不复制背包中的初始武器', () => {
        inv.fromSnapshot({
            capacity: 20,
            slots: [{ slot: 0, itemId: 'wpn_crossbow', count: 1 }],
            equipped: { main: 'wpn_daggers', sub: null }
        });
        expect(inv.restoreMissingInitialWeapons(['wpn_shortsword', 'wpn_crossbow'])).toBe(false);
        expect(inv.getSnapshot().equipped).toEqual({ main: 'wpn_daggers', sub: null });
        expect(inv.countItem('wpn_crossbow')).toBe(1);
    });

    it('旧档无武器持有记录时不凭空发放装备', () => {
        inv.fromSnapshot({ capacity: 20, slots: [], equipped: { main: null, sub: null } });
        expect(inv.restoreMissingInitialWeapons([])).toBe(false);
        expect(inv.getSnapshot().equipped).toEqual({ main: null, sub: null });
    });

    it.each([
        { main: null, sub: 'wpn_shortsword' },
        { main: 'wpn_crossbow', sub: null }
    ])('初始武器已在另一只手时不重复发放：$main / $sub', (equipped) => {
        inv.fromSnapshot({ capacity: 20, slots: [], equipped });
        expect(inv.restoreMissingInitialWeapons(['wpn_shortsword', 'wpn_crossbow'])).toBe(false);
        expect(inv.getSnapshot().equipped).toEqual(equipped);
    });
});
