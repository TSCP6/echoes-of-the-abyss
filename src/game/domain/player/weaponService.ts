/**
 * MOD-14 WeaponService（领域层，IF-M04）—— FR-05 武器等级/切换/弹药、FR-10 升级。
 * 等级系数 1+0.15×(level-1)；升级成本委托 EconomyService.upgradeCost（round(60n^1.5)+n 残片）；
 * 切换 0.20 s 攻击锁（FR-05 规则 5，游戏时钟递减，暂停自停）；弹药经 InventoryStore 扣减。
 * 主副手同武器按两份独立实例（各自等级，FR-05 边界）：等级键 = `${itemId}#${hand}`。
 */
import { ok, fail, type Result } from '../shared/result';
import type { WeaponDef } from '../shared/types';
import type { SaveWeaponsSection } from '../persistence/saveSchema';
import { ConfigRegistry } from '../shared/configRegistry';
import { economyService } from '../economy/economyService';
import { inventoryStore } from './inventoryStore';

export interface WeaponState { itemId: string; level: number; hand: 'main' | 'sub' }

const SWITCH_LOCK_SEC = 0.20;

export class WeaponService {
    /** 实例键（itemId#hand）→ 等级 */
    private levels = new Map<string, number>();
    private switchLock = 0;
    private activeHand: 'main' | 'sub' = 'main';
    private dirty: (() => void) | null = null;

    onDirty(fn: () => void): void { this.dirty = fn; }

    private key(itemId: string, hand: 'main' | 'sub'): string { return `${itemId}#${hand}`; }

    /** 新档由启动流程调用 */
    initNewGame(): void {
        this.levels.clear();
        const eq = ConfigRegistry.initialEquip();
        for (const w of ConfigRegistry.initialWeapons()) {
            this.levels.set(this.key(w.itemId, w.itemId === eq.main ? 'main' : 'sub'), w.level);
        }
        this.activeHand = 'main';
        this.switchLock = 0;
    }

    getOwned(): ReadonlyArray<WeaponState> {
        const out: WeaponState[] = [];
        for (const [k, level] of this.levels) {
            out.push({ itemId: k.split('#')[0], level, hand: k.endsWith('#sub') ? 'sub' : 'main' });
        }
        return out;
    }

    getActiveHand(): 'main' | 'sub' { return this.activeHand; }

    getLevelFactor(itemId: string, hand: 'main' | 'sub' = this.activeHand): number {
        const level = this.levels.get(this.key(itemId, hand)) ?? 1;
        return 1 + 0.15 * (level - 1);
    }

    getLevel(itemId: string, hand: 'main' | 'sub' = this.activeHand): number {
        return this.levels.get(this.key(itemId, hand)) ?? 1;
    }

    /** FR-10 规则 3：升级（成本 = round(60×n^1.5) 金币 + n 残片，缺一即失败 AT-36） */
    levelUp(itemId: string, hand: 'main' | 'sub' = this.activeHand): Result<WeaponState, 'MAX_LEVEL' | 'COINS_INSUFFICIENT' | 'MATERIAL_INSUFFICIENT'> {
        const k = this.key(itemId, hand);
        const level = this.levels.get(k) ?? 1;
        if (level >= 5) { return fail('MAX_LEVEL', '已满级'); }
        const cost = economyService.upgradeCost(level);
        const spend = economyService.spend(cost);
        if (!spend.ok) {
            return fail(spend.code === 'COINS_INSUFFICIENT' ? 'COINS_INSUFFICIENT' : 'MATERIAL_INSUFFICIENT', spend.message);
        }
        this.levels.set(k, level + 1);
        this.dirty?.();
        return ok({ itemId, level: level + 1, hand });
    }

    /** FR-05 规则 5：切换 0.20 s 攻击锁 */
    beginSwitch(hand: 'main' | 'sub', itemId: string): Result<void, 'ALREADY_EQUIPPED'> {
        const equipped = this.getEquippedDefs();
        if (this.activeHand === hand && equipped[hand]?.id === itemId) {
            return fail('ALREADY_EQUIPPED', '已在该手');
        }
        this.activeHand = hand;
        this.switchLock = SWITCH_LOCK_SEC;
        return ok(undefined);
    }

    toggleHand(): void {
        this.activeHand = this.activeHand === 'main' ? 'sub' : 'main';
        this.switchLock = SWITCH_LOCK_SEC;
    }

    isSwitchLocked(): boolean { return this.switchLock > 0; }
    tickSwitchLock(dt: number): void { this.switchLock = Math.max(0, this.switchLock - dt); }

    /** FR-05 规则 6：远程消耗弹药；弹药 0 → AMMO_EMPTY（不生成弹丸 + 提示） */
    consumeAmmo(itemId: string): Result<void, 'AMMO_EMPTY'> {
        const def = ConfigRegistry.weapons()[itemId];
        if (def === undefined || def.ammoItemId === null) { return ok(undefined); }
        if (inventoryStore.countItem(def.ammoItemId) <= 0) {
            return fail('AMMO_EMPTY', '弹药不足');
        }
        inventoryStore.consumeItem(def.ammoItemId, 1);
        return ok(undefined);
    }

    getEquippedDefs(): { main: WeaponDef | null; sub: WeaponDef | null } {
        const weapons = ConfigRegistry.weapons();
        const inv = inventoryStore.getSnapshot().equipped;
        return {
            main: inv.main !== null ? weapons[inv.main] ?? null : null,
            sub: inv.sub !== null ? weapons[inv.sub] ?? null : null
        };
    }

    toSnapshot(): SaveWeaponsSection {
        const out: SaveWeaponsSection = {};
        for (const [k, level] of this.levels) {
            out[k] = { level };
        }
        return out;
    }

    fromSnapshot(d: SaveWeaponsSection): void {
        this.levels.clear();
        const weapons = ConfigRegistry.weapons();
        for (const [k, v] of Object.entries(d ?? {})) {
            const itemId = k.split('#')[0];
            if (weapons[itemId] === undefined) { continue; }
            this.levels.set(k, Math.max(1, Math.min(5, Math.floor(v.level))));
        }
    }
}

/** 全局单例（ARCH-5：武器等级唯一所有者） */
export const weaponService = new WeaponService();
