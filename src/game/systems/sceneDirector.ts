/**
 * SceneDirector（MOD-11）：统一场景切换编排——0.4 s 淡出淡入（FR-12 规则 5）、
 * 切换期输入禁用（FR-12 规则 6）、切换前存档触发点判定（FR-13 规则 2，P3 接 SaveSystem）。
 * 公开签名引擎中立（Vue 可经此单例发命令，ARCH-3 精神：Vue 不触碰 Phaser 对象）；
 * game 实例由 BootScene 在 create 时 attach（唯一注册点）。
 * 切换定时经 DOM setTimeout（不受源场景 pause/shutdown 影响——场景本地定时器会在
 * shutdown 时丢失，曾导致结算页「重试」被吞）；完成判定经 rAF 轮询目标场景进入 active 列表。
 */
import type { Game, Scene } from 'phaser';

const FADE_MS = 400;
const POLL_LIMIT = 120; // rAF 帧上限（约 2 s）

export class SceneDirector {
    private game: Game | null = null;
    private transitioning = false;
    /** 单槽排队：切换期新请求覆盖旧意图（防连点不吞点击，FR-15 边界） */
    private pending: { target: string; data?: Record<string, unknown> } | null = null;
    private activeGameplay: Scene | null = null;

    /** 当前承载玩法的场景实例（LevelScene create 时登记，shutdown/切换时清空）；
     *  ui:overlay 的 pause/resume 只作用于持令牌实例，防止已暂停旧实例被误恢复 */
    setActiveGameplay(scene: Scene | null): void { this.activeGameplay = scene; }
    isGameplay(scene: Scene): boolean { return this.activeGameplay === scene; }
    attachGame(game: Game): void { this.game = game; }

    /** AudioAdapter 解锁等适配层需要 game 引用（FLOW-S1 步骤 1） */
    get gameRef(): Game | null { return this.game; }

    get isTransitioning(): boolean { return this.transitioning; }

    private activeScene(): Scene | null {
        if (this.game === null) { return null; }
        const scenes = this.game.scene.getScenes(true);
        return scenes.length > 0 ? scenes[0] : null;
    }

    private isTargetActive(target: string): boolean {
        if (this.game === null) { return false; }
        return this.game.scene.getScenes(true).some((s) => s.scene.key === target);
    }

    private fadeTo(target: string, data?: Record<string, unknown>): void {
        const from = this.activeScene();
        if (from === null) {
            // 无活动场景（启动早期）：下一帧重试
            window.requestAnimationFrame(() => { if (!this.transitioning) { this.fadeTo(target, data); } });
            return;
        }
        this.transitioning = true;
        // overlay（结算/暂停）可能已 pause 源场景：恢复以推进淡出；
        // 输入已禁用 + 场景 update 有 overlayOpen/ready 闸，恢复不会推进玩法
        if (from.scene.isPaused()) { from.scene.resume(); }
        from.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
        from.input.enabled = false; // 切换期输入闸（FR-12 规则 6）
        // DOM 定时：源场景 pause/shutdown 不影响切换推进
        window.setTimeout(() => {
            from.scene.start(target, data);
            this.awaitTarget(target);
        }, FADE_MS);
    }

    /** rAF 轮询目标场景进入 active 列表 → 收尾并消费排队请求 */
    private awaitTarget(target: string, attempt = 0): void {
        if (this.isTargetActive(target)) {
            this.transitioning = false;
            const next = this.pending;
            this.pending = null;
            if (next !== null) { this.request(next.target, next.data); }
            return;
        }
        if (attempt < POLL_LIMIT) {
            window.requestAnimationFrame(() => this.awaitTarget(target, attempt + 1));
        } else {
            // 超时兜底：强制收尾，避免 transitioning 永久卡死
            this.transitioning = false;
            const next = this.pending;
            this.pending = null;
            if (next !== null) { this.request(next.target, next.data); }
        }
    }

    gotoLevel(levelId: string): void { this.request('Level', { levelId }); }

    gotoMenu(): void { this.request('Menu'); }

    gotoCamp(sceneId: 1 | 2 | 3): void { this.request('Camp', { sceneId }); }

    private request(target: string, data?: Record<string, unknown>): void {
        if (this.transitioning) { this.pending = { target, data }; return; }
        this.fadeTo(target, data);
    }
}

/** 全局单例（跨场景共享切换闸） */
export const sceneDirector = new SceneDirector();
