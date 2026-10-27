<script setup lang="ts">
/**
 * UI-06 背包（MOD-30）：5×4 网格、悬停浮层（名称/类别/效果/数量/售价，FR-08 规则 4）、
 * 左键使用消耗品、右键装备武器（主/副手）、丢弃二次确认、整理（FR-08 规则 8 / AT-30）。
 * 数据经 useDomainStore 订阅 inventory:changed（IF-E07）。
 */
import { ref } from 'vue';
import { inventoryStore } from '../game/domain/inventoryStore';
import { useDomainStore } from './useDomainStore';
import { onEvent, offEvent } from '../game/events';
import { UI_TEXT } from './i18n';

const emit = defineEmits<{ close: [] }>();

const snap = useDomainStore(
    () => inventoryStore.getSnapshot(),
    (onChange) => {
        onEvent('inventory:changed', onChange);
        return () => offEvent('inventory:changed', onChange);
    }
);

const hoverSlot = ref<number | null>(null);
const confirmDrop = ref<number | null>(null);
const feedback = ref('');

const tooltip = (slot: number) => inventoryStore.getTooltip(slot);

function leftClick(slot: number): void {
    const entry = snap.value.slots[slot];
    if (entry === null) { return; }
    const r = inventoryStore.useItem(slot);
    if (r.ok && 'throwMode' in r.value) {
        feedback.value = UI_TEXT.inventory.ammoHint;
    } else {
        feedback.value = '';
    }
}

function rightClick(slot: number, hand: 'main' | 'sub'): void {
    inventoryStore.equip(slot, hand);
}

function drop(slot: number): void {
    if (confirmDrop.value === slot) {
        inventoryStore.dropItem(slot);
        confirmDrop.value = null;
    } else {
        confirmDrop.value = slot; // 二次确认（FR-08 规则 7）
    }
}
</script>

<template>
    <div class="inv">
        <div class="panel">
            <h2>背包</h2>
            <div class="grid">
                <div v-for="(slot, i) in snap.slots" :key="i" class="cell"
                    :class="{ equipped: slot !== null && (snap.equipped.main === slot.itemId || snap.equipped.sub === slot.itemId) }"
                    @mouseenter="hoverSlot = i" @mouseleave="hoverSlot = null"
                    @click="leftClick(i)" @contextmenu.prevent="rightClick(i, 'main')"
                    @dblclick="rightClick(i, 'sub')">
                    <span v-if="slot" class="icon" :class="{ material: slot.itemId.includes('shard') }">{{ slot.itemId.startsWith('wpn_') ? '⚔' : slot.itemId.includes('potion') ? '🧪' : slot.itemId.includes('shard') ? '◆' : '➶' }}</span>
                    <span v-if="slot && slot.count > 1" class="count">{{ slot.count }}</span>
                    <button v-if="slot" class="drop" @click.stop="drop(i)">
                        {{ confirmDrop === i ? '确认?' : '×' }}
                    </button>
                </div>
            </div>
            <div class="tip-space">
                <div v-if="hoverSlot !== null && tooltip(hoverSlot)" class="tip">
                    <b>{{ tooltip(hoverSlot)?.name }}</b>
                    <span class="cat">{{ tooltip(hoverSlot)?.category }}</span>
                    <p>{{ tooltip(hoverSlot)?.description }}</p>
                </div>
            </div>
            <nav class="foot">
                <button class="btn" @click="inventoryStore.sort()">整理</button>
                <button class="btn" @click="emit('close')">关闭（Tab）</button>
            </nav>
            <p class="hint">{{ UI_TEXT.inventory.controls }}</p>
            <p class="hint">{{ UI_TEXT.inventory.ammoNote }}</p>
            <p class="feedback" role="status">{{ feedback }}</p>
        </div>
    </div>
</template>

<style scoped>
.inv {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(26, 28, 44, 0.85);
}
.panel {
    position: relative;
    background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px;
    padding: 20px 28px; color: var(--fg); text-align: center;
}
h2 { margin: 0 0 14px; font-size: 22px; }
.grid { display: grid; grid-template-columns: repeat(5, 56px); gap: 8px; }
.cell {
    position: relative; width: 56px; height: 56px;
    background: var(--surface); border: 2px solid var(--border); border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; cursor: pointer;
}
.cell:hover { border-color: var(--accent); }
.cell.equipped { border-color: var(--gold); }
.count { position: absolute; right: 3px; bottom: 1px; font-size: 14px; color: var(--muted); }
.drop {
    position: absolute; top: 1px; right: 2px;
    background: none; border: none; color: var(--error); cursor: pointer; font-size: 14px;
}
.tip {
    margin-top: 12px; max-width: 100%; box-sizing: border-box;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    padding: 10px; text-align: left; font-size: 14px;
}
.tip-space { height: 105px; max-width: 320px; }
.tip { max-height: 100%; overflow-y: auto; }
.material { color: #c5a4ff; }
.feedback { min-height: 42px; max-width: 320px; font-size: 14px; color: var(--warning); margin: 8px 0 0; }
.cat { color: var(--muted); margin-left: 8px; font-size: 14px; }
.tip p { margin: 6px 0 0; color: var(--muted); }
.meta { color: var(--gold) !important; }
.foot { display: flex; gap: 10px; justify-content: center; margin-top: 14px; }
.btn {
    padding: 8px 20px; font-size: 14px; cursor: pointer;
    background: var(--surface); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.btn:hover { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hint { color: var(--muted); font-size: 14px; margin: 10px 0 0; }
</style>
