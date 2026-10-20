<script setup lang="ts">
/** UI-07 商店（MOD-31）：商品列表 + 置灰与缺口显示 + 武器升级（FR-10 / UI-C5）。 */
import { computed } from 'vue';
import { shopService } from '../game/domain/shopService';
import { economyService } from '../game/domain/economyService';
import { weaponService } from '../game/domain/weaponService';
import { ConfigRegistry } from '../game/domain/configRegistry';
import { useDomainStore } from './useDomainStore';
import { onEvent, offEvent } from '../game/events';

const props = defineProps<{ sceneId: 1 | 2 | 3 }>();
const emit = defineEmits<{ close: [] }>();

// 金币变化驱动列表刷新（购买/升级后余额变）
const coins = useDomainStore(
    () => economyService.getCoins(),
    (onChange) => {
        onEvent('inventory:changed', onChange);
        return () => offEvent('inventory:changed', onChange);
    }
);

const goods = computed(() => shopService.listGoods(props.sceneId));
const ownedWeapons = computed(() => weaponService.getOwned());

function itemName(refId: string): string {
    // 武器物品与 WeaponDef 同 id（items 表 category=weapon），名称统一查 items
    return ConfigRegistry.items()[refId]?.name ?? refId;
}

function buy(goodsId: string): void {
    shopService.buy(goodsId); // 失败码由置灰预防（UI-C5）
}

function upgrade(itemId: string): void {
    shopService.upgradeWeapon(itemId);
}
</script>

<template>
    <div class="shop">
        <div class="panel">
            <h2>商店 <span class="coins">◉ {{ coins }}</span></h2>
            <div class="list">
                <div v-for="g in goods" :key="g.goodsId" class="row" :class="{ dim: g.owned || !g.affordable }">
                    <span class="name">{{ itemName(g.refId) }}<i v-if="g.count > 1"> ×{{ g.count }}</i></span>
                    <span class="price">◉ {{ g.price }}</span>
                    <span v-if="g.owned" class="state">已拥有</span>
                    <span v-else-if="!g.affordable" class="state short">缺 {{ g.shortage }}</span>
                    <button v-else class="btn" @click="buy(g.goodsId)">购买</button>
                </div>
            </div>
            <h3>武器升级</h3>
            <div class="list">
                <div v-for="w in ownedWeapons" :key="w.itemId" class="row">
                    <span class="name">{{ w.itemId }} Lv{{ w.level }}</span>
                    <span v-if="w.level >= 5" class="state">已满级</span>
                    <button v-else class="btn" @click="upgrade(w.itemId)">
                        升级 ◉{{ Math.round(60 * w.level ** 1.5) }} + {{ w.level }}残片
                    </button>
                </div>
            </div>
            <button class="btn close" @click="emit('close')">关闭</button>
        </div>
    </div>
</template>

<style scoped>
.shop { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(26,28,44,0.88); }
.panel { background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px; padding: 20px 32px; color: var(--fg); width: 460px; max-height: 80vh; overflow: auto; }
h2 { margin: 0 0 12px; font-size: 22px; }
h3 { margin: 14px 0 8px; font-size: 17px; color: var(--muted); }
.coins { color: var(--gold); font-size: 16px; margin-left: 10px; }
.list { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; background: var(--surface); border-radius: 6px; }
.row.dim { opacity: 0.55; }
.name { flex: 1; font-size: 15px; }
.name i { color: var(--muted); font-style: normal; }
.price { color: var(--gold); font-size: 14px; }
.state { color: var(--muted); font-size: 13px; }
.state.short { color: var(--error); }
.btn { padding: 5px 14px; font-size: 13px; cursor: pointer; background: var(--surface-2); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; }
.btn:hover { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.close { margin-top: 14px; width: 100%; padding: 9px 0; font-size: 15px; }
</style>
