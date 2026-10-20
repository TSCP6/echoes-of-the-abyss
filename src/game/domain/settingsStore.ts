/**
 * MOD-22 SettingsStore（领域层，IF-M11）—— FR-18 设置项。
 * 三音量 0~100 步进 5（越界拒绝 INVALID_VALUE）；震屏开关；全屏经 FullscreenAdapter（P4）；
 * 变更即发布 settings:changed（IF-E09）+ markDirty（FR-18 规则 3 变更即写档）。
 * 重映射子项（FR-18 规则 2）：四组按键自定义，冲突拒绝（KEY_CONFLICT）。
 */
import { ok, fail, type Result } from './result';
import type { SaveSettingsSection, KeymapData } from './saveSchema';
import { emitEvent } from '../events';

export interface Settings {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    screenShake: boolean;
    fullscreen: boolean;
    keymap: KeymapData | null;
}

export class SettingsStore {
    private s: Settings = {
        masterVolume: 80, musicVolume: 60, sfxVolume: 90,
        screenShake: true, fullscreen: false, keymap: null
    };
    private dirty: (() => void) | null = null;

    onDirty(fn: () => void): void { this.dirty = fn; }

    getSnapshot(): Readonly<Settings> { return { ...this.s, keymap: this.s.keymap === null ? null : { ...this.s.keymap } }; }

    private changed(): void {
        emitEvent('settings:changed', this.getSnapshot());
        if (this.dirty !== null) { this.dirty(); }
    }

    /** FR-18 规则 1：0~100 步进 5，越界拒绝 */
    setVolume(channel: 'master' | 'music' | 'sfx', v: number): Result<void, 'INVALID_VALUE'> {
        if (!Number.isFinite(v) || v < 0 || v > 100 || v % 5 !== 0) {
            return fail('INVALID_VALUE', `音量须 0~100 步进 5：${v}`);
        }
        if (channel === 'master') { this.s.masterVolume = v; }
        if (channel === 'music') { this.s.musicVolume = v; }
        if (channel === 'sfx') { this.s.sfxVolume = v; }
        this.changed();
        return ok(undefined);
    }

    setScreenShake(on: boolean): void {
        this.s.screenShake = on;
        this.changed();
    }

    /** 全屏状态由 FullscreenAdapter 回写（P4）；领域仅记录 */
    setFullscreen(on: boolean): void {
        this.s.fullscreen = on;
        this.changed();
    }

    /** FR-18 规则 2：冲突提示并拒绝 */
    remap(action: keyof NonNullable<KeymapData>, key: string): Result<void, 'KEY_CONFLICT'> {
        const map: KeymapData = { ...(this.s.keymap ?? {}) };
        for (const [other, k] of Object.entries(map)) {
            if (k === key && other !== action) {
                return fail('KEY_CONFLICT', `按键 ${key} 已被 ${other} 占用`);
            }
        }
        map[action] = key;
        this.s.keymap = map;
        this.changed();
        return ok(undefined);
    }

    toSnapshot(): SaveSettingsSection { return this.getSnapshot(); }

    fromSnapshot(d: SaveSettingsSection): void {
        const clamp = (v: number, fb: number): number =>
            Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v / 5) * 5 : fb;
        this.s = {
            masterVolume: clamp(d.masterVolume, 80),
            musicVolume: clamp(d.musicVolume, 60),
            sfxVolume: clamp(d.sfxVolume, 90),
            screenShake: d.screenShake !== false,
            fullscreen: false, // 全屏不跨会话恢复（浏览器策略）
            keymap: d.keymap ?? null
        };
    }
}

/** 全局单例（ARCH-5：设置项唯一所有者） */
export const settingsStore = new SettingsStore();
