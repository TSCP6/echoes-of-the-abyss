/**
 * MOD-18 ShopService（领域层，IF-M08）—— FR-10 商品过滤与购买事务。
 * listGoods：unlockScene 过滤 + 状态标记（已拥有/已满级/可负担/缺口，UI-C5 置灰依据）；
 * buy：FLOW-S4 事务序——先全量校验（金币/背包空间/已拥有）后统一提交，任一失败整体不生效（K3）；
 * upgradeWeapon：委托 WeaponService.levelUp（成本 round(60n^1.5)+n 残片）。
 */
import { ok, fail, type Result } from './result';
import { ConfigRegistry } from './configRegistry';
import { economyService } from './economyService';
import { inventoryStore } from './inventoryStore';
import { weaponService } from './weaponService';

export interface GoodsView {
    goodsId: string;
    refType: 'item' | 'weapon';
    refId: string;
    price: number;
    count: number;
    owned: boolean;
    maxLevel: boolean;
    affordable: boolean;
    shortage: number;
}

export class ShopService {
    listGoods(sceneId: 1 | 2 | 3): GoodsView[] {
        const coins = economyService.getCoins();
        return ConfigRegistry.goods()
            .filter((g) => g.unlockScene <= sceneId)
            .map((g) => {
                const owned = g.refType === 'weapon' && inventoryStore.ownsWeapon(g.refId);
                const level = g.refType === 'weapon' ? weaponService.getLevel(g.refId) : 0;
                return {
                    goodsId: g.id,
                    refType: g.refType,
                    refId: g.refId,
                    price: g.price,
                    count: g.count ?? 1,
                    owned,
                    maxLevel: g.refType === 'weapon' && level >= 5,
                    affordable: coins >= g.price,
                    shortage: Math.max(0, g.price - coins)
                };
            });
    }

    /** FLOW-S4 事务：校验 → 扣款 → 入包（背包满不扣款，EX-10） */
    buy(goodsId: string): Result<void, 'COINS_INSUFFICIENT' | 'INVENTORY_FULL' | 'ALREADY_OWNED'> {
        const def = ConfigRegistry.goods().find((g) => g.id === goodsId);
        if (def === undefined) { return fail('COINS_INSUFFICIENT', `未知商品 ${goodsId}`); }
        if (def.refType === 'weapon' && inventoryStore.ownsWeapon(def.refId)) {
            return fail('ALREADY_OWNED', '已拥有');
        }
        const count = def.count ?? 1;
        // 预检（不提交）
        if (economyService.getCoins() < def.price) {
            return fail('COINS_INSUFFICIENT', `金币不足：需 ${def.price}`);
        }
        if (!inventoryStore.hasFreeSpace(def.refId, count)) {
            return fail('INVENTORY_FULL', '背包已满');
        }
        // 提交（事务：spend 成功后 addItem 必成功——预检已保证空间）
        const spend = economyService.spend({ coins: def.price });
        if (!spend.ok) { return fail('COINS_INSUFFICIENT', spend.message); }
        inventoryStore.addItem(def.refId, count);
        return ok(undefined);
    }

    upgradeWeapon(itemId: string): Result<void, 'MAX_LEVEL' | 'COINS_INSUFFICIENT' | 'MATERIAL_INSUFFICIENT'> {
        const r = weaponService.levelUp(itemId);
        return r.ok ? ok(undefined) : fail(r.code, r.message);
    }
}

/** 全局单例 */
export const shopService = new ShopService();
