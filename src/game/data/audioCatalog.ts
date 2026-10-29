/** 音色和混音的单一清单；所有资源随游戏本地发布，原始许可见 docs/素材许可清单.md。 */
export const SFX = {
    jump: { file: 'sfx_jump', gain: 0.40 }, land: { file: 'sfx_land', gain: 0.26 },
    swing: { file: 'sfx_swing', gain: 0.50 }, hit_melee: { file: 'sfx_hit_melee', gain: 0.44 },
    shoot: { file: 'sfx_shoot', gain: 0.42 }, hit_taken: { file: 'sfx_hit_taken', gain: 0.62 },
    coin: { file: 'sfx_coin', gain: 0.28 }, pickup_item: { file: 'sfx_pickup_item', gain: 0.42 },
    checkpoint: { file: 'sfx_checkpoint', gain: 0.50 }, death: { file: 'sfx_death', gain: 0.48 },
    skill: { file: 'sfx_skill', gain: 0.48 }, dash: { file: 'sfx_dash', gain: 0.48 },
    heal: { file: 'sfx_heal', gain: 0.50 }, clear: { file: 'sfx_clear', gain: 0.52 },
    ui_click: { file: 'sfx_ui_click', gain: 0.25 }, ui_open: { file: 'sfx_ui_open', gain: 0.25 },
    ui_close: { file: 'sfx_ui_close', gain: 0.25 }, ui_error: { file: 'sfx_ui_error', gain: 0.34 },
    buy: { file: 'sfx_buy', gain: 0.35 },
    sword: { file: 'sfx_weapon_sword', gain: 0.55 }, daggers: { file: 'sfx_weapon_daggers', gain: 0.48 },
    axe: { file: 'sfx_weapon_axe', gain: 0.60 }, crossbow: { file: 'sfx_weapon_crossbow', gain: 0.50 },
    dartgun: { file: 'sfx_weapon_dartgun', gain: 0.44 }, firestaff: { file: 'sfx_weapon_firestaff', gain: 0.52 },
    whirlwind: { file: 'sfx_skill_whirlwind', gain: 0.54 }, fury: { file: 'sfx_skill_fury', gain: 0.52 },
    storm: { file: 'sfx_skill_storm', gain: 0.58 }, multishot: { file: 'sfx_skill_multishot', gain: 0.50 },
    volley: { file: 'sfx_skill_volley', gain: 0.52 }, rain: { file: 'sfx_skill_rain', gain: 0.52 },
    blink: { file: 'sfx_skill_blink', gain: 0.48 }
} as const;
export type SfxKey = keyof typeof SFX;

export const BGM = {
    menu: 'bgm_menu_piano', level: 'bgm_exploration', ruins: 'bgm_ruins_piano', boss: 'bgm_boss_piano'
} as const;
export type BgmKey = keyof typeof BGM;
export const MUSIC_MIX_GAIN = 0.70;
export const AUDIO_FILES = [...new Set([...Object.values(SFX).map(s => s.file), ...Object.values(BGM)])];

export const WEAPON_SFX: Readonly<Record<string, SfxKey>> = {
    wpn_shortsword: 'sword', wpn_daggers: 'daggers', wpn_greataxe: 'axe',
    wpn_crossbow: 'crossbow', wpn_dartgun: 'dartgun', wpn_firestaff: 'firestaff'
};
export const SKILL_SFX: Readonly<Record<string, SfxKey>> = {
    sk_whirlwind: 'whirlwind', sk_blade_fury: 'fury', sk_blade_storm: 'storm',
    sk_multishot: 'multishot', sk_bolt_volley: 'volley', sk_bolt_rain: 'rain',
    sk_dash: 'dash', sk_heal: 'heal', sk_ruin_blink: 'blink'
};
/** Boss 入场前仍播放区域探索音乐；营地由 UI 使用 menu 的舒缓钢琴。 */
export function regionBgm(sceneId: number): BgmKey { return sceneId === 1 ? 'level' : 'ruins'; }
