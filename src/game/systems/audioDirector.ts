/** MOD-08：长曲 BGM、0.8 秒交叉淡化、50 毫秒去重及有上限的一次性音效。 */
import { onEvent, offEvent, type EventPayloads } from '../events';
import { audioAdapter } from '../adapters/audioAdapter';
import { settingsStore } from '../domain/settingsStore';
import { warnThrottled } from '../domain/warn';
import { BGM, SFX, WEAPON_SFX, SKILL_SFX, MUSIC_MIX_GAIN, type BgmKey, type SfxKey } from '../data/audioCatalog';
export type { BgmKey, SfxKey } from '../data/audioCatalog';

type Sound = Phaser.Sound.WebAudioSound;
interface Fade { from: number; to: number; t: number; killOnEnd: boolean }
interface Music { gain: number; fade: Fade | null }
const CROSSFADE_SEC = 0.8;
const MAX_SFX = 8;
const IMPORTANT_SFX = new Set<SfxKey>(['hit_taken', 'death', 'checkpoint', 'clear', 'heal']);

class AudioDirectorImpl {
    private game: Phaser.Game | null = null;
    private sm: Phaser.Sound.WebAudioSoundManager | null = null;
    private clockMs = 0;
    private lastPlay = new Map<SfxKey, number>();
    private activeSfx = new Map<Sound, { key: SfxKey; gain: number }>();
    private music = new Map<Sound, Music>();
    private currentBgm: BgmKey | null = null;
    private bgmSound: Sound | null = null;
    private bossGain = 0.82;
    private pendingBgm: BgmKey | null = null;
    private pendingSfx = new Map<SfxKey, number>();
    private volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
    private onStep = (_time: number, deltaMs: number): void => this.tick(deltaMs / 1000);
    private onDestroy = (): void => this.detach();
    private onSettings = (p: EventPayloads['settings:changed']): void => {
        this.volumes = { master: p.masterVolume / 100, music: p.musicVolume / 100, sfx: p.sfxVolume / 100 };
        this.applyVolumes();
    };

    attach(game: Phaser.Game): void {
        this.detach();
        this.game = game;
        this.sm = game.sound as Phaser.Sound.WebAudioSoundManager;
        this.clockMs = 0;
        this.onSettings(settingsStore.getSnapshot());
        onEvent('settings:changed', this.onSettings);
        // 全局 STEP 不随关卡 pause/shutdown 停止，菜单和营地也会推进淡化。
        game.events.on('step', this.onStep);
        game.events.once('destroy', this.onDestroy);
        audioAdapter.onUnlocked(() => this.flushPending());
    }

    detach(): void {
        if (this.game !== null) {
            offEvent('settings:changed', this.onSettings);
            this.game.events.off('step', this.onStep);
            this.game.events.off('destroy', this.onDestroy);
        }
        for (const sound of [...this.music.keys(), ...this.activeSfx.keys()]) { this.dispose(sound); }
        this.music.clear(); this.activeSfx.clear(); this.lastPlay.clear(); this.pendingSfx.clear();
        this.pendingBgm = null; this.bgmSound = null; this.currentBgm = null; this.bossGain = 0.82;
        this.sm = null; this.game = null;
        audioAdapter.onUnlocked(() => {});
    }

    private alive(sound: Sound): boolean {
        return !sound.pendingRemove && (!('volumeNode' in sound) || sound.volumeNode !== null);
    }
    private dispose(sound: Sound): void {
        if (this.alive(sound)) { sound.stop(); sound.destroy(); }
    }
    private hasAudio(file: string): boolean {
        if (this.game?.cache.audio.exists(file)) { return true; }
        warnThrottled(`audio-missing-${file}`, `音频资源缺失，静默跳过：${file}`);
        return false;
    }

    /** 参数始终为秒；去重时钟显式换算成毫秒。由全局 STEP 唯一调用。 */
    tick(dt: number): void {
        if (!Number.isFinite(dt) || dt < 0) { return; }
        this.clockMs += dt * 1000;
        for (const [sound, state] of this.music) {
            if (!this.alive(sound)) { this.music.delete(sound); continue; }
            const fade = state.fade;
            if (fade !== null) {
                fade.t += dt;
                const k = Math.min(1, fade.t / CROSSFADE_SEC);
                state.gain = fade.from + (fade.to - fade.from) * k;
                if (k === 1) {
                    state.fade = null;
                    if (fade.killOnEnd) { this.dispose(sound); this.music.delete(sound); continue; }
                }
            }
        }
        this.applyVolumes();
    }

    playWeapon(id: string): void { const key = WEAPON_SFX[id]; if (key !== undefined) { this.playSfx(key); } }
    playSkill(id: string): void { const key = SKILL_SFX[id]; if (key !== undefined) { this.playSfx(key); } }

    playSfx(key: SfxKey): void {
        const sm = this.sm;
        if (sm === null) { return; }
        if (!audioAdapter.isUnlocked()) {
            this.pendingSfx.set(key, this.clockMs);
            if (this.pendingSfx.size > 3) { this.pendingSfx.delete(this.pendingSfx.keys().next().value!); }
            return;
        }
        const last = this.lastPlay.get(key);
        if (last !== undefined && this.clockMs - last < 50) { return; }
        if (this.volumes.master * this.volumes.sfx === 0 || !this.hasAudio(SFX[key].file)) { return; }
        for (const sound of this.activeSfx.keys()) { if (!this.alive(sound)) { this.activeSfx.delete(sound); } }
        if ([...this.activeSfx.values()].filter(s => s.key === key).length >= 2) { return; }
        if (this.activeSfx.size >= MAX_SFX) {
            if (!IMPORTANT_SFX.has(key)) { return; }
            const oldest = this.activeSfx.keys().next().value!;
            this.dispose(oldest); this.activeSfx.delete(oldest);
        }
        this.lastPlay.set(key, this.clockMs);
        const gain = SFX[key].gain;
        const sound = sm.add(SFX[key].file, { volume: this.volumes.master * this.volumes.sfx * gain }) as Sound;
        this.activeSfx.set(sound, { key, gain });
        sound.once('destroy', () => this.activeSfx.delete(sound));
        sound.once('complete', () => { this.activeSfx.delete(sound); this.dispose(sound); });
        if (!sound.play()) { this.activeSfx.delete(sound); this.dispose(sound); }
    }

    private fade(sound: Sound, to: number, killOnEnd: boolean): void {
        const state = this.music.get(sound);
        if (state !== undefined) { state.fade = { from: state.gain, to, t: 0, killOnEnd }; }
    }

    playBgm(key: BgmKey): void {
        const sm = this.sm;
        if (sm === null) { return; }
        if (!audioAdapter.isUnlocked()) { this.pendingBgm = key; return; }
        if (key === this.currentBgm && this.bgmSound !== null && this.alive(this.bgmSound)) { return; }
        if (!this.hasAudio(BGM[key])) { return; }
        // 重新定向现有淡化；旧曲不再同时保留淡入和淡出两条斜坡。
        for (const sound of this.music.keys()) {
            if (sound === this.bgmSound) { this.fade(sound, 0, true); }
            else { this.dispose(sound); this.music.delete(sound); }
        }
        const next = sm.add(BGM[key], { loop: true, volume: 0 }) as Sound;
        if (!next.play()) { this.dispose(next); return; }
        this.music.set(next, { gain: 0, fade: null });
        this.bgmSound = next; this.currentBgm = key;
        this.fade(next, key === 'boss' ? this.bossGain : 1, false);
    }

    /** 同一首钢琴战斗曲保持时间轴，只轻微增强强度，避免阶段切换重播开头。 */
    setBossPhase(phaseIndex: number): void {
        this.bossGain = phaseIndex <= 0 ? 0.82 : phaseIndex === 1 ? 0.90 : 1;
        if (this.currentBgm === 'boss' && this.bgmSound !== null) { this.fade(this.bgmSound, this.bossGain, false); }
        else { this.playBgm('boss'); }
    }

    stopBgm(): void {
        this.pendingBgm = null;
        for (const sound of this.music.keys()) { this.fade(sound, 0, true); }
        this.bgmSound = null; this.currentBgm = null;
    }

    private applyVolumes(): void {
        const musicVolume = this.volumes.master * this.volumes.music * MUSIC_MIX_GAIN;
        for (const [sound, state] of this.music) {
            if (this.alive(sound)) { sound.setVolume(musicVolume * state.gain); }
        }
        for (const [sound, state] of this.activeSfx) {
            if (this.alive(sound)) { sound.setVolume(this.volumes.master * this.volumes.sfx * state.gain); }
        }
    }

    private flushPending(): void {
        const pending = [...this.pendingSfx]; this.pendingSfx.clear();
        // 只保留手势附近 120ms 内的反馈，开场前的跳跃/拾取声不会补播。
        for (const [key, at] of pending) { if (this.clockMs - at <= 120) { this.playSfx(key); } }
        const bgm = this.pendingBgm; this.pendingBgm = null;
        if (bgm !== null) { this.playBgm(bgm); }
    }

    _setClock(ms: number): void { this.clockMs = ms; }
}

export const audioDirector = new AudioDirectorImpl();
