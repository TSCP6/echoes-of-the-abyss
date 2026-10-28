<script setup lang="ts">
/** UI-01 主菜单（MOD-26）：六入口（FR-15 规则 1）；"继续游戏"无存档置灰（FR-13 规则 7）。 */
import { computed } from 'vue';
import { UI_TEXT } from './i18n';
import { appLifecycle } from '../game/adapters/appLifecycle';

// EX-04 / NFR-06：Canvas 回退时主菜单提示兼容模式（帧率目标 30 FPS）
const compat = computed(() => appLifecycle.compatMode);

defineProps<{ hasSave: boolean }>();
const emit = defineEmits<{
    start: []; continue: []; levels: []; settings: []; help: []; records: []; saves: [];
}>();
</script>

<template>
    <div class="menu">
        <h1>{{ UI_TEXT.title }}</h1>
        <p class="sub">{{ UI_TEXT.subtitle }}</p>
        <p v-if="compat" class="warn">当前以兼容模式运行，帧率目标 30 FPS（WebGL 不可用）</p>
        <nav class="col">
            <button class="btn" autofocus @click="emit('start')">{{ UI_TEXT.menu.start }}</button>
            <button class="btn" :disabled="!hasSave" @click="emit('continue')">
                {{ UI_TEXT.menu.continue }}
            </button>
            <button class="btn" @click="emit('levels')">{{ UI_TEXT.menu.levelSelect }}</button>
            <button class="btn" @click="emit('settings')">{{ UI_TEXT.menu.settings }}</button>
            <button class="btn" @click="emit('help')">{{ UI_TEXT.menu.help }}</button>
            <button class="btn" @click="emit('records')">{{ UI_TEXT.menu.records }}</button>
            <button class="btn" @click="emit('saves')">{{ UI_TEXT.menu.saves }}</button>
        </nav>
    </div>
</template>

<style scoped>
.menu {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    gap: 8px; background: rgba(26, 28, 44, 0.88); color: var(--fg);
}
.menu > * { flex-shrink: 0; }
h1 { font-size: clamp(32px, 7vw, 56px); margin: auto 0 0; letter-spacing: clamp(2px, 1vw, 8px); }
.sub { color: var(--muted); margin: 0 0 24px; }
.warn { color: var(--warning); font-size: 14px; margin: 0 0 8px; }
.col { display: flex; flex-direction: column; gap: 12px; width: min(280px, 100%); margin-bottom: auto; }
.btn {
    padding: 12px 0; font-size: 18px; cursor: pointer;
    background: var(--surface-2); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
@media (max-height: 520px) {
    h1 { font-size: 36px; }
    .sub { margin-bottom: 12px; }
    .col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; width: min(440px, 100%); }
    .btn { padding: 8px 0; font-size: 16px; }
}
@media (max-height: 360px) {
    h1 { font-size: 28px; }
    .sub { margin-bottom: 8px; font-size: 14px; }
    .btn { padding: 6px 0; font-size: 14px; }
}
</style>
