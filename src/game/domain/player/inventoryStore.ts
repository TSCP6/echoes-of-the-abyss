/**
 * MOD-16 InventoryStore（领域层，IF-M06）—— FR-08 全部规则。
 * 20 格槽位；三类物品（武器不堆叠/消耗品/材料 99）；先并堆叠后占空格；
 * 装备回退来源格（AT-29，不丢失为硬约束）；sort = 武器→消耗品→材料 + 合并（AT-30）。
 * 任何成功变更后发布 inventory:changed（IF-E07）+ markDirty（P3 SaveSystem 接入）。
 */
import { ok, fail, type Result } from '../shared/result';
import type { SlotEntry } from '../shared/types';
import type { SaveInventorySection } from '../persistence/saveSchema';
import { ConfigRegistry } from '../shared/configRegistry';
import { resourceSystem } from './resourceSystem';
import { warnThrottled } from '../shared/warn';
import { emitEvent } from '../../events';

export const CAPACITY = 20;

export interface ItemTooltip {
    name: string; category: string; description: string; count: number; price: number;
}

export class InventoryStore {
    private slots: (SlotEntry | null)[] = new Array(CAPACITY).fill(null);
    private equipped: { main: string | null; sub: string | null } = { main: null, sub: null };
    /** itemId → 来源格索引（装备回退用，4.3.6） */
    private sourceSlot = new Map<string, number>();
    private dirty: (() => void) | null = null;

    /** P3：SaveSystem 注册脏标记回调 */
    onDirty(fn: () => void): void { this.dirty = fn; }

    getSnapshot(): Readonly<{ capacity: 20; slots: (SlotEntry | null)[]; equipped: { main: string | null; sub: string | null } }> {
        return {
            capacity: CAPACITY,
            slots: this.slots.map((s) => (s === null ? null : { ...s })),
            equipped: { ...this.equipped }
        };
    }

    private changed(): void {
        emitEvent('inventory:changed', { slots: this.getSnapshot().slots, equipped: { ...this.equipped } });
        if (this.dirty !== null) { this.dirty(); }
    }

    getTooltip(slot: number): ItemTooltip | null {
        const entry = this.slots[slot];
        if (entry === null) { return null; }
        const def = ConfigRegistry.items()[entry.itemId];
        if (def === undefined) { return null; }
        return { name: def.name, category: def.category, description: def.description, count: entry.count, price: def.price };
    }

    /** FR-08 规则 3：先遍历可堆叠同类未满槽合并，再占空格 */
    addItem(itemId: string, count = 1): Result<{ added: number; overflowLeft: number }, 'INVENTORY_FULL'> {
        const def = ConfigRegistry.items()[itemId];
        if (def === undefined) {
            warnThrottled('inv.addItem', `未知物品 ${itemId}`);
            return fail('INVENTORY_FULL', `未知物品：${itemId}`);
        }
        let left = count;
        if (def.stackMax > 1) {
            for (let i = 0; i < CAPACITY && left > 0; i++) {
                const s = this.slots[i];
                if (s !== null && s.itemId === itemId && s.count < def.stackMax) {
                    const take = Math.min(def.stackMax - s.count, left);
                    s.count += take;
                    left -= take;
                }
            }
        }
        for (let i = 0; i < CAPACITY && left > 0; i++) {
            if (this.slots[i] === null) {
                const take = Math.min(def.stackMax, left);
                this.slots[i] = { itemId, count: take };
                left -= take;
            }
        }
        if (left === count) {
            return fail('INVENTORY_FULL', '背包已满');
        }
        this.changed();
        return ok({ added: count - left, overflowLeft: left });
    }

    hasFreeSpace(itemId: string, count = 1): boolean {
        const def = ConfigRegistry.items()[itemId];
        if (def === undefined) { return false; }
        let left = count;
        if (def.stackMax > 1) {
            for (const s of this.slots) {
                if (s !== null && s.itemId === itemId && s.count < def.stackMax) {
                    left -= def.stackMax - s.count;
                }
            }
        }
        for (const s of this.slots) {
            if (s === null) { left -= def.stackMax; }
        }
        return left <= 0;
    }

    /** FR-08 规则 5：消耗品左键使用（药水回复 HP/SP）；投掷物返回 throwMode */
    useItem(slot: number): Result<{ hpRestored: number; spRestored: number } | { throwMode: true }, 'SLOT_EMPTY' | 'NOT_USABLE'> {
        const entry = this.slots[slot];
        if (entry === null) { return fail('SLOT_EMPTY', '空格'); }
        const def = ConfigRegistry.items()[entry.itemId];
        if (def === undefined || def.category !== 'consumable') {
            return fail('NOT_USABLE', '该物品不可使用');
        }
        if (def.throwable) {
            return ok({ throwMode: true });
        }
        let hpRestored = 0;
        let spRestored = 0;
        if (def.effect.fullHp === true) {
            const before = resourceSystem.getSnapshot().hp;
            const r = resourceSystem.heal(resourceSystem.getSnapshot().hpMax);
            hpRestored = r.hp - before;
        } else {
            if (def.effect.hp !== undefined) {
                const before = resourceSystem.getSnapshot().hp;
                const r = resourceSystem.heal(def.effect.hp);
                hpRestored = r.hp - before;
            }
            if (def.effect.sp !== undefined) {
                const before = resourceSystem.getSnapshot().sp;
                const r = resourceSystem.restoreSp(def.effect.sp);
                spRestored = r.sp - before;
            }
        }
        entry.count -= 1;
        if (entry.count <= 0) { this.slots[slot] = null; }
        this.changed();
        return ok({ hpRestored, spRestored });
    }

    /** FR-08 规则 6：装备到主/副手；原槽位武器回来源格（AT-29） */
    equip(slot: number, hand: 'main' | 'sub'): Result<void, 'SLOT_EMPTY'> {
        const entry = this.slots[slot];
        if (entry === null) { return fail('SLOT_EMPTY', '空格'); }
        const def = ConfigRegistry.items()[entry.itemId];
        if (def === undefined || def.category !== 'weapon') {
            return fail('SLOT_EMPTY', '非武器不可装备');
        }
        const previous = this.equipped[hand];
        this.equipped[hand] = entry.itemId;
        this.sourceSlot.set(entry.itemId, slot);
        if (previous !== null && previous !== entry.itemId) {
            // 原武器回来源格；来源格被占则找最近空格（不丢失为硬约束）
            const home = this.sourceSlot.get(previous);
            let target = home !== undefined && this.slots[home] === null ? home : -1;
            if (target === -1) {
                for (let i = 0; i < CAPACITY; i++) {
                    if (this.slots[i] === null) { target = i; break; }
                }
            }
            if (target === -1) {
                // 无空格：与当前格交换（背包满且换装的唯一出路，不丢失）
                this.slots[slot] = { itemId: previous, count: 1 };
            } else {
                this.slots[target] = { itemId: previous, count: 1 };
                this.sourceSlot.set(previous, target);
                this.slots[slot] = null;
            }
        } else {
            this.slots[slot] = null;
        }
        this.changed();
        return ok(undefined);
    }

    dropItem(slot: number): Result<SlotEntry, 'SLOT_EMPTY'> {
        const entry = this.slots[slot];
        if (entry === null) { return fail('SLOT_EMPTY', '空格'); }
        this.slots[slot] = null;
        this.changed();
        return ok(entry);
    }

    moveSlot(from: number, to: number): Result<void, 'SLOT_EMPTY'> {
        if (from === to) { return ok(undefined); }
        const a = this.slots[from];
        if (a === null) { return fail('SLOT_EMPTY', '源格为空'); }
        const b = this.slots[to];
        this.slots[to] = a;
        this.slots[from] = b;
        this.changed();
        return ok(undefined);
    }

    /** FR-08 规则 8：武器→消耗品→材料 稳定排序 + 同类堆叠合并（AT-30） */
    sort(): void {
        const order: Record<string, number> = { weapon: 0, consumable: 1, material: 2 };
        const entries = this.slots.filter((s): s is SlotEntry => s !== null);
        entries.sort((a, b) => {
            const da = ConfigRegistry.items()[a.itemId];
            const db = ConfigRegistry.items()[b.itemId];
            const ca = da !== undefined ? order[da.category] : 3;
            const cb = db !== undefined ? order[db.category] : 3;
            return ca - cb || a.itemId.localeCompare(b.itemId);
        });
        // 合并同类可堆叠
        const merged: SlotEntry[] = [];
        for (const e of entries) {
            const def = ConfigRegistry.items()[e.itemId];
            const last = merged[merged.length - 1];
            if (def !== undefined && def.stackMax > 1 && last !== undefined && last.itemId === e.itemId && last.count + e.count <= def.stackMax) {
                last.count += e.count;
            } else {
                merged.push({ ...e });
            }
        }
        this.slots = new Array(CAPACITY).fill(null);
        merged.forEach((e, i) => { this.slots[i] = e; });
        this.changed();
    }

    /** 扣弹药（WeaponService.consumeAmmo 经此） */
    consumeItem(itemId: string, count = 1): boolean {
        let left = count;
        for (let i = CAPACITY - 1; i >= 0 && left > 0; i--) {
            const s = this.slots[i];
            if (s !== null && s.itemId === itemId) {
                const take = Math.min(s.count, left);
                s.count -= take;
                left -= take;
                if (s.count <= 0) { this.slots[i] = null; }
            }
        }
        if (left < count) { this.changed(); }
        return left === 0;
    }

    countItem(itemId: string): number {
        return this.slots.reduce((sum, s) => sum + (s !== null && s.itemId === itemId ? s.count : 0), 0);
    }

    ownsWeapon(itemId: string): boolean {
        return this.equipped.main === itemId || this.equipped.sub === itemId
            || this.slots.some((s) => s !== null && s.itemId === itemId);
    }

    toSnapshot(): SaveInventorySection {
        const slots: SaveInventorySection['slots'] = [];
        this.slots.forEach((s, i) => {
            if (s !== null) { slots.push({ slot: i, itemId: s.itemId, count: s.count, instanceKey: s.instanceKey }); }
        });
        return { capacity: CAPACITY, slots, equipped: { ...this.equipped } };
    }

    /** K5 宽容恢复：非法条目丢弃 + warn（DR-02 校验规则） */
    fromSnapshot(d: SaveInventorySection): void {
        this.slots = new Array(CAPACITY).fill(null);
        const items = ConfigRegistry.items();
        for (const s of d.slots ?? []) {
            if (s.slot < 0 || s.slot >= CAPACITY) { warnThrottled('inv.load', `槽位越界 ${s.slot}`); continue; }
            const def = items[s.itemId];
            if (def === undefined) { warnThrottled('inv.load', `丢弃未知物品 ${s.itemId}`); continue; }
            const count = Math.max(1, Math.min(def.stackMax, Math.floor(s.count)));
            this.slots[s.slot] = { itemId: s.itemId, count, instanceKey: s.instanceKey };
        }
        const mainId = d.equipped?.main ?? null;
        const subId = d.equipped?.sub ?? null;
        this.equipped = {
            main: mainId !== null && items[mainId]?.category === 'weapon' ? mainId : null,
            sub: subId !== null && items[subId]?.category === 'weapon' ? subId : null
        };
    }

    /** 旧版曾把初始装备写成 null；仅凭持有记录补回完全丢失的武器，不覆盖换装或复制背包物品。 */
    restoreMissingInitialWeapons(ownedWeaponIds: ReadonlyArray<string>): boolean {
        const owned = new Set(ownedWeaponIds);
        const initial = ConfigRegistry.initialEquip();
        let restored = false;
        for (const hand of ['main', 'sub'] as const) {
            const id = initial[hand];
            if (this.equipped[hand] === null && owned.has(id) && !this.ownsWeapon(id)) {
                this.equipped[hand] = id;
                restored = true;
            }
        }
        if (restored) { this.changed(); }
        return restored;
    }

    /** 新档初始装备（Preloader/启动流程调用） */
    initNewGame(): void {
        this.slots = new Array(CAPACITY).fill(null);
        const init = ConfigRegistry.initialWeapons();
        const eq = ConfigRegistry.initialEquip();
        this.equipped = { main: eq.main, sub: eq.sub };
        init.forEach((w, i) => {
            this.sourceSlot.set(w.itemId, i);
        });
        // 初始药水 ×2（教学与首关容错）
        this.addItem('itm_potion_hp_s', 2);
        this.addItem('itm_arrow', 20);
        this.changed();
    }
}

/** 全局单例（ARCH-5：背包槽位与装备唯一所有者） */
export const inventoryStore = new InventoryStore();
