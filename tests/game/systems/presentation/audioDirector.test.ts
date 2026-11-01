import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ unlocked: true, unlock: () => {}, settings: (_p: unknown) => {} }));
vi.mock('../../../../src/game/adapters/audioAdapter', () => ({ audioAdapter: {
    isUnlocked: () => hooks.unlocked, onUnlocked: (cb: () => void) => { hooks.unlock = cb; }
} }));
vi.mock('../../../../src/game/events', () => ({
    onEvent: (_key: string, cb: (p: unknown) => void) => { hooks.settings = cb; }, offEvent: vi.fn()
}));
vi.mock('../../../../src/game/domain/player/settingsStore', () => ({ settingsStore: {
    getSnapshot: () => ({ masterVolume: 80, musicVolume: 60, sfxVolume: 90 })
} }));
import { audioDirector } from '../../../../src/game/systems/presentation/audioDirector';

function fixture() {
    const sounds: ReturnType<typeof sound>[] = [];
    const listeners = new Map<string, (...args: number[]) => void>();
    function sound(key: string, config: { volume: number; loop?: boolean }) {
        const callbacks = new Map<string, () => void>();
        return { key, volume: config.volume, loop: config.loop ?? false, isPlaying: false,
            volumeNode: {} as object | null,
            setVolume(v: number) { this.volume = v; return this; },
            play() { this.isPlaying = true; return true; },
            stop() { this.isPlaying = false; return this; },
            once(event: string, cb: () => void) { callbacks.set(event, cb); return this; },
            destroy() { this.volumeNode = null; this.isPlaying = false; callbacks.get('destroy')?.(); },
            complete() { callbacks.get('complete')?.(); }
        };
    }
    const game = { cache: { audio: { exists: (_key: string) => true } },
        sound: { sounds, add(key: string, config: { volume: number; loop?: boolean }) {
            const s = sound(key, config); sounds.push(s); return s;
        }, play(key: string, config: { volume: number }) { const s = sound(key, config); s.play(); sounds.push(s); return true; } },
        events: { on: (k: string, cb: (...args: number[]) => void) => listeners.set(k, cb),
            once: (k: string, cb: (...args: number[]) => void) => listeners.set(k, cb),
            off: (k: string) => listeners.delete(k) }
    };
    audioDirector.attach(game as unknown as Phaser.Game);
    return { game, sounds, step: (ms: number) => listeners.get('step')?.(0, ms), listeners };
}

beforeEach(() => { audioDirector.detach(); hooks.unlocked = true; });

describe('安静且稳定的音频混音', () => {
    it('同音效只合并 50 毫秒，后续动作仍能发声', () => {
        const f = fixture();
        audioDirector.playSfx('jump'); audioDirector.tick(0.049); audioDirector.playSfx('jump');
        expect(f.sounds).toHaveLength(1);
        audioDirector.tick(0.002); audioDirector.playSfx('jump');
        expect(f.sounds).toHaveLength(2);
    });
    it('全局时钟在菜单和暂停面板期间仍完成交叉淡化', () => {
        const f = fixture();
        audioDirector.playBgm('menu'); f.step(800);
        expect(f.sounds[0].volume).toBeGreaterThan(0);
        audioDirector.playBgm('level'); f.step(800);
        expect(f.sounds[0].volumeNode).toBeNull();
        expect(f.sounds.filter(s => s.isPlaying && s.loop)).toHaveLength(1);
    });
    it('连续快速切曲不会复活旧淡入或留下多个循环声道', () => {
        const f = fixture();
        audioDirector.playBgm('menu'); audioDirector.tick(0.15);
        audioDirector.playBgm('level'); audioDirector.tick(0.1);
        audioDirector.playBgm('menu'); audioDirector.tick(0.8);
        expect(f.sounds.filter(s => s.isPlaying)).toHaveLength(1);
        audioDirector.playBgm('menu');
        expect(f.sounds).toHaveLength(3);
    });
    it('淡化中静音即时作用于新旧曲和正在播放的音效', () => {
        const f = fixture();
        audioDirector.playBgm('menu'); audioDirector.tick(0.8);
        audioDirector.playBgm('level'); audioDirector.playSfx('heal');
        audioDirector.tick(0.1);
        hooks.settings({ masterVolume: 0, musicVolume: 100, sfxVolume: 100 });
        expect(f.sounds.every(s => s.volume === 0)).toBe(true);
        audioDirector.tick(0.8);
        expect(f.sounds.every(s => s.volume === 0)).toBe(true);
    });
    it('Boss 阶段改变只调整强度，不重头播放钢琴曲', () => {
        const f = fixture();
        audioDirector.setBossPhase(0); audioDirector.tick(0.8);
        const first = f.sounds[0].volume;
        audioDirector.setBossPhase(1); audioDirector.setBossPhase(2); audioDirector.tick(0.8);
        expect(f.sounds).toHaveLength(1);
        expect(f.sounds[0].volume).toBeGreaterThan(first);
    });
    it('解锁只播放最新场景音乐，过期动作音效不会集中炸响', () => {
        hooks.unlocked = false;
        const f = fixture();
        audioDirector.playSfx('jump'); audioDirector.playBgm('menu');
        audioDirector.tick(1); audioDirector.playBgm('level');
        hooks.unlocked = true; hooks.unlock(); audioDirector.tick(0.8);
        expect(f.sounds).toHaveLength(1);
        expect(f.sounds[0].key).toBe('bgm_exploration');
    });
    it('密集音效最多八路，结束释放且可再次播放', () => {
        const f = fixture();
        for (let i = 0; i < 30; i++) { audioDirector.tick(0.06); audioDirector.playSfx(i % 2 === 0 ? 'jump' : 'coin'); }
        expect(f.sounds.filter(s => s.isPlaying).length).toBeLessThanOrEqual(8);
        for (const s of f.sounds) { s.complete(); }
        audioDirector.tick(0.2); audioDirector.playSfx('jump');
        expect(f.sounds.filter(s => s.isPlaying)).toHaveLength(1);
    });
    it('六种武器与九个主动技能都有音色；未知 ID 静默忽略', () => {
        const f = fixture();
        const weapons = ['shortsword', 'daggers', 'greataxe', 'crossbow', 'dartgun', 'firestaff'];
        for (const id of weapons) { audioDirector.playWeapon(`wpn_${id}`); f.sounds.at(-1)?.complete(); }
        expect(new Set(f.sounds.map(s => s.key)).size).toBe(6);
        const skills = ['whirlwind', 'blade_fury', 'blade_storm', 'multishot', 'bolt_volley', 'bolt_rain', 'dash', 'heal', 'ruin_blink'];
        for (const id of skills) { audioDirector.playSkill(`sk_${id}`); f.sounds.at(-1)?.complete(); }
        expect(new Set(f.sounds.slice(6).map(s => s.key)).size).toBe(9);
        audioDirector.playWeapon('unknown'); audioDirector.playSkill('unknown');
        expect(f.sounds).toHaveLength(15);
    });
    it('销毁会清掉循环、一次性音效、全局时钟和待播请求', () => {
        const f = fixture();
        audioDirector.playBgm('menu'); audioDirector.playSfx('jump'); audioDirector.tick(0.1);
        audioDirector.detach(); audioDirector.detach();
        expect(f.sounds.every(s => s.volumeNode === null)).toBe(true);
        expect(f.listeners.size).toBe(0);
        audioDirector.playSfx('jump'); audioDirector.tick(1);
        expect(f.sounds).toHaveLength(2);
    });
});
