<script setup lang="ts">
/** UI-11 教学提示（MOD-35）：屏幕下方 96 px 区域显示图标+文字（FR-17 规则 2/边界）。
 *  完成对应操作后 0.5 s 淡出；单条最长 8 s 超时淡出且不重复（FR-17 规则 3/4）。 */
import { ref, onMounted, onUnmounted } from 'vue';
import { onEvent, offEvent, type EventPayloads } from '../../game/events';
import { progressService } from '../../game/domain/progression/progressService';

const current = ref<{ hintId: string; text: string } | null>(null);
let timer: number | undefined;

const onHint = (p: EventPayloads['tutorial:hint']): void => {
    if ('done' in p) {
        window.setTimeout(() => { current.value = null; }, 500); // 完成后 0.5s 淡出
        return;
    }
    if (progressService.isTutorialDone()) { return; } // 已完成教学不再显示（FR-17 边界）
    current.value = { hintId: p.hintId, text: p.text };
    if (timer !== undefined) { window.clearTimeout(timer); }
    timer = window.setTimeout(() => { current.value = null; }, 8000); // 最长 8s
};

onMounted(() => onEvent('tutorial:hint', onHint));
onUnmounted(() => {
    offEvent('tutorial:hint', onHint);
    if (timer !== undefined) { window.clearTimeout(timer); }
});
</script>

<template>
    <Transition name="fade">
        <div v-if="current" class="hint">
            <span class="icon">▶</span> {{ current.text }}
        </div>
    </Transition>
</template>

<style scoped>
.hint {
    position: absolute; left: 50%; bottom: 128px; transform: translateX(-50%);
    box-sizing: border-box; width: max-content; max-width: calc(100% - 24px);
    background: rgba(26, 28, 44, 0.9); border: 2px solid var(--accent); border-radius: 8px;
    padding: 10px 26px; color: var(--fg); font-size: 17px;
    pointer-events: none;
}
.icon { color: var(--accent); margin-right: 8px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
