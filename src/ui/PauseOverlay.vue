<script setup lang="ts">
/** UI-04 暂停（MOD-28）：五入口（FR-15 规则 3）。"放弃本关"不写存档。 */
import { UI_TEXT } from './i18n';

const emit = defineEmits<{ resume: []; help: []; settings: []; abandon: [] }>();
</script>

<template>
    <div class="pause">
        <div class="panel">
            <h2>{{ UI_TEXT.pause.title }}</h2>
            <nav class="col">
                <button class="btn" autofocus @click="emit('resume')">{{ UI_TEXT.pause.resume }}</button>
                <button class="btn" @click="emit('settings')">{{ UI_TEXT.pause.settings }}</button>
                <button class="btn" @click="emit('help')">{{ UI_TEXT.pause.help }}</button>
                <button class="btn danger" @click="emit('abandon')">
                    {{ UI_TEXT.pause.abandon }}
                    <span class="hint">{{ UI_TEXT.pause.abandonHint }}</span>
                </button>
            </nav>
        </div>
    </div>
</template>

<style scoped>
.pause {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(26, 28, 44, 0.85);
}
.panel {
    background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px;
    padding: 28px 40px; color: var(--fg); text-align: center;
}
h2 { margin: 0 0 20px; }
.col { display: flex; flex-direction: column; gap: 12px; width: 240px; }
.btn {
    padding: 12px 0; font-size: 17px; cursor: pointer;
    background: var(--surface); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.btn:hover { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn.danger:hover { border-color: var(--error); }
.hint { display: block; font-size: 12px; color: var(--muted); margin-top: 4px; }
</style>
