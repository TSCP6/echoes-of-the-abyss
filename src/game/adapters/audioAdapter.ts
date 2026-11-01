/**
 * MOD-38 AudioAdapter（IF-X02，封装 WebAudio/AudioContext，经 Phaser Sound 系统）。
 * NFR-10 / EX-08：AudioContext 仅在用户手势回调内 unlock（FLOW-S1 步骤 1）；
 * resume 被自动播放策略拒绝（异步）→ blocked 标志，游戏静音运行不抛异常；
 * 解锁成功后经 onUnlocked 回调通知 AudioDirector 冲刷挂起播放队列。
 * 失焦暂停：onVisibility(hidden) 由 AppLifecycle 转发（EX-05）。
 */
import type { Result } from '../domain/shared/result';
import { ok, fail } from '../domain/shared/result';

class AudioAdapterImpl {
    private unlocked = false;
    private blocked = false;
    private onUnlockCb: (() => void) | null = null;

    /** 注册解锁成功回调（AudioDirector 冲刷 pending 队列） */
    onUnlocked(cb: () => void): void { this.onUnlockCb = cb; }

    /** 必须在用户手势回调内调用（FLOW-S1 步骤 1）；每次手势至多一次 */
    unlock(game: Phaser.Game): Result<void, 'AUDIO_BLOCKED'> {
        if (this.unlocked) { return ok(undefined); }
        const sm = game.sound as Phaser.Sound.WebAudioSoundManager;
        const ctx: AudioContext | undefined = sm.context;
        if (ctx === undefined || ctx === null) {
            // 非 WebAudio 后端（HTML5 Audio 回退）：无需解锁
            this.unlocked = true;
            this.onUnlockCb?.();
            return ok(undefined);
        }
        if (ctx.state === 'closed') {
            this.blocked = true;
            return fail('AUDIO_BLOCKED', 'AudioContext 已关闭，静音运行');
        }
        if (ctx.state === 'running') {
            this.unlocked = true;
            this.onUnlockCb?.();
            return ok(undefined);
        }
        // suspended：手势内 resume；拒绝 → EX-08 静音路径（blocked，不抛异常）
        ctx.resume().then(
            () => {
                this.unlocked = true;
                this.blocked = false;
                this.onUnlockCb?.();
            },
            () => { this.blocked = true; }
        );
        return ok(undefined);
    }

    isUnlocked(): boolean { return this.unlocked; }

    isBlocked(): boolean { return this.blocked; }

    /** EX-05：hidden → 暂停 BGM 与循环；visible → 恢复（AppLifecycle 转发） */
    onVisibility(hidden: boolean, game: Phaser.Game): void {
        if (hidden) { game.sound.pauseAll(); } else { game.sound.resumeAll(); }
    }

    /** 仅供单元测试 */
    _reset(): void { this.unlocked = false; this.blocked = false; this.onUnlockCb = null; }
}

export const audioAdapter = new AudioAdapterImpl();
