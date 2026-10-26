/**
 * MOD-08 AudioDirector（Phaser 呈现层）—— FR-16 规则 1/2/5、NFR-10、EX-08。
 * - ≥18 音效 + 2 BGM + 3 Boss 紧张变体（DD-11 清单，双格式 ogg/m4a 兼容 Safari ≥17）；
 * - 同音效 50 ms 合并（Map<key, lastPlayTime>，游戏时钟，AT-58）；
 * - BGM 交叉淡化 0.8 s：tick 驱动音量互补斜坡（不依赖场景 tween——场景停止不中断淡化）；
 * - Boss 战切紧张变体：setBossPhase(phase) 由 LevelScene 在 onBossPhase 直调（6.2.3）；
 * - 三路音量实时应用：订阅 settings:changed（master×channel 乘积，IF-X02）；
 * - 缺资源静默跳过 + console.warn（FR-16 边界）；未解锁（EX-08）挂起队列，解锁后冲刷。
 */
import { onEvent, offEvent, type EventPayloads } from '../events';
import { audioAdapter } from '../adapters/audioAdapter';
import { warnThrottled } from '../domain/warn';

/** DD-11 音效键 → 文件（public/assets/audio/，双格式） */
export type SfxKey =
    | 'jump' | 'land' | 'swing' | 'hit_melee' | 'shoot' | 'hit_taken'
    | 'coin' | 'pickup_item' | 'checkpoint' | 'death' | 'skill' | 'dash' | 'heal' | 'clear'
    | 'ui_click' | 'ui_open' | 'ui_close' | 'ui_error' | 'buy';

const SFX_FILES: Record<SfxKey, string> = {
    jump: 'sfx_jump', land: 'sfx_land', swing: 'sfx_swing', hit_melee: 'sfx_hit_melee',
    shoot: 'sfx_shoot', hit_taken: 'sfx_hit_taken', coin: 'sfx_coin', pickup_item: 'sfx_pickup_item',
    checkpoint: 'sfx_checkpoint', death: 'sfx_death', skill: 'sfx_skill', dash: 'sfx_dash',
    heal: 'sfx_heal', clear: 'sfx_clear',
    ui_click: 'sfx_ui_click', ui_open: 'sfx_ui_open', ui_close: 'sfx_ui_close',
    ui_error: 'sfx_ui_error', buy: 'sfx_buy'
};

/** BGM 曲目（DD-11：每场景 1 首 + Boss 紧张变体） */
export type BgmKey = 'menu' | 'level' | 'boss1' | 'boss2' | 'boss3';
const BGM_FILES: Record<BgmKey, string> = {
    menu: 'bgm_scene1', level: 'bgm_scene2',
    boss1: 'bgm_boss1_tense', boss2: 'bgm_boss2_tense', boss3: 'bgm_boss3_tense'
};

const MERGE_MS = 50;       // FR-16 规则 2
const CROSSFADE_SEC = 0.8; // FR-16 规则 5

interface Fade {
    snd: Phaser.Sound.WebAudioSound;
    from: number;
    to: number;
    t: number;
    killOnEnd: boolean;
}

class AudioDirectorImpl {
    private game: Phaser.Game | null = null;
    private sm: Phaser.Sound.WebAudioSoundManager | null = null;
    private lastPlay = new Map<string, number>();
    private clock = 0;
    private currentBgm: BgmKey | null = null;
    private bgmSound: Phaser.Sound.WebAudioSound | null = null;
    private fades: Fade[] = [];
    private pendingSfx: SfxKey[] = [];
    private pendingBgm: BgmKey | null = null;
    private volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
    private settingsHandler: ((p: EventPayloads['settings:changed']) => void) | null = null;

    /** Preloader create 绑定（音频资源已加载，key = 文件名） */
    attach(game: Phaser.Game): void {
        this.game = game;
        this.sm = game.sound as Phaser.Sound.WebAudioSoundManager;
        this.clock = 0;
        this.lastPlay.clear();
        this.pendingSfx = [];
        this.fades = [];
        this.settingsHandler = (p) => {
            this.volumes = { master: p.masterVolume / 100, music: p.musicVolume / 100, sfx: p.sfxVolume / 100 };
            this.applyVolumes();
        };
        onEvent('settings:changed', this.settingsHandler);
        audioAdapter.onUnlocked(() => this.flushPending());
    }

    detach(): void {
        if (this.settingsHandler !== null) { offEvent('settings:changed', this.settingsHandler); this.settingsHandler = null; }
        this.bgmSound = null;
        this.currentBgm = null;
        this.fades = [];
        this.game = null;
        this.sm = null;
    }

    /** 管线阶段 1（游戏时钟，50 ms 合并窗口同源；交叉淡化斜坡推进） */
    tick(dt: number): void {
        this.clock += dt;
        for (const f of [...this.fades]) {
            // 场景卸载可能先于淡化结束销毁 sound（volumeNode 置 null）：跳过并移除该 fade
            const wa = f.snd as Phaser.Sound.WebAudioSound;
            if (wa.volumeNode === null || wa.volumeNode === undefined) {
                this.fades.splice(this.fades.indexOf(f), 1);
                continue;
            }
            f.t += dt;
            const k = Math.min(1, f.t / CROSSFADE_SEC);
            f.snd.setVolume(f.from + (f.to - f.from) * k);
            if (k >= 1) {
                this.fades.splice(this.fades.indexOf(f), 1);
                if (f.killOnEnd) { f.snd.stop(); f.snd.destroy(); }
            }
        }
    }

    /** destroyed sound 的 volume getter 会触 volumeNode.gain 空引用：安全读取 */
    private safeVolume(snd: Phaser.Sound.WebAudioSound): number | null {
        return snd.volumeNode === null || snd.volumeNode === undefined ? null : snd.volume;
    }

    /** 资源存在性经 cache.audio（SoundManager 无 exists；FR-16 缺资源静默跳过） */
    private hasAudio(file: string): boolean {
        return this.game !== null && this.game.cache.audio.exists(file);
    }

    /** FR-16 规则 2：同音效 50 ms 内合并为一次播放 */
    playSfx(key: SfxKey): void {
        const sm = this.sm;
        if (sm === null) { return; }
        if (!audioAdapter.isUnlocked()) {
            // EX-08：未解锁挂起（去重），解锁后冲刷
            if (!this.pendingSfx.includes(key)) { this.pendingSfx.push(key); }
            return;
        }
        const last = this.lastPlay.get(key);
        if (last !== undefined && this.clock - last < MERGE_MS) { return; }
        this.lastPlay.set(key, this.clock);
        const file = SFX_FILES[key];
        if (!this.hasAudio(file)) {
            warnThrottled(`audio-missing-${file}`, `音效资源缺失，静默跳过：${file}`);
            return;
        }
        sm.play(file, { volume: this.volumes.master * this.volumes.sfx });
    }

    /** BGM 切换：0.8 s 交叉淡化（双实例音量互补，tick 驱动）；同曲不重启 */
    playBgm(key: BgmKey): void {
        const sm = this.sm;
        if (sm === null || key === this.currentBgm) { return; }
        if (!audioAdapter.isUnlocked()) { this.pendingBgm = key; return; }
        const file = BGM_FILES[key];
        this.currentBgm = key;
        if (!this.hasAudio(file)) {
            warnThrottled(`audio-missing-${file}`, `BGM 资源缺失，静默跳过：${file}`);
            return;
        }
        const targetVol = this.volumes.master * this.volumes.music;
        const old = this.bgmSound;
        const next = sm.add(file, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
        next.play();
        this.fades.push({ snd: next, from: 0, to: targetVol, t: 0, killOnEnd: false });
        if (old !== null) {
            const v = this.safeVolume(old);
            if (v !== null) {
                this.fades.push({ snd: old, from: v, to: 0, t: 0, killOnEnd: true });
            }
        }
        this.bgmSound = next;
    }

    /** Boss 战紧张变体（FR-16 规则 1；LevelScene onBossPhase 直调） */
    setBossPhase(phaseIndex: number): void {
        const key: BgmKey = phaseIndex <= 0 ? 'boss1' : phaseIndex === 1 ? 'boss2' : 'boss3';
        this.playBgm(key);
    }

    stopBgm(): void {
        if (this.bgmSound !== null) {
            const v = this.safeVolume(this.bgmSound as Phaser.Sound.WebAudioSound);
            if (v !== null) {
                this.fades.push({ snd: this.bgmSound, from: v, to: 0, t: 0, killOnEnd: true });
            }
        }
        this.bgmSound = null;
        this.currentBgm = null;
    }

    /** 三路音量实时应用（IF-X02：master×channel 乘积） */
    private applyVolumes(): void {
        const bgm = this.bgmSound;
        if (bgm !== null && bgm.isPlaying) {
            const wa = bgm as Phaser.Sound.WebAudioSound;
            if (wa.volumeNode === null || wa.volumeNode === undefined) { this.bgmSound = null; return; }
            const fading = this.fades.some((f) => f.snd === bgm);
            if (!fading) { bgm.setVolume(this.volumes.master * this.volumes.music); }
        }
        // SFX 为一次性播放，音量在 play 时乘入
    }

    /** 解锁成功后冲刷挂起请求（IF-X02 约定） */
    private flushPending(): void {
        const sfx = this.pendingSfx;
        this.pendingSfx = [];
        for (const k of sfx) { this.lastPlay.delete(k); this.playSfx(k); }
        if (this.pendingBgm !== null) {
            const b = this.pendingBgm;
            this.pendingBgm = null;
            this.playBgm(b);
        }
    }

    /** 仅供测试：合并窗口时钟注入 */
    _setClock(ms: number): void { this.clock = ms; }
}

export const audioDirector = new AudioDirectorImpl();
