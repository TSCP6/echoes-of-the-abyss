import type { KeymapData } from '../persistence/saveSchema';

export type RemappableAction = keyof KeymapData;
export const REMAPPABLE_ACTIONS = ['moveLeft', 'moveRight', 'jump', 'attackMain', 'interact'] as const;
export const DEFAULT_BINDINGS = {
    moveLeft: ['A', 'LEFT'], moveRight: ['D', 'RIGHT'], moveDown: ['S', 'DOWN'], jump: ['SPACE'],
    attackMain: ['J'], attackSub: ['K'], skill1: ['1'], skill2: ['2'],
    skill3: ['3'], skill4: ['4'], interact: ['E'], inventory: ['TAB'],
    skillTree: ['Y'], pause: ['ESC'], fullscreen: ['F']
} satisfies Record<string, string[]>;
export type GameAction = keyof typeof DEFAULT_BINDINGS;

const SPECIAL_CODES: Record<string, number> = {
    BACKSPACE: 8, TAB: 9, ENTER: 13, ESC: 27, SPACE: 32,
    PAGEUP: 33, PAGEDOWN: 34, END: 35, HOME: 36,
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, INSERT: 45, DELETE: 46
};
const ALIASES: Record<string, string> = {
    ARROWLEFT: 'LEFT', ARROWRIGHT: 'RIGHT', ARROWUP: 'UP', ARROWDOWN: 'DOWN',
    ESCAPE: 'ESC', SPACEBAR: 'SPACE', RETURN: 'ENTER', DEL: 'DELETE',
    ONE: '1', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5',
    SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', ZERO: '0'
};

/** 有限支持集；不将任意多字符字符串截断成首字符。 */
export function normalizeKey(raw: string): string | null {
    if (typeof raw !== 'string') { return null; }
    if (raw === ' ') { return 'SPACE'; }
    const text = raw.trim().toUpperCase();
    const key = ALIASES[text] ?? text;
    return /^[A-Z0-9]$/.test(key) || Object.prototype.hasOwnProperty.call(SPECIAL_CODES, key) || /^F([1-9]|1[0-2])$/.test(key) ? key : null;
}

export function keyCode(key: string): number {
    if (/^[A-Z0-9]$/.test(key)) { return key.charCodeAt(0); }
    if (/^F([1-9]|1[0-2])$/.test(key)) { return 111 + Number(key.slice(1)); }
    return SPECIAL_CODES[key];
}

export function effectiveKeys(action: GameAction, map: KeymapData | null): string[] {
    const custom = map?.[action as RemappableAction];
    const key = custom === undefined ? null : normalizeKey(custom);
    return key === null ? [...DEFAULT_BINDINGS[action]] : [key];
}

export function keyConflict(action: RemappableAction, key: string, map: KeymapData | null): boolean {
    // 菜单确认、导航与浏览器全屏仍使用固定快捷键。
    if (['ENTER', 'UP', 'DOWN', 'F11'].includes(key)) { return true; }
    return (Object.keys(DEFAULT_BINDINGS) as GameAction[]).some(other =>
        other !== action && effectiveKeys(other, map).includes(key));
}

/** 清理旧存档中的未知键和冲突项；按完整映射检查，允许释放默认键后复用。 */
export function sanitizeKeymap(raw: KeymapData | null): KeymapData | null {
    const map: KeymapData = {};
    for (const action of REMAPPABLE_ACTIONS) {
        const key = normalizeKey(raw?.[action] ?? '');
        if (key !== null) { map[action] = key; }
    }
    let removed: boolean;
    do {
        removed = false;
        for (const action of REMAPPABLE_ACTIONS) {
            const key = map[action];
            if (key !== undefined && keyConflict(action, key, map)) {
                delete map[action];
                removed = true;
            }
        }
    } while (removed);
    return Object.keys(map).length === 0 ? null : map;
}
