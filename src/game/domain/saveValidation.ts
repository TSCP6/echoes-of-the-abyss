import type { SaveData } from './saveSchema';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { SKILLS } from '../data/skills';
import { LEVEL_ORDER } from '../data/levels';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const number = (v: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const integer = (v: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER): v is number => number(v, lo, hi) && Number.isInteger(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const nullableString = (v: unknown): boolean => v === null || v === undefined || typeof v === 'string';

/** 导入文件是外部输入：先完整验证结构和引用，再允许替换现有存档。旧档可选字段保持兼容。 */
export function validPortableSave(value: unknown): value is SaveData {
    if (!object(value) || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) { return false; }
    const { player: p, progress: g, inventory: inv, weapons, skills, settings, records } = value;
    if (![p, g, inv, weapons, skills, settings, records].every(object)) { return false; }
    // 单独收窄，避免把未经校验的 JSON 强转成领域类型。
    if (!object(p) || !object(g) || !object(inv) || !object(weapons) || !object(skills) || !object(settings) || !object(records)) { return false; }
    if (!number(p.hpMax, 100, 200) || !number(p.hp, 0, p.hpMax) || !number(p.spMax, 50, 150)
        || !number(p.sp, 0, p.spMax) || !integer(p.coins, 0, 99999) || !integer(p.skillPoints, 0, 42) || !object(p.materials)) { return false; }
    if (!Object.entries(p.materials).every(([id, count]) => ITEMS.some(i => i.id === id && i.category === 'material') && integer(count))) { return false; }
    if (!strings(g.unlockedLevels) || g.unlockedLevels.length === 0
        || !g.unlockedLevels.every((id, i) => id === LEVEL_ORDER[i]) || !strings(g.clearedLevels)
        || !g.clearedLevels.every(id => (g.unlockedLevels as string[]).includes(id))
        || !strings(g.collectedShards) || !g.collectedShards.every(id => LEVEL_ORDER.some(l => ['a', 'b', 'c'].some(s => id === `${l}-${s}`)))
        || typeof g.tutorialDone !== 'boolean' || !nullableString(g.currentLevelId) || !nullableString(g.lastCheckpointId)) { return false; }
    if (typeof g.currentLevelId === 'string' && !g.unlockedLevels.includes(g.currentLevelId)) { return false; }
    if (g.clearCounts !== undefined && (!object(g.clearCounts) || !Object.entries(g.clearCounts)
        .every(([id, count]) => LEVEL_ORDER.includes(id) && integer(count)))) { return false; }
    if (g.runRewards !== undefined && (!object(g.runRewards) || !Object.entries(g.runRewards)
        .every(([id, keys]) => LEVEL_ORDER.includes(id) && strings(keys) && keys.length <= 10000
            && keys.every(key => key.length > 0 && key.length <= 200)))) { return false; }
    if (g.coinRemainders !== undefined && (!object(g.coinRemainders) || !Object.entries(g.coinRemainders)
        .every(([id, count]) => LEVEL_ORDER.includes(id) && integer(count, 0, 99)))) { return false; }
    if (g.openedChests !== undefined && (!strings(g.openedChests)
        || !g.openedChests.every(id => LEVEL_ORDER.some(l => id.startsWith(`${l}:`) && id.length > l.length + 1)))) { return false; }
    if (inv.capacity !== 20 || !Array.isArray(inv.slots) || inv.slots.length > 20 || !object(inv.equipped)) { return false; }
    const slots = new Set<number>();
    for (const slot of inv.slots) {
        if (!object(slot) || !integer(slot.slot, 0, 19) || slots.has(slot.slot) || typeof slot.itemId !== 'string') { return false; }
        const item = ITEMS.find(i => i.id === slot.itemId);
        if (!item || !integer(slot.count, 1, item.stackMax) || !nullableString(slot.instanceKey)) { return false; }
        slots.add(slot.slot);
    }
    if (![inv.equipped.main, inv.equipped.sub].every(id => id === null || WEAPONS.some(w => w.id === id))) { return false; }
    if (!Object.entries(weapons).every(([key, v]) => WEAPONS.some(w => w.id === key.split('#')[0])
        && object(v) && integer(v.level, 1, 5))) { return false; }
    if (!strings(skills.unlocked) || !skills.unlocked.every(id => SKILLS.some(s => s.id === id))
        || !Array.isArray(skills.loadout) || skills.loadout.length !== 4
        || !skills.loadout.every(id => id === null || (skills.unlocked as string[]).includes(id) && SKILLS.some(s => s.id === id && s.kind === 'active'))) { return false; }
    if ([g.unlockedLevels, g.clearedLevels, g.collectedShards, skills.unlocked].some(list => new Set(list).size !== list.length)) { return false; }
    const learned = skills.unlocked.map(id => SKILLS.find(s => s.id === id)!);
    if (learned.some(s => s.prerequisiteId !== null && !(skills.unlocked as string[]).includes(s.prerequisiteId))) { return false; }
    const earned = g.collectedShards.length + g.clearedLevels.filter(id => id.endsWith('-4')).length * 2;
    const spent = learned.reduce((sum, skill) => sum + skill.skpCost, 0);
    if (earned < spent || p.skillPoints !== earned - spent) { return false; }
    if (!['masterVolume', 'musicVolume', 'sfxVolume'].every(k => number(settings[k], 0, 100))
        || typeof settings.screenShake !== 'boolean' || typeof settings.fullscreen !== 'boolean') { return false; }
    if (settings.keymap !== null && (!object(settings.keymap) || !Object.values(settings.keymap).every(v => typeof v === 'string' && v.length <= 40))) { return false; }
    if (!object(records.bestTimeSec) || !object(records.bestShards)
        || !Object.entries(records.bestTimeSec).every(([id, t]) => LEVEL_ORDER.includes(id) && number(t))
        || !Object.entries(records.bestShards).every(([id, n]) => LEVEL_ORDER.includes(id) && integer(n, 0, 3))
        || !['totalDeaths', 'totalKills', 'totalPlaySec'].every(k => number(records[k]))) { return false; }
    return true;
}
