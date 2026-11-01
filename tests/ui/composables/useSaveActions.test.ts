import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onEvent, offEvent } from '../../../src/game/events';
import { saveSystem } from '../../../src/game/domain/persistence/saveSystem';
import { useSaveActions } from '../../../src/ui/composables/useSaveActions';
import { UI_TEXT } from '../../../src/ui/i18n';

const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[], unmounted: [] as (() => void)[] }));
vi.mock('vue', async (original) => ({
    ...await original<typeof import('vue')>(),
    onMounted: (fn: () => void) => hooks.mounted.push(fn),
    onUnmounted: (fn: () => void) => hooks.unmounted.push(fn)
}));
vi.mock('../../../src/game/events', () => ({ onEvent: vi.fn(), offEvent: vi.fn() }));
vi.mock('../../../src/game/domain/persistence/saveSystem', () => ({ saveSystem: {
    getSummary: vi.fn(), write: vi.fn(), retryWrite: vi.fn(), exportJson: vi.fn()
} }));

function setup() {
    const refresh = vi.fn();
    const quit = vi.fn();
    const actions = useSaveActions({ onRefresh: refresh, onQuit: quit });
    hooks.mounted.forEach((fn) => fn());
    const written = vi.mocked(onEvent).mock.calls.find(([name]) => name === 'save:written')![1];
    const failed = vi.mocked(onEvent).mock.calls.find(([name]) => name === 'save:failed')![1];
    return { actions, refresh, quit,
        written: () => written({ slot: 0, at: '' } as never),
        failed: (reason: 'QUOTA' | 'UNAVAILABLE') => failed({ slot: 0, reason } as never) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    hooks.mounted.length = 0;
    hooks.unmounted.length = 0;
    vi.mocked(saveSystem.getSummary).mockReturnValue(null);
});
afterEach(() => { hooks.unmounted.forEach((fn) => fn()); vi.useRealTimers(); });

describe('存档 UI 操作', () => {
    it('自动保存静默且不延长手动提示的四秒显示时间', () => {
        const { actions, written } = setup();
        written();
        expect(actions.saveNotice.value).toBe('');
        actions.onSaveImported();
        vi.advanceTimersByTime(3000);
        written();
        expect(actions.saveNotice.value).toBe(UI_TEXT.save.imported);
        vi.advanceTimersByTime(1000);
        expect(actions.saveNotice.value).toBe('');
    });

    it('失败持续显示并替换手动提示，成功写入清除失败状态', () => {
        const { actions, written, failed } = setup();
        actions.onSaveImported();
        failed('QUOTA');
        vi.advanceTimersByTime(10000);
        expect(actions.saveFailed.value).toBe(true);
        expect(actions.saveNotice.value).toBe(UI_TEXT.save.failedQuota);
        failed('UNAVAILABLE');
        expect(actions.saveNotice.value).toBe(UI_TEXT.save.failedUnavailable);
        written();
        expect(actions.saveFailed.value).toBe(false);
        expect(actions.saveNotice.value).toBe('');
    });

    it('初始化保留启动读档结果，导入和管理入口刷新摘要及胜利状态', () => {
        const { actions, refresh } = setup();
        actions.initializeSave(true);
        expect(actions.hasSave.value).toBe(true);
        expect(actions.saveSummary.value).toBeNull();
        const summary = { savedAt: 'today', levelId: '1-1', checkpointId: null, playTimeSec: 3 };
        vi.mocked(saveSystem.getSummary).mockReturnValue(summary);
        actions.onSaveImported();
        expect(actions.hasSave.value).toBe(true);
        expect(actions.saveSummary.value).toEqual(summary);
        actions.showSaveManager();
        expect(actions.saveManagerOpen.value).toBe(true);
        expect(refresh).toHaveBeenCalledTimes(3);
    });

    it('失败保存不会退出，成功后才执行导航，重试与导出调用既有服务', () => {
        const { actions, quit } = setup();
        vi.mocked(saveSystem.write).mockReturnValue({ ok: false, code: 'QUOTA', message: '测试写入失败' });
        actions.saveAndQuit();
        expect(quit).not.toHaveBeenCalled();
        vi.mocked(saveSystem.write).mockReturnValue({ ok: true, value: undefined });
        actions.saveAndQuit();
        expect(quit).toHaveBeenCalledOnce();
        expect(actions.saveNotice.value).toBe(UI_TEXT.save.written);
        vi.mocked(saveSystem.retryWrite).mockReturnValue({ ok: true, value: undefined });
        actions.retrySave();
        expect(saveSystem.retryWrite).toHaveBeenCalledOnce();
        actions.exportSave();
        expect(saveSystem.exportJson).toHaveBeenCalledOnce();
    });

    it('重试失败不冒成功提示，重试成功先处理同步写入通知再显示手动确认', () => {
        const { actions, failed, written } = setup();
        failed('QUOTA');
        vi.mocked(saveSystem.retryWrite).mockReturnValue({ ok: false, code: 'QUOTA', message: '测试写入失败' });
        actions.retrySave();
        expect(actions.saveNotice.value).toBe(UI_TEXT.save.failedQuota);
        expect(vi.getTimerCount()).toBe(0);
        vi.mocked(saveSystem.retryWrite).mockImplementation(() => {
            written();
            return { ok: true, value: undefined };
        });
        actions.retrySave();
        expect(actions.saveFailed.value).toBe(false);
        expect(actions.saveNotice.value).toBe(UI_TEXT.save.written);
        vi.advanceTimersByTime(4000);
        expect(actions.saveNotice.value).toBe('');
    });

    it('卸载成对解绑监听并取消提示计时器', () => {
        const { actions } = setup();
        actions.onSaveImported();
        expect(vi.getTimerCount()).toBe(1);
        hooks.unmounted.forEach((fn) => fn());
        expect(vi.getTimerCount()).toBe(0);
        for (const [name, listener] of vi.mocked(onEvent).mock.calls) {
            expect(offEvent).toHaveBeenCalledWith(name, listener);
        }
    });
});
