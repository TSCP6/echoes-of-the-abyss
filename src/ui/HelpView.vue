<script setup lang="ts">
/** UI-13 操作说明：完整按键表（SRS 3.1），FR-15/FR-18 边界（重映射裁剪时仍完整可见）。 */
import { UI_TEXT } from './i18n';

defineEmits<{ back: [] }>();
</script>

<template>
    <div class="help">
        <div class="panel">
            <h2>{{ UI_TEXT.help.title }}</h2>
            <table>
                <tbody>
                    <tr v-for="[action, keys] in UI_TEXT.help.rows" :key="action">
                        <td class="action">{{ action }}</td>
                        <td class="keys">{{ keys }}</td>
                    </tr>
                </tbody>
            </table>
            <button class="btn" autofocus @click="$emit('back')">{{ UI_TEXT.help.back }}</button>
        </div>
    </div>
</template>

<style scoped>
.help {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(26, 28, 44, 0.9);
}
.panel {
    background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px;
    padding: 24px 40px; color: var(--fg); text-align: center;
}
h2 { margin: 0 0 16px; }
table { margin: 0 auto 20px; border-collapse: collapse; }
td { padding: 5px 16px; font-size: 15px; }
.action { color: var(--muted); text-align: right; }
.keys { font-family: Consolas, monospace; color: var(--accent); }
.btn {
    padding: 10px 32px; font-size: 16px; cursor: pointer;
    background: var(--surface); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
