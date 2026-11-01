import type { AbilityPoint, AbilityRect } from './bossAbilities';

/** 向脚下扫描实际碰撞/单向瓦片，锁定最近表面及该行的连续宽度。 */
export function findBossSurface(arena: AbilityRect, foot: AbilityPoint,
    solidAt: (x: number, y: number) => boolean): AbilityRect {
    const size = 32;
    const x = Math.max(arena.x + 1, Math.min(arena.x + arena.width - 1, foot.x));
    const column = Math.floor(x / size);
    for (let y = Math.floor((foot.y + 4) / size) * size; y < arena.y + arena.height; y += size) {
        if (y < foot.y - 6 || !solidAt(x, y + 1)) { continue; }
        let left = column * size, right = left + size;
        while (left > arena.x && solidAt(left - size / 2, y + 1)) { left -= size; }
        while (right < arena.x + arena.width && solidAt(right + size / 2, y + 1)) { right += size; }
        left = Math.max(arena.x, left); right = Math.min(arena.x + arena.width, right);
        return { x: left, y, width: right - left, height: size };
    }
    return { x: arena.x, y: arena.y + arena.height, width: arena.width, height: size };
}
