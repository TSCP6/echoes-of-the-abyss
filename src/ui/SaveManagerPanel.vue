<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { saveSystem } from '../game/domain/saveSystem';
import { syncSkpFromProgress } from '../game/domain/saveBootstrap';
import type { SaveData } from '../game/domain/saveSchema';
import { UI_TEXT } from './i18n';

defineProps<{
    allowImport: boolean;
    summary: ReturnType<typeof saveSystem.getSummary>;
    failed: boolean;
    notice: string;
}>();
const emit = defineEmits<{ close: []; imported: []; retry: []; export: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const candidate = ref<SaveData | null>(null);
const candidateText = ref('');
const importNotice = ref('');
const reading = ref(false);
let selection = 0;

function formatTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? UI_TEXT.save.unknownTime : date.toLocaleString('zh-CN');
}

function importError(code: string): string {
    if (code === 'SCHEMA_NEWER') { return UI_TEXT.save.newer; }
    if (code === 'MIGRATION_FAILED') { return UI_TEXT.save.migrationFailed; }
    if (code === 'QUOTA') { return UI_TEXT.save.failedQuota; }
    if (code === 'UNAVAILABLE') { return UI_TEXT.save.failedUnavailable; }
    return UI_TEXT.save.invalid;
}

async function selectFile(event: Event): Promise<void> {
    const currentSelection = ++selection;
    candidate.value = null;
    candidateText.value = '';
    importNotice.value = '';
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { return; }
    if (file.size > 2 * 1024 * 1024) { importNotice.value = UI_TEXT.save.invalid; input.value = ''; return; }
    reading.value = true;
    try {
        const text = await file.text();
        if (currentSelection !== selection) { return; }
        const inspected = saveSystem.inspectJson(text);
        if (!inspected.ok) { importNotice.value = importError(inspected.code); return; }
        candidate.value = inspected.value;
        candidateText.value = text;
    } catch {
        if (currentSelection === selection) { importNotice.value = UI_TEXT.save.readFailed; }
    } finally {
        if (currentSelection === selection) { reading.value = false; input.value = ''; }
    }
}

function replaceSave(): void {
    if (!candidate.value || reading.value) { return; }
    const imported = saveSystem.importJson(candidateText.value);
    if (!imported.ok) { importNotice.value = importError(imported.code); return; }
    syncSkpFromProgress();
    candidate.value = null;
    candidateText.value = '';
    importNotice.value = UI_TEXT.save.imported;
    emit('imported');
}

onMounted(() => { dialog.value?.showModal(); });
</script>

<template>
    <dialog ref="dialog" class="save-manager" aria-labelledby="save-manager-title" @cancel.prevent="emit('close')">
        <div class="panel">
            <h2 id="save-manager-title">{{ UI_TEXT.save.title }}</h2>
            <h3>{{ UI_TEXT.save.current }}</h3>
            <dl v-if="summary">
                <dt>{{ UI_TEXT.save.level }}</dt><dd>{{ summary.levelId ?? UI_TEXT.save.noLevel }}</dd>
                <dt>{{ UI_TEXT.save.checkpoint }}</dt><dd>{{ summary.checkpointId ?? UI_TEXT.save.spawn }}</dd>
                <dt>{{ UI_TEXT.save.savedAt }}</dt><dd>{{ formatTime(summary.savedAt) }}</dd>
                <dt>{{ UI_TEXT.save.playTime }}</dt><dd>{{ UI_TEXT.save.duration(summary.playTimeSec) }}</dd>
            </dl>
            <p v-else>{{ UI_TEXT.save.noSave }}</p>
            <p v-if="notice" :role="failed ? 'alert' : 'status'" :class="{ failure: failed }">{{ notice }}</p>
            <nav class="actions">
                <button class="btn" @click="emit('export')">{{ UI_TEXT.save.export }}</button>
                <button v-if="failed" class="btn" @click="emit('retry')">{{ UI_TEXT.save.retry }}</button>
            </nav>
            <section v-if="allowImport">
                <p>{{ UI_TEXT.save.importWarning }}</p>
                <label for="save-json">{{ UI_TEXT.save.select }}</label>
                <input id="save-json" type="file" accept=".json,application/json" :disabled="reading" @change="selectFile" />
                <template v-if="candidate">
                    <h3>{{ UI_TEXT.save.preview }}</h3>
                    <dl>
                        <dt>{{ UI_TEXT.save.level }}</dt><dd>{{ candidate.progress.currentLevelId ?? UI_TEXT.save.noLevel }}</dd>
                        <dt>{{ UI_TEXT.save.checkpoint }}</dt><dd>{{ candidate.progress.lastCheckpointId ?? UI_TEXT.save.spawn }}</dd>
                        <dt>{{ UI_TEXT.save.savedAt }}</dt><dd>{{ formatTime(candidate.savedAt) }}</dd>
                        <dt>{{ UI_TEXT.save.playTime }}</dt><dd>{{ UI_TEXT.save.duration(candidate.records.totalPlaySec) }}</dd>
                    </dl>
                    <button class="btn replace" @click="replaceSave">{{ UI_TEXT.save.replace }}</button>
                </template>
                <p v-if="importNotice" role="status">{{ importNotice }}</p>
            </section>
            <p v-else>{{ UI_TEXT.save.importMenuOnly }}</p>
            <button class="btn close" autofocus @click="emit('close')">{{ UI_TEXT.save.close }}</button>
        </div>
    </dialog>
</template>

<style scoped>
.save-manager { position: fixed; inset: 0; width: min(560px, calc(100% - 32px)); max-height: calc(100% - 32px); margin: auto; padding: 0; border: 2px solid var(--border); border-radius: 10px; color: var(--fg); background: var(--surface-2); }
.save-manager::backdrop { background: rgba(26, 28, 44, 0.85); }
.panel { padding: 24px; }
h2 { margin: 0 0 20px; }
h3 { font-size: 17px; }
p, label, input, dt, dd { font-size: 15px; line-height: 1.6; }
p, dd { overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px; }
dt { color: var(--muted); }
dd { margin: 0; }
label { display: block; margin-bottom: 8px; }
input { max-width: 100%; }
section { border-top: 1px solid var(--border); margin-top: 20px; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; }
.btn { padding: 10px 16px; font-size: 16px; background: var(--surface); color: var(--fg); border: 2px solid var(--border); border-radius: 6px; cursor: pointer; }
.btn:hover { border-color: var(--accent); }
.btn:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.replace { border-color: var(--warning); }
.failure { color: var(--warning); }
.close { width: 100%; margin-top: 20px; }
</style>
