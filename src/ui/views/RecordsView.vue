<script setup lang="ts">
/** UI-10 最佳榜（MOD-34）：12 关按场景分组 + 全局统计 + 占位文本（FR-19 规则 2/4 / AT-65）。 */
import { computed } from 'vue';
import { recordStore } from '../../game/domain/progression/recordStore';
import { ConfigRegistry } from '../../game/domain/shared/configRegistry';
import { UI_TEXT } from '../i18n';

const emit = defineEmits<{ close: [] }>();

const rows = computed(() => ConfigRegistry.levels().map((def) => ({
    id: def.id,
    scene: def.sceneId,
    rec: recordStore.getLevelRecord(def.id)
})));
const stats = computed(() => recordStore.getGlobalStats());
const scenes = computed(() => [1, 2, 3].map((sid) => ({
    sid,
    name: UI_TEXT.levelSelect.sceneNames[sid - 1],
    rows: rows.value.filter((r) => r.scene === sid)
})));
</script>

<template>
    <div class="records">
        <div class="panel">
            <h2>本地最佳榜</h2>
            <div v-for="sc in scenes" :key="sc.sid" class="group">
                <h3>{{ sc.name }}</h3>
                <table>
                    <tbody>
                        <tr v-for="r in sc.rows" :key="r.id">
                            <td class="id">{{ r.id }}</td>
                            <td class="time">{{ r.rec.bestTimeSec === null ? '—' : r.rec.bestTimeSec.toFixed(1) + ' s' }}</td>
                            <td class="shards">{{ r.rec.bestShards }} / 3</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="stats">
                死亡 {{ stats.totalDeaths }} ｜ 击杀 {{ stats.totalKills }} ｜
                时长 {{ Math.round(stats.totalPlaySec / 60) }} min ｜ 碎片 {{ stats.shardsTotal }} / 36
            </p>
            <button class="btn" @click="emit('close')">返回</button>
        </div>
    </div>
</template>

<style scoped>
.records { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(26,28,44,0.92); overflow: auto; }
.panel { background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px; padding: 20px 36px; color: var(--fg); text-align: center; }
h2 { margin: 0 0 12px; }
.group { margin-bottom: 10px; }
h3 { margin: 4px 0; font-size: 15px; color: var(--muted); }
table { margin: 0 auto; border-collapse: collapse; }
td { padding: 3px 14px; font-size: 14px; }
.id { color: var(--accent); text-align: left; }
.time { min-width: 70px; }
.shards { color: var(--gold); }
.stats { color: var(--muted); font-size: 14px; margin: 10px 0; }
.btn { padding: 8px 28px; font-size: 14px; cursor: pointer; background: var(--surface); color: var(--fg); border: 2px solid var(--border); border-radius: 6px; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
