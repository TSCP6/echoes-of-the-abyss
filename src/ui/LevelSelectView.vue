<script setup lang="ts">
/** UI-02 关卡选择（MOD-27）：12 关节点按场景分页；未解锁锁形不响应（FR-12 规则 3 / AT-41）；
 *  场景营地入口（FR-10 规则 1：场景解锁即可进营地）。 */
import { computed } from 'vue';
import { progressService } from '../game/domain/progressService';
import { useDomainStore } from './useDomainStore';
import { UI_TEXT } from './i18n';
import { onEvent, offEvent } from '../game/events';

const emit = defineEmits<{ enter: [levelId: string]; back: []; camp: [sceneId: 1 | 2 | 3] }>();

const views = useDomainStore(
    () => progressService.getLevelViews(),
    (onChange) => {
        onEvent('level:cleared', onChange);
        return () => offEvent('level:cleared', onChange);
    }
);

const scenes = computed(() => [1, 2, 3].map((sid) => ({
    sid,
    name: UI_TEXT.levelSelect.sceneNames[sid - 1],
    levels: views.value.filter((v) => v.levelId.startsWith(`${sid}-`))
})));

/** 场景营地解锁 = 该场景首关已解锁（FR-12 规则 2 的营地侧投影） */
const campUnlocked = (sid: number): boolean =>
    views.value.some((v) => v.levelId === `${sid}-1` && v.unlocked);
</script>

<template>
    <div class="select">
        <h2>{{ UI_TEXT.levelSelect.title }}</h2>
        <p class="replay-hint">{{ UI_TEXT.levelSelect.replayHint }}</p>
        <div v-for="sc in scenes" :key="sc.sid" class="scene-row">
            <h3>{{ sc.name }}
                <button v-if="campUnlocked(sc.sid)" class="btn camp"
                    @click="emit('camp', sc.sid as 1 | 2 | 3)">{{ UI_TEXT.levelSelect.camp }}</button>
            </h3>
            <div class="nodes">
                <button v-for="lv in sc.levels" :key="lv.levelId" class="node"
                    :class="{ locked: !lv.unlocked, cleared: lv.cleared }"
                    :disabled="!lv.unlocked"
                    :aria-label="lv.unlocked ? lv.levelId : `${lv.levelId} ${UI_TEXT.levelSelect.locked}`"
                    :aria-describedby="lv.unlocked ? `replay-${lv.levelId}` : undefined"
                    :title="lv.unlocked ? lv.levelId : UI_TEXT.levelSelect.locked"
                    @click="emit('enter', lv.levelId)">
                    <span class="node-heading">
                        <span class="id">{{ lv.unlocked ? lv.levelId : '🔒' }}</span>
                        <span v-if="lv.cleared" class="mark" aria-hidden="true">✓</span>
                    </span>
                    <span v-if="lv.unlocked" :id="`replay-${lv.levelId}`" class="replay-details">
                        <span>{{ UI_TEXT.levelSelect.clearCount(lv.clearCount) }} · {{ UI_TEXT.levelSelect.replayTier(lv.replayTier) }}</span>
                        <span class="coin-rate">{{ UI_TEXT.levelSelect.coinPercent(lv.coinPercent) }}</span>
                        <span>{{ UI_TEXT.levelSelect.enemyHpPercent(lv.enemyHpPercent) }}</span>
                    </span>
                </button>
            </div>
        </div>
        <button class="btn back" @click="emit('back')">{{ UI_TEXT.levelSelect.back }}</button>
    </div>
</template>

<style scoped>
.select {
    position: absolute; inset: 0; overflow: auto;
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    box-sizing: border-box; padding: 24px 20px; background: rgba(26, 28, 44, 0.92); color: var(--fg);
}
h2 { margin: 0; }
.replay-hint { max-width: 800px; margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; text-align: center; }
.scene-row { width: 100%; max-width: 800px; text-align: center; }
h3 { color: var(--muted); margin: 4px 0 8px; font-size: 16px; display: flex; gap: 10px; align-items: center; justify-content: center; }
.nodes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.node {
    min-height: 116px; padding: 10px 4px; font-size: 18px; cursor: pointer;
    background: var(--surface-2); color: var(--fg);
    border: 2px solid var(--border); border-radius: 8px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.node:hover:not(:disabled) { border-color: var(--accent); }
.node:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.node.locked { opacity: 0.4; cursor: not-allowed; }
.node.cleared { border-color: var(--accent); }
.node-heading { display: flex; gap: 6px; align-items: center; }
.replay-details { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; color: var(--muted); font-size: 14px; line-height: 1.4; }
.coin-rate { color: var(--gold); }
.mark { color: var(--accent); font-size: 14px; }
.btn { padding: 6px 16px; font-size: 14px; cursor: pointer; background: var(--surface-2); color: var(--fg); border: 2px solid var(--border); border-radius: 6px; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn.camp { border-color: var(--gold); color: var(--gold); }
.back { margin-top: 8px; padding: 10px 24px; font-size: 16px; }
@media (max-width: 600px) {
    .nodes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
