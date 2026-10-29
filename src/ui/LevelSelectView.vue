<script setup lang="ts">
/** UI-02 关卡选择（MOD-27）：三章紧凑路线节点；未解锁不响应（FR-12 规则 3 / AT-41）；
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
        <div class="heading">
            <h2>{{ UI_TEXT.levelSelect.title }}</h2>
            <button class="rules-trigger" aria-describedby="replay-rules">重玩规则 ⓘ
                <span id="replay-rules" class="rules-tooltip" role="tooltip">{{ UI_TEXT.levelSelect.replayHint }}</span>
            </button>
        </div>
        <div v-for="sc in scenes" :key="sc.sid" class="scene-row" :class="`chapter-${sc.sid}`">
            <h3>{{ sc.name }}
                <button v-if="campUnlocked(sc.sid)" class="btn camp"
                    @click="emit('camp', sc.sid as 1 | 2 | 3)">{{ UI_TEXT.levelSelect.camp }}</button>
            </h3>
            <div class="nodes">
                <button v-for="lv in sc.levels" :key="lv.levelId" class="node"
                    :class="{ locked: !lv.unlocked, cleared: lv.cleared, boss: lv.levelId.endsWith('-4') }"
                    :disabled="!lv.unlocked"
                    :aria-label="lv.unlocked ? lv.levelId : `${lv.levelId} ${UI_TEXT.levelSelect.locked}`"
                    :aria-describedby="lv.unlocked ? `replay-${lv.levelId}` : undefined"
                    :title="lv.unlocked ? undefined : UI_TEXT.levelSelect.locked"
                    @click="emit('enter', lv.levelId)">
                    <span class="node-heading">
                        <span class="id">{{ lv.levelId }}</span>
                        <span v-if="lv.cleared" class="mark" aria-hidden="true">✓</span>
                    </span>
                    <span v-if="!lv.unlocked" class="lock-icon" aria-hidden="true"></span>
                    <span v-if="lv.levelId.endsWith('-4')" class="boss-symbol" aria-hidden="true">◆</span>
                    <span v-if="lv.unlocked" :id="`replay-${lv.levelId}`" class="replay-details" role="tooltip">
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
.heading { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; max-width: 440px; margin-bottom: 8px; }
.rules-trigger { border: 0; padding: 6px 0; color: var(--muted); background: transparent; font-size: 14px; cursor: help; }
.rules-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rules-tooltip {
    display: none; position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
    box-sizing: border-box; width: min(520px, calc(100vw - 48px)); padding: 12px; z-index: 3;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0,0,0,.35); line-height: 1.6; text-align: left;
}
.rules-trigger:hover .rules-tooltip, .rules-trigger:focus-visible .rules-tooltip { display: block; }
.scene-row { --chapter-accent: var(--accent); width: 100%; max-width: 440px; text-align: left; }
.chapter-2 { --chapter-accent: var(--sp); }
.chapter-3 { --chapter-accent: var(--gold); }
.scene-row + .scene-row { padding-top: 12px; border-top: 1px solid var(--border); }
h3 { color: var(--muted); margin: 0 0 12px; min-height: 28px; padding-left: 10px; border-left: 2px solid var(--chapter-accent); font-size: 15px; font-weight: 500; display: flex; gap: 10px; align-items: center; justify-content: space-between; }
.nodes { position: relative; width: 100%; max-width: 352px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, minmax(44px, 64px)); justify-content: space-between; gap: 12px; }
.nodes::before { content: ''; position: absolute; top: 50%; left: 32px; right: 32px; height: 1px; background: var(--border); pointer-events: none; }
.node {
    position: relative; box-sizing: border-box; min-width: 44px; height: 48px; padding: 6px; font-size: 16px; cursor: pointer;
    background: var(--surface); color: var(--fg);
    border: 1px solid var(--border); border-radius: 4px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.node:not(.locked):not(.cleared) { border-color: var(--chapter-accent); box-shadow: inset 0 -2px var(--chapter-accent); }
.node:hover:not(:disabled), .node:focus-visible { z-index: 3; border-color: var(--chapter-accent); background: var(--surface-2); }
.node:focus-visible { outline: 2px solid var(--chapter-accent); outline-offset: 3px; }
.node.locked { color: var(--muted); cursor: not-allowed; border-style: dashed; }
.node.cleared { color: var(--chapter-accent); }
.node.boss { border-radius: 2px; }
.node-heading { display: flex; gap: 6px; align-items: center; }
.lock-icon { position: absolute; top: 7px; right: 5px; width: 5px; height: 4px; border: 1px solid currentColor; border-radius: 1px; }
.lock-icon::before { content: ''; position: absolute; left: 0; bottom: 100%; width: 3px; height: 3px; border: 1px solid currentColor; border-bottom: 0; border-radius: 3px 3px 0 0; }
.boss-symbol { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); padding: 0 4px; background: var(--surface); color: var(--chapter-accent); font-size: 10px; line-height: 14px; }
.node.locked .boss-symbol { color: var(--muted); }
.replay-details {
    display: none; position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%); box-sizing: border-box; width: 232px;
    flex-direction: column; gap: 4px; padding: 10px 8px; z-index: 2;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0,0,0,.35); color: var(--muted); font-size: 14px; line-height: 1.4;
}
.node:first-child .replay-details { left: 0; transform: none; }
.node:last-child .replay-details { left: auto; right: 0; transform: none; }
.node:hover:not(:disabled) .replay-details, .node:focus-visible .replay-details { display: flex; }
.coin-rate { color: var(--gold); }
.mark { position: absolute; right: -5px; bottom: -5px; width: 16px; height: 16px; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); color: var(--chapter-accent); font-size: 12px; line-height: 16px; }
.btn { padding: 6px 16px; font-size: 14px; cursor: pointer; background: var(--surface-2); color: var(--fg); border: 2px solid var(--border); border-radius: 6px; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn.camp { padding: 4px 10px; border-width: 1px; background: transparent; color: var(--gold); }
.back { margin-top: 8px; padding: 10px 24px; font-size: 16px; }
@media (max-width: 480px) {
    .heading { gap: 8px; }
    h2 { font-size: 22px; }
}
</style>
