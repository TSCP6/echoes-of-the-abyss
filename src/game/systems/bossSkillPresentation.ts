/** Shared by skill execution and its preview: avoid drifting angles/spawn points. */
export function bossProjectileAngles(direction: 1 | -1, count: number, spread: number): number[] {
    const total = Math.max(1, Math.floor(count));
    return Array.from({ length: total }, (_, i) =>
        (direction === 1 ? 0 : 180) + (i - (total - 1) / 2) * spread / Math.max(1, total - 1));
}

export function bossSummonPositions(x: number, y: number, count: number): { x: number; y: number }[] {
    return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
        x: x + (i % 2 === 0 ? -1 : 1) * (72 + Math.floor(i / 2) * 56), y
    }));
}

export function bossProjectileTexture(sourceId: string, side: 'player' | 'enemy'): string {
    if (side === 'player') { return 'projectile_player'; }
    if (sourceId === 'enm_boss_spider') { return 'projectile_spider'; }
    if (sourceId === 'enm_boss_echo') { return 'projectile_echo'; }
    return 'projectile_enemy';
}

export function bossPalette(sourceId: string): { name: string; glow: number; danger: number; light: number; text: string } {
    if (sourceId === 'enm_boss_spider') { return { name: '深渊蛛后', glow: 0xc4f078, danger: 0x97e83d, light: 0xf2ffd4, text: '#c4f078' }; }
    if (sourceId === 'enm_boss_echo') { return { name: '回响之影', glow: 0xb798ff, danger: 0x9d76ff, light: 0xe8ddff, text: '#c9b6ff' }; }
    return { name: '石像守卫者', glow: 0xffd470, danger: 0xff653f, light: 0xfff1c9, text: '#ffd470' };
}
