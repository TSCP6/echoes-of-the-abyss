<script setup lang="ts">
/** UI-05b 结算（MOD-29）：用时/击杀/碎片/金币/新纪录（FR-15 规则 4 / FR-19 规则 3）。
 *  载荷由 UiLayer 经 prop 传入（事件先于组件挂载发射，订阅会错过，故走状态机持有）；
 *  新纪录标记读 RecordStore.getLastSubmit()（DD-15：IF-E06 载荷 + submitResult 返回）。 */
import { computed } from 'vue';
import { progressService } from '../../game/domain/progression/progressService';
import { recordStore } from '../../game/domain/progression/recordStore';
import type { EventPayloads } from '../../game/events';
import { UI_TEXT } from '../i18n';

const props = defineProps<{ data: EventPayloads['level:cleared'] | null }>();
const emit = defineEmits<{ next: [levelId: string]; retry: [levelId: string]; levels: [] }>();

const nextLevelId = computed<string | null>(() => {
    if (props.data === null) { return null; }
    const order = progressService.getLevelViews();
    const idx = order.findIndex((v) => v.levelId === props.data?.levelId);
    const nxt = order[idx + 1];
    return nxt !== undefined && nxt.unlocked ? nxt.levelId : null;
});

const newRecord = computed(() => recordStore.getLastSubmit()?.newRecord ?? false);
</script>

<template>
    <div class="result">
        <div v-if="data" class="panel">
            <h2>{{ UI_TEXT.result.cleared }} {{ data.levelId }}</h2>
            <table>
                <tbody>
                    <tr><td>{{ UI_TEXT.result.time }}</td><td>{{ data.timeSec.toFixed(1) }} s</td></tr>
                    <tr><td>{{ UI_TEXT.result.kills }}</td><td>{{ data.kills }}</td></tr>
                    <tr><td>{{ UI_TEXT.result.shards }}</td><td>{{ data.shards }} / 3</td></tr>
                    <tr><td>{{ UI_TEXT.result.earnedCoins }}</td><td>{{ data.earnedCoins ?? 0 }}</td></tr>
                    <tr><td>{{ UI_TEXT.result.firstClearCoins }}</td><td>{{ data.firstClearCoins ?? 0 }}</td></tr>
                    <tr><td>{{ UI_TEXT.result.lostCoins }}</td><td>{{ data.lostCoins ?? 0 }}</td></tr>
                    <tr><td>{{ UI_TEXT.result.coins }}</td><td>{{ data.coins }}</td></tr>
                    <tr v-if="newRecord"><td colspan="2" class="record">★ {{ UI_TEXT.result.newRecord }}</td></tr>
                </tbody>
            </table>
            <nav class="col">
                <button v-if="nextLevelId" class="btn" autofocus @click="emit('next', nextLevelId)">
                    {{ UI_TEXT.result.next }}
                </button>
                <button class="btn" @click="emit('retry', data.levelId)">{{ UI_TEXT.result.retry }}</button>
                <button class="btn" @click="emit('levels')">{{ UI_TEXT.result.back }}</button>
            </nav>
        </div>
    </div>
</template>

<style scoped>
.result {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(26, 28, 44, 0.88);
}
.panel {
    background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px;
    padding: 28px 48px; color: var(--fg); text-align: center;
}
h2 { margin: 0 0 16px; }
table { margin: 0 auto 20px; border-collapse: collapse; }
td { padding: 6px 18px; font-size: 17px; }
td:first-child { color: var(--muted); text-align: right; }
.record { color: var(--gold); text-align: center; font-weight: bold; }
.col { display: flex; flex-direction: column; gap: 10px; }
.btn {
    padding: 11px 0; font-size: 16px; cursor: pointer;
    background: var(--surface); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.btn:hover { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
