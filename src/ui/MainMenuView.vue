<script setup lang="ts">
/** UI-01 主菜单（MOD-26）：六入口（FR-15 规则 1）；"继续游戏"无存档置灰（FR-13 规则 7）。 */
import { UI_TEXT } from './i18n';

defineProps<{ hasSave: boolean }>();
const emit = defineEmits<{
    start: []; continue: []; levels: []; settings: []; help: []; records: [];
}>();
</script>

<template>
    <div class="menu">
        <h1>{{ UI_TEXT.title }}</h1>
        <p class="sub">{{ UI_TEXT.subtitle }}</p>
        <nav class="col">
            <button class="btn" autofocus @click="emit('start')">{{ UI_TEXT.menu.start }}</button>
            <button class="btn" :disabled="!hasSave" @click="emit('continue')">
                {{ UI_TEXT.menu.continue }}
            </button>
            <button class="btn" @click="emit('levels')">{{ UI_TEXT.menu.levelSelect }}</button>
            <button class="btn" @click="emit('settings')">{{ UI_TEXT.menu.settings }}</button>
            <button class="btn" @click="emit('help')">{{ UI_TEXT.menu.help }}</button>
            <button class="btn" @click="emit('records')">{{ UI_TEXT.menu.records }}</button>
        </nav>
    </div>
</template>

<style scoped>
.menu {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; background: rgba(26, 28, 44, 0.88); color: var(--fg);
}
h1 { font-size: 56px; margin: 0; letter-spacing: 8px; }
.sub { color: var(--muted); margin: 0 0 24px; }
.col { display: flex; flex-direction: column; gap: 12px; width: 280px; }
.btn {
    padding: 12px 0; font-size: 18px; cursor: pointer;
    background: var(--surface-2); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
