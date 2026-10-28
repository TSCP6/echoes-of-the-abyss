/**
 * MOD-17 EconomyService（领域层，IF-M07）—— FR-09 金币/材料、FR-11 死亡保留、掉落表掷点。
 * 金币上限 99999（AT-33）；spend 为事务（任一不足整体不扣，K3）；
 * upgradeCost = round(60×n^1.5) 金币 + n 遗迹残片（FR-10 规则 3 / AT-36）；
 * rollLoot 权重随机，rng 注入可测（TT-01）。
 */
import { ok, fail, type Result } from './result';
import { warnThrottled } from './warn';
import { COINS_CAP } from '../data/playerDefaults';
import { LOOT_TABLES } from '../data/lootTables';
import type { SavePlayerSection } from './saveSchema';
export interface LootRollItem { itemId: string; count: number }
export type LootRoll = LootRollItem[];

export class EconomyService {
    private coins = 0;
    private materials: Record<string, number> = {};
    private dirty: (() => void) | null = null;

    onDirty(fn: () => void): void { this.dirty = fn; }

    getCoins(): number { return this.coins; }
    getMaterials(): Readonly<Record<string, number>> { return this.materials; }

    /** 上限 99999，达上限 rejected=true（AT-33） */
    addCoins(n: number): Result<{ coins: number; rejected: boolean }, 'INVALID_VALUE'> {
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
            warnThrottled('economy.addCoins', `金币增量非法 ${n}`);
            return fail('INVALID_VALUE', `金币增量非法：${n}`);
        }
        const before = this.coins;
        this.coins = Math.min(COINS_CAP, this.coins + n);
        if (this.coins !== before) { this.dirty?.(); }
        return ok({ coins: this.coins, rejected: this.coins === COINS_CAP && before + n > COINS_CAP });
    }

    addMaterial(itemId: string, n: number): void {
        const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        if (safe !== n) { warnThrottled('economy.addMaterial', `材料增量非法 ${n}`); }
        if (safe === 0) { return; }
        this.materials[itemId] = (this.materials[itemId] ?? 0) + safe;
        this.dirty?.();
    }

    /** 事务：任一不足整体不扣（K3 / FLOW-S4） */
    spend(cost: { coins?: number; materials?: Record<string, number> }):
        Result<void, 'COINS_INSUFFICIENT' | 'MATERIAL_INSUFFICIENT'> {
        const coins = cost.coins ?? 0;
        if (coins < 0 || !Number.isFinite(coins)) {
            return fail('COINS_INSUFFICIENT', `金币成本非法：${coins}`);
        }
        if (this.coins < coins) {
            return fail('COINS_INSUFFICIENT', `金币不足：需 ${coins}，现有 ${this.coins}`);
        }
        const mats = cost.materials ?? {};
        for (const [itemId, need] of Object.entries(mats)) {
            if ((this.materials[itemId] ?? 0) < need) {
                return fail('MATERIAL_INSUFFICIENT', `材料不足：${itemId} 需 ${need}，现有 ${this.materials[itemId] ?? 0}`);
            }
        }
        this.coins -= coins;
        for (const [itemId, need] of Object.entries(mats)) {
            this.materials[itemId] -= need;
            if (this.materials[itemId] <= 0) { delete this.materials[itemId]; }
        }
        this.dirty?.();
        return ok(undefined);
    }

    /** FR-10 规则 3：第 n 级升 n+1 = round(60×n^1.5) 金币 + n 遗迹残片 */
    upgradeCost(currentLevel: number): { coins: number; materials: Record<string, number> } {
        return {
            coins: Math.round(60 * Math.pow(currentLevel, 1.5)),
            materials: { itm_relic_shard: currentLevel }
        };
    }

    /** 死亡只重置本次尝试状态，已获得的金币完整保留。 */
    applyDeathPenalty(): { lostCoins: number } {
        return { lostCoins: 0 };
    }

    /** 掉落表权重掷点：rng 注入；权重和为 0 或表不存在 → 空掉落 */
    rollLoot(lootTableId: string, rng: () => number): LootRoll {
        const table = LOOT_TABLES.find((t) => t.id === lootTableId);
        if (!table || table.entries.length === 0) { return []; }
        const total = table.entries.reduce((s, e) => s + e.weight, 0);
        if (total <= 0) { return []; }
        const roll = rng() * total;
        let acc = 0;
        for (const entry of table.entries) {
            acc += entry.weight;
            if (roll < acc) {
                const span = entry.countMax - entry.countMin + 1;
                const count = entry.countMin + Math.floor(rng() * span);
                return [{ itemId: entry.itemId, count: Math.min(entry.countMax, Math.max(entry.countMin, count)) }];
            }
        }
        const last = table.entries[table.entries.length - 1];
        return [{ itemId: last.itemId, count: last.countMin }];
    }

    toSnapshot(): Pick<SavePlayerSection, 'coins' | 'materials'> {
        return { coins: this.coins, materials: { ...this.materials } };
    }

    fromSnapshot(d: Pick<SavePlayerSection, 'coins' | 'materials'>): void {
        this.coins = Number.isFinite(d.coins) ? Math.min(COINS_CAP, Math.max(0, Math.floor(d.coins))) : 0;
        this.materials = {};
        for (const [k, v] of Object.entries(d.materials ?? {})) {
            if (Number.isFinite(v) && v > 0) { this.materials[k] = Math.floor(v); }
        }
    }
}

/** 全局单例（ARCH-5：金币/材料唯一所有者） */
export const economyService = new EconomyService();
