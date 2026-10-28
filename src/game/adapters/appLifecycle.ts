/**
 * MOD-40 AppLifecycle（IF-X04 生命周期部分 + EXD-4 全局兜底）。
 * - EX-05：visibilitychange hidden → 暂停游戏循环与 BGM（game.loop.sleep + AudioAdapter.onVisibility），visible 恢复；
 * - EX-07：visibilitychange/blur → InputGateway 清零（blur 已由 InputGateway 自挂 game.events，此处补 visibility）；
 * - EX-04：webglcontextlost → 尝试 restore；失败 → 安全退出主菜单 + DOM 提示；Canvas 回退 → compatMode 标志（主菜单提示）；
 * - EX-06：resize 由 ScaleManager EXPAND + viewportLayout 处理，DOM HUD 同步锚定画布；
 * - EXD-4：window error / unhandledrejection / Vue errorHandler → console 记录 + 游戏健康则 gotoMenu + DOM 横幅；同错 1 分钟去重。
 */
import { sceneDirector } from '../systems/sceneDirector';
import { audioAdapter } from './audioAdapter';
import { fullscreenAdapter } from './fullscreenAdapter';
import { warnThrottled } from '../domain/warn';
import { CANVAS, WEBGL } from 'phaser';
import { saveSystem } from '../domain/saveSystem';

class AppLifecycleImpl {
    private game: Phaser.Game | null = null;
    private hidden = false;
    compatMode = false; // EX-04：Canvas 回退（主菜单"兼容模式"提示数据源）
    private banner: HTMLDivElement | null = null;

    install(game: Phaser.Game): void {
        this.game = game;
        fullscreenAdapter.install();
        this.compatMode = game.renderer.type === CANVAS;

        document.addEventListener('visibilitychange', () => {
            const hidden = document.visibilityState === 'hidden';
            if (hidden === this.hidden) { return; }
            this.hidden = hidden;
            audioAdapter.onVisibility(hidden, game);
            if (hidden) { saveSystem.flushPending(); game.loop.sleep(); } else { game.loop.wake(); }
        });
        window.addEventListener('pagehide', () => saveSystem.flushPending());
        let webglLost = false;
        game.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            webglLost = true;
            warnThrottled('webgl-lost', 'WebGL 上下文丢失，尝试恢复');
        });
        game.canvas.addEventListener('webglcontextrestored', () => {
            webglLost = false;
            warnThrottled('webgl-restored', 'WebGL 上下文已恢复');
        });
        // 丢失后 3 s 未恢复 → 安全退出主菜单（EX-04）
        window.setInterval(() => {
            if (webglLost && !this.contextAlive()) {
                webglLost = false;
                this.showBanner('渲染上下文不可用，已回到主菜单。可刷新页面重试。');
                sceneDirector.gotoMenu();
            }
        }, 3000);

        window.addEventListener('error', (e) => { this.reportError(e.error ?? e.message); });
        window.addEventListener('unhandledrejection', (e) => { this.reportError(String(e.reason)); });
    }

    private contextAlive(): boolean {
        const gl = this.game?.renderer as Phaser.Renderer.WebGL.WebGLRenderer | undefined;
        if (gl === undefined || gl.type !== WEBGL) { return true; }
        const ctx = (gl as unknown as { gl?: WebGLRenderingContext }).gl;
        return ctx !== undefined && !ctx.isContextLost();
    }

    /** EXD-4：Vue app.config.errorHandler 与 window 错误统一入口；同错 1 分钟去重 */
    reportError(err: unknown): void {
        const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
        console.error('[EXD-4]', msg);
        const key = msg.slice(0, 80);
        const last = exd4Seen.get(key);
        if (last !== undefined && Date.now() - last < 60_000) { return; }
        exd4Seen.set(key, Date.now());
        if (this.game !== null && this.game.renderer !== null) {
            this.showBanner('出现异常，已回到主菜单。');
            sceneDirector.gotoMenu();
        } else {
            this.showBanner('出现异常且渲染不可用，请刷新页面。');
        }
    }

    private showBanner(text: string): void {
        if (this.banner === null) {
            this.banner = document.createElement('div');
            this.banner.style.cssText =
                'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99;' +
                'background:#3a1c1c;color:#f4f4f4;border:1px solid #b05656;border-radius:6px;' +
                'padding:8px 16px;font-size:14px;';
            document.body.appendChild(this.banner);
        }
        this.banner.textContent = text;
    }
}

const exd4Seen = new Map<string, number>();

export const appLifecycle = new AppLifecycleImpl();
