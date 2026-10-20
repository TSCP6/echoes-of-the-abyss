/**
 * MOD-39 FullscreenAdapter（IF-X03，封装 Fullscreen API）。
 * toggle 必须在用户手势内发起（SettingsPanel 按钮）；同步返回意图状态，
 * Promise 拒绝（浏览器策略）经 onRejected 回调异步上报 'FULLSCREEN_REJECTED'，
 * UI 提示"请按 F11 手动全屏"并恢复开关状态（FR-18 边界）。
 * fullscreenchange 订阅 → SettingsStore.setFullscreen 同步（不跨会话恢复，浏览器策略）。
 */
import type { Result } from '../domain/result';
import { ok, fail } from '../domain/result';
import { settingsStore } from '../domain/settingsStore';

class FullscreenAdapterImpl {
    private listening = false;
    private rejectCb: ((r: { ok: false; code: 'FULLSCREEN_REJECTED'; message: string }) => void) | null = null;

    /** 安装 fullscreenchange 监听（AppLifecycle 调用一次） */
    install(): void {
        if (this.listening) { return; }
        this.listening = true;
        document.addEventListener('fullscreenchange', () => {
            settingsStore.setFullscreen(document.fullscreenElement !== null);
        });
    }

    /** 注册拒绝回调（SettingsPanel：提示 + 恢复开关状态） */
    onRejected(cb: (r: { ok: false; code: 'FULLSCREEN_REJECTED'; message: string }) => void): void {
        this.rejectCb = cb;
    }

    isFullscreen(): boolean { return document.fullscreenElement !== null; }

    /** 用户手势内调用；返回切换意图状态（拒绝异步经 onRejected） */
    toggle(): Result<boolean, 'FULLSCREEN_REJECTED'> {
        if (typeof document === 'undefined' || document.documentElement.requestFullscreen === undefined) {
            const r = fail('FULLSCREEN_REJECTED', '当前环境不支持 Fullscreen API，请按 F11 手动全屏');
            this.rejectCb?.(r);
            return r;
        }
        if (document.fullscreenElement !== null) {
            document.exitFullscreen().catch(() => {
                this.rejectCb?.(fail('FULLSCREEN_REJECTED', '退出全屏失败，请按 F11 手动切换'));
            });
            return ok(false);
        }
        document.documentElement.requestFullscreen().catch(() => {
            this.rejectCb?.(fail('FULLSCREEN_REJECTED', '浏览器拒绝全屏请求，请按 F11 手动全屏'));
        });
        return ok(true);
    }
}

export const fullscreenAdapter = new FullscreenAdapterImpl();
