/** 本地原创战斗图标索引；明确列举以避免未知 ID 产生失效请求。 */
export const COMBAT_ICON_IDS = [
    'wpn_shortsword', 'wpn_daggers', 'wpn_greataxe', 'wpn_crossbow', 'wpn_dartgun', 'wpn_firestaff',
    'sk_blade_focus', 'sk_whirlwind', 'sk_blade_edge', 'sk_blade_fury', 'sk_blade_mastery', 'sk_blade_storm', 'sk_blade_apex',
    'sk_bolt_steady', 'sk_multishot', 'sk_bolt_pierce', 'sk_bolt_volley', 'sk_bolt_keen', 'sk_bolt_rain', 'sk_bolt_apex',
    'sk_dash', 'sk_heal', 'sk_ruin_tough1', 'sk_ruin_tough2', 'sk_ruin_vigor', 'sk_ruin_blink', 'sk_ruin_apex'
] as const;

const ids: ReadonlySet<string> = new Set(COMBAT_ICON_IDS);

export function combatIconUrl(id: string | null | undefined): string | null {
    return id && ids.has(id) ? `${import.meta.env.BASE_URL}assets/art/combat-icons/${id}.svg` : null;
}
