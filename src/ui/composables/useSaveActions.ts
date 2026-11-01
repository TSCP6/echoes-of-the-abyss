import { onMounted, onUnmounted, ref } from 'vue';
import { saveSystem } from '../../game/domain/persistence/saveSystem';
import { onEvent, offEvent, type EventPayloads } from '../../game/events';
import { UI_TEXT } from '../i18n';

interface SaveActionOptions {
    /** 摘要刷新后同步根界面派生状态（如终章解锁）。 */
    onRefresh: () => void;
    /** 写入成功后执行场景导航；失败时保留当前暂停面板。 */
    onQuit: () => void;
}

/** 存档服务到界面的状态桥接；自动写入成功保持静默。 */
export function useSaveActions(options: SaveActionOptions) {
    const hasSave = ref(false);
    const saveManagerOpen = ref(false);
    const saveSummary = ref<ReturnType<typeof saveSystem.getSummary>>(null);
    const saveFailed = ref(false);
    const saveNotice = ref('');
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;

    function refreshSave(): void {
        saveSummary.value = saveSystem.getSummary();
        hasSave.value = saveSummary.value !== null;
        options.onRefresh();
    }

    /** 启动阶段仍以 AppBoot 的读档结果作为继续按钮依据。 */
    function initializeSave(saved: boolean): void {
        hasSave.value = saved;
        saveSummary.value = saveSystem.getSummary();
        options.onRefresh();
    }

    function showSaveManager(): void {
        refreshSave();
        saveManagerOpen.value = true;
    }

    function onSaveWritten(): void {
        refreshSave();
        if (saveFailed.value) {
            clearTimeout(noticeTimer);
            saveNotice.value = '';
        }
        saveFailed.value = false;
    }

    /** 成功提示仅用于用户明确发起的保存操作，自动存档不刷新计时。 */
    function showManualSaveNotice(message: string): void {
        saveNotice.value = message;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { saveNotice.value = ''; }, 4000);
    }

    function onSaveFailed(payload: EventPayloads['save:failed']): void {
        clearTimeout(noticeTimer);
        saveFailed.value = true;
        saveNotice.value = payload.reason === 'QUOTA' ? UI_TEXT.save.failedQuota : UI_TEXT.save.failedUnavailable;
    }

    function retrySave(): void {
        if (saveSystem.retryWrite().ok) { showManualSaveNotice(UI_TEXT.save.written); }
    }
    function exportSave(): void { saveSystem.exportJson(); }
    function onSaveImported(): void {
        refreshSave();
        showManualSaveNotice(UI_TEXT.save.imported);
    }

    function saveAndQuit(): void {
        if (!saveSystem.write().ok) { return; }
        showManualSaveNotice(UI_TEXT.save.written);
        options.onQuit();
    }

    onMounted(() => {
        onEvent('save:written', onSaveWritten);
        onEvent('save:failed', onSaveFailed);
    });
    onUnmounted(() => {
        clearTimeout(noticeTimer);
        offEvent('save:written', onSaveWritten);
        offEvent('save:failed', onSaveFailed);
    });

    return { hasSave, saveManagerOpen, saveSummary, saveFailed, saveNotice,
        initializeSave, showSaveManager, retrySave, exportSave, onSaveImported, saveAndQuit };
}
