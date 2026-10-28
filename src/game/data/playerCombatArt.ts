/** 仅表现参数；伤害、实际作用范围和施放成功与否均由战斗系统提供。 */
export type WeaponArtKind = 'sword' | 'daggers' | 'axe' | 'crossbow' | 'dartgun' | 'firestaff';
export const PLAYER_WEAPON_ART: Readonly<Record<string, { kind: WeaponArtKind; color: number }>> = {
    wpn_shortsword: { kind: 'sword', color: 0xe4f3ff },
    wpn_daggers: { kind: 'daggers', color: 0xb7e8ff },
    wpn_greataxe: { kind: 'axe', color: 0xffb45c },
    wpn_crossbow: { kind: 'crossbow', color: 0xf0cf8a },
    wpn_dartgun: { kind: 'dartgun', color: 0x65f3e3 },
    wpn_firestaff: { kind: 'firestaff', color: 0xff8d45 }
};
export type SkillArtKind = 'whirlwind' | 'fury' | 'storm' | 'multishot' | 'volley' | 'rain' | 'dash' | 'blink' | 'heal' | 'passive';
export const PLAYER_SKILL_ART: Readonly<Record<string, { kind: SkillArtKind; color: number }>> = {
    sk_blade_focus: { kind: 'passive', color: 0xd7ecff },
    sk_whirlwind: { kind: 'whirlwind', color: 0xc5ebff },
    sk_blade_edge: { kind: 'passive', color: 0xd7ecff },
    sk_blade_fury: { kind: 'fury', color: 0xffb96a },
    sk_blade_mastery: { kind: 'passive', color: 0xd7ecff },
    sk_blade_storm: { kind: 'storm', color: 0xdcbaff },
    sk_blade_apex: { kind: 'passive', color: 0xd7ecff },
    sk_bolt_steady: { kind: 'passive', color: 0xffda8f },
    sk_multishot: { kind: 'multishot', color: 0xffda8f },
    sk_bolt_pierce: { kind: 'passive', color: 0xffda8f },
    sk_bolt_volley: { kind: 'volley', color: 0x8ef0ee },
    sk_bolt_keen: { kind: 'passive', color: 0xffda8f },
    sk_bolt_rain: { kind: 'rain', color: 0xb8b8ff },
    sk_bolt_apex: { kind: 'passive', color: 0xffda8f },
    sk_dash: { kind: 'dash', color: 0x8cddff },
    sk_heal: { kind: 'heal', color: 0x88f7a5 },
    sk_ruin_tough1: { kind: 'passive', color: 0x88f7a5 },
    sk_ruin_tough2: { kind: 'passive', color: 0x88f7a5 },
    sk_ruin_vigor: { kind: 'passive', color: 0x88f7a5 },
    sk_ruin_blink: { kind: 'blink', color: 0xd0a9ff },
    sk_ruin_apex: { kind: 'passive', color: 0x88f7a5 }
};
