/**
 * SceneDirector（MOD-11）：统一场景切换编排——0.4 s 淡出淡入（FR-12 规则 5）、
 * 切换期输入禁用（FR-12 规则 6）、切换前存档触发点判定（FR-13 规则 2，P3 接 SaveSystem）。
 * 公开签名引擎中立（Vue 可经此单例发命令，ARCH-3 精神：Vue 不触碰 Phaser 对象）；
 * game 实例由 BootScene 在 create 时 attach（唯一注册点）。
 */
import type { Game, Scene } from 'phaser';

const FADE_MS = 400;

export class SceneDirector {
    private game: Game | null = null;
    private transitioning = false;
    private activeGameplay: Scene | null = null;

    /** 当前承载玩法的场景实例（LevelScene create 时登记，shutdown/切换时清空）；
     *  ui:overlay 的 pause/resume 只作用于持令牌实例，防止已暂停旧实例被误恢复 */
    setActiveGameplay(scene: Scene | null): void { this.activeGameplay = scene; }
    isGameplay(scene: Scene): boolean { return this.activeGameplay === scene; }
    attachGame(game: Game): void { this.game = game; }

    get isTransitioning(): boolean { return this.transitioning; }

    private activeScene(): Scene | null {
        if (this.game === null) { return null; }
        const scenes = this.game.scene.getScenes(true);
        return scenes.length > 0 ? scenes[0] : null;
    }

    private fadeTo(target: string, data?: Record<string, unknown>): void {
        const from = this.activeScene();
        if (from === null) { return; }
        this.transitioning = true;
        from.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
        from.input.enabled = false; // 切换期输入闸（FR-12 规则 6）
        from.time.delayedCall(FADE_MS, () => {
            from.scene.start(target, data);
            this.transitioning = false;
        });
    }

    gotoLevel(levelId: string): void {
        if (this.transitioning) { return; } // FR-15 边界：防连点重复加载
        this.fadeTo('Level', { levelId });
    }

    gotoMenu(): void {
        if (this.transitioning) { return; }
        this.fadeTo('Menu');
    }
}

/** 全局单例（跨场景共享切换闸） */
export const sceneDirector = new SceneDirector();
