/**
 * MOD-23 ConfigRegistry（领域层，IF-M12 / DD-02）。
 * DR-01 八类配置表的唯一只读访问门面 + 启动时全量校验（V1~V6）。
 * fail-fast：validateAll() 通过前，get 系列抛 Error（E-2）；PreloaderScene 只调一次。
 * 校验失败 → Result CONFIG_INVALID + errors 清单（EX-03 错误页数据源）。
 * ARCH-7：本文件禁止 import 'phaser'。
 */
import { ok, fail, type Result } from './result';
import type {
    WeaponDef, EnemyDef, SkillDef, ItemDef, LevelDef,
    ShopGoodsDef, LootTableDef, PlayerDefaults
} from './types';
import { WEAPONS, INITIAL_WEAPONS, INITIAL_EQUIP } from '../data/weapons';
import { ENEMIES } from '../data/enemies';
import { SKILLS, SKP_TOTAL_COST } from '../data/skills';
import { ITEMS } from '../data/items';
import { LEVELS, LEVEL_ORDER, BOSS_SKP_REWARD } from '../data/levels';
import { GOODS } from '../data/goods';
import { LOOT_TABLES } from '../data/lootTables';
import { PLAYER_DEFAULTS, SKP_OBTAINABLE_TOTAL, SKP_FULL_UNLOCK_COST } from '../data/playerDefaults';

export interface ConfigValidationError {
    table: string;
    id: string;
    field: string;
    rule: string;
    actual: unknown;
}

// ---------- 校验辅助 ----------

function inRange(v: number, lo: number, hi: number): boolean {
    return Number.isFinite(v) && v >= lo && v <= hi;
}
function isInt(v: number): boolean {
    return Number.isFinite(v) && Number.isInteger(v);
}
function hasPrefix(id: string, prefix: string): boolean {
    return typeof id === 'string' && id.startsWith(prefix);
}

let errs: ConfigValidationError[] = [];
function push(table: string, id: string, field: string, rule: string, actual: unknown): void {
    errs.push({ table, id, field, rule, actual });
}
function checkRange(table: string, id: string, field: string, v: number, lo: number, hi: number): void {
    if (!inRange(v, lo, hi)) {
        push(table, id, field, `取值须在 [${lo}, ${hi}]`, v);
    }
}

// ---------- 逐表校验（V1~V6）----------

function validateWeapons(itemIdSet: Set<string>): void {
    const seen = new Set<string>();
    for (const w of WEAPONS) {
        if (!hasPrefix(w.id, 'wpn_')) { push('weapons', w.id, 'id', 'wpn_ 前缀', w.id); }
        if (seen.has(w.id)) { push('weapons', w.id, 'id', 'id 表内唯一', w.id); }
        seen.add(w.id);
        checkRange('weapons', w.id, 'baseDamage', w.baseDamage, 5, 60);
        checkRange('weapons', w.id, 'attackSpeed', w.attackSpeed, 0.5, 6.0);
        if (w.type === 'melee') {
            checkRange('weapons', w.id, 'range', w.range, 20, 80);
            if (w.projectileSpeed !== null) { push('weapons', w.id, 'projectileSpeed', '近战须为 null', w.projectileSpeed); }
            if (w.ammoItemId !== null) { push('weapons', w.id, 'ammoItemId', '近战须为 null', w.ammoItemId); }
        } else if (w.type === 'ranged') {
            checkRange('weapons', w.id, 'range', w.range, 200, 600);
            if (w.projectileSpeed === null || !inRange(w.projectileSpeed, 300, 800)) {
                push('weapons', w.id, 'projectileSpeed', '远程须 [300,800]', w.projectileSpeed);
            }
            if (w.ammoItemId === null || !itemIdSet.has(w.ammoItemId)) {
                push('weapons', w.id, 'ammoItemId', '远程须引用存在的 ItemDef（V3）', w.ammoItemId);
            }
        } else {
            push('weapons', w.id, 'type', '枚举 melee/ranged（V6）', w.type);
        }
        checkRange('weapons', w.id, 'hitboxSize.w', w.hitboxSize.w, 8, 120);
        checkRange('weapons', w.id, 'hitboxSize.h', w.hitboxSize.h, 8, 120);
        if (w.price !== null) { checkRange('weapons', w.id, 'price', w.price, 120, 300); }
    }
}

function validateEnemies(lootIdSet: Set<string>): void {
    const seen = new Set<string>();
    for (const e of ENEMIES) {
        if (!hasPrefix(e.id, 'enm_')) { push('enemies', e.id, 'id', 'enm_ 前缀', e.id); }
        if (seen.has(e.id)) { push('enemies', e.id, 'id', 'id 表内唯一', e.id); }
        seen.add(e.id);
        if (!['patrol', 'chaser', 'flyer', 'boss'].includes(e.kind)) {
            push('enemies', e.id, 'kind', '枚举 patrol/chaser/flyer/boss（V6）', e.kind);
        }
        checkRange('enemies', e.id, 'hp', e.hp, 20, 1400);
        if (!isInt(e.hp)) { push('enemies', e.id, 'hp', '须为整数', e.hp); }
        checkRange('enemies', e.id, 'contactDamage', e.contactDamage, 5, 30);
        if (!isInt(e.contactDamage)) { push('enemies', e.id, 'contactDamage', '须为整数', e.contactDamage); }
        checkRange('enemies', e.id, 'moveSpeed', e.moveSpeed, 40, 180);
        checkRange('enemies', e.id, 'detectRange', e.detectRange, 100, 300);
        const [cmin, cmax] = e.coinsDrop;
        checkRange('enemies', e.id, 'coinsDrop[0]', cmin, 0, 350);
        checkRange('enemies', e.id, 'coinsDrop[1]', cmax, 0, 350);
        if (cmin > cmax) { push('enemies', e.id, 'coinsDrop', 'min ≤ max', e.coinsDrop); }
        if (e.lootTableId !== null && !lootIdSet.has(e.lootTableId)) {
            push('enemies', e.id, 'lootTableId', '须引用存在的 LootTableDef（V3）', e.lootTableId);
        }
        checkRange('enemies', e.id, 'hurtboxSize.w', e.hurtboxSize.w, 8, 160);
        checkRange('enemies', e.id, 'hurtboxSize.h', e.hurtboxSize.h, 8, 160);
        if (e.kind === 'boss') {
            if (e.phases.length !== 3) { push('enemies', e.id, 'phases', 'Boss 须恰 3 阶段（V4）', e.phases.length); }
            for (const p of e.phases) {
                checkRange('enemies', e.id, 'phase.hpThreshold', p.hpThreshold, 0, 1);
                if (p.invincibleMs !== 1500) { push('enemies', e.id, 'phase.invincibleMs', '固定 1500', p.invincibleMs); }
                if (p.skills.length < 2 || p.skills.length > 3) {
                    push('enemies', e.id, 'phase.skills', '每阶段 2~3 技能', p.skills.length);
                }
                for (const s of p.skills) {
                    if (!['charge', 'summon', 'projectileSpread', 'arenaHazard'].includes(s.kind)) {
                        push('enemies', e.id, 'skill.kind', '枚举（V6）', s.kind);
                    }
                    checkRange('enemies', e.id, 'skill.damage', s.damage, 5, 30);
                    checkRange('enemies', e.id, 'skill.cooldownSec', s.cooldownSec, 0.5, 8);
                }
            }
        } else if (e.phases.length !== 0) {
            push('enemies', e.id, 'phases', '非 Boss 须为空数组', e.phases.length);
        }
    }
}

function validateSkills(): void {
    const byId = new Map<string, SkillDef>();
    const seen = new Set<string>();
    for (const s of SKILLS) {
        if (!hasPrefix(s.id, 'sk_')) { push('skills', s.id, 'id', 'sk_ 前缀', s.id); }
        if (seen.has(s.id)) { push('skills', s.id, 'id', 'id 表内唯一', s.id); }
        seen.add(s.id);
        byId.set(s.id, s);
        if (!['blade', 'bolt', 'ruin'].includes(s.branch)) {
            push('skills', s.id, 'branch', '枚举 blade/bolt/ruin（V6）', s.branch);
        }
        if (s.kind === 'active') {
            checkRange('skills', s.id, 'spCost', s.spCost, 8, 40);
            checkRange('skills', s.id, 'cooldown', s.cooldown, 0.5, 30);
        } else if (s.kind === 'passive') {
            if (s.spCost !== 0) { push('skills', s.id, 'spCost', '被动须 0', s.spCost); }
            if (s.cooldown !== 0) { push('skills', s.id, 'cooldown', '被动须 0', s.cooldown); }
        } else {
            push('skills', s.id, 'kind', '枚举 active/passive（V6）', s.kind);
        }
        checkRange('skills', s.id, 'skpCost', s.skpCost, 1, 4);
        if (!isInt(s.skpCost)) { push('skills', s.id, 'skpCost', '须为整数', s.skpCost); }
        const ef = s.effect;
        if (ef.damage !== undefined) { checkRange('skills', s.id, 'effect.damage', ef.damage, 5, 60); }
        if (ef.dashDistance !== undefined) { checkRange('skills', s.id, 'effect.dashDistance', ef.dashDistance, 60, 240); }
        if (ef.heal !== undefined) { checkRange('skills', s.id, 'effect.heal', ef.heal, 10, 50); }
    }
    for (const s of SKILLS) {
        if (s.prerequisiteId === null) { continue; }
        const pre = byId.get(s.prerequisiteId);
        if (!pre) {
            push('skills', s.id, 'prerequisiteId', '须指向存在的技能（V3）', s.prerequisiteId);
            continue;
        }
        if (pre.branch !== s.branch) {
            push('skills', s.id, 'prerequisiteId', '前置须同分支（V4）', `${pre.branch}≠${s.branch}`);
        }
    }
    for (const s of SKILLS) {
        let cursor: SkillDef | undefined = s;
        const visited = new Set<string>();
        let steps = 0;
        while (cursor && cursor.prerequisiteId !== null) {
            if (visited.has(cursor.id)) {
                push('skills', s.id, 'prerequisiteId', '前置链成环（V4）', cursor.id);
                break;
            }
            visited.add(cursor.id);
            cursor = byId.get(cursor.prerequisiteId);
            if (++steps > SKILLS.length) {
                push('skills', s.id, 'prerequisiteId', '前置链过长疑似成环（V4）', steps);
                break;
            }
        }
    }
    if (SKP_TOTAL_COST !== SKP_FULL_UNLOCK_COST) {
        push('skills', '*', 'skpCost', `全解锁须 ${SKP_FULL_UNLOCK_COST} SKP（V5）`, SKP_TOTAL_COST);
    }
}

function validateItems(): void {
    const seen = new Set<string>();
    for (const it of ITEMS) {
        if (!hasPrefix(it.id, 'itm_') && !hasPrefix(it.id, 'wpn_')) {
            push('items', it.id, 'id', 'itm_/wpn_ 前缀', it.id);
        }
        if (seen.has(it.id)) { push('items', it.id, 'id', 'id 表内唯一', it.id); }
        seen.add(it.id);
        if (!['weapon', 'consumable', 'material'].includes(it.category)) {
            push('items', it.id, 'category', '枚举 weapon/consumable/material（V6）', it.category);
        }
        const expectStack = it.category === 'weapon' ? 1 : 99;
        if (it.stackMax !== expectStack) {
            push('items', it.id, 'stackMax', `${it.category} 须 ${expectStack}`, it.stackMax);
        }
        if (it.name.length < 1 || it.name.length > 12) { push('items', it.id, 'name', '1~12 字符', it.name); }
        if (it.description.length > 40) { push('items', it.id, 'description', '≤40 字符', it.description); }
        checkRange('items', it.id, 'price', it.price, 5, 300);
        if (!isInt(it.price)) { push('items', it.id, 'price', '须为整数', it.price); }
        if (it.category === 'consumable' && !it.throwable) {
            const { hp, sp, fullHp } = it.effect;
            if (!fullHp && hp === undefined && sp === undefined) {
                push('items', it.id, 'effect', '非投掷消耗品须有回复或 fullHp', it.effect);
            }
            if (hp !== undefined) { checkRange('items', it.id, 'effect.hp', hp, 10, 60); }
            if (sp !== undefined) { checkRange('items', it.id, 'effect.sp', sp, 10, 60); }
        }
    }
}

function validateLevels(enemyIdSet: Set<string>): void {
    if (LEVELS.length !== 12) { push('levels', '*', 'length', '须恰 12 关（V4）', LEVELS.length); }
    const seen = new Set<string>();
    for (const lv of LEVELS) {
        if (!/^[1-3]-[1-4]$/.test(lv.id)) { push('levels', lv.id, 'id', '格式 场景-序号（V4）', lv.id); }
        if (seen.has(lv.id)) { push('levels', lv.id, 'id', 'id 表内唯一', lv.id); }
        seen.add(lv.id);
        checkRange('levels', lv.id, 'sceneId', lv.sceneId, 1, 3);
        if (lv.isBossLevel) {
            checkRange('levels', lv.id, 'targetTimeSec', lv.targetTimeSec, 240, 420);
            if (lv.bossId === null || !enemyIdSet.has(lv.bossId)) {
                push('levels', lv.id, 'bossId', 'Boss 关须引用存在的 EnemyDef（V3）', lv.bossId);
            }
        } else {
            checkRange('levels', lv.id, 'targetTimeSec', lv.targetTimeSec, 180, 300);
            if (lv.bossId !== null) { push('levels', lv.id, 'bossId', '常规关须为 null', lv.bossId); }
        }
        if (lv.shardIds.length !== 3) { push('levels', lv.id, 'shardIds', '须恰 3 枚（V4）', lv.shardIds.length); }
        if (new Set(lv.shardIds).size !== lv.shardIds.length) {
            push('levels', lv.id, 'shardIds', '3 枚须互异', lv.shardIds);
        }
    }
    for (let scene = 1; scene <= 3; scene++) {
        const boss = LEVELS.filter((l) => l.sceneId === scene).find((l) => l.isBossLevel);
        if (!boss || boss.id !== `${scene}-4`) {
            push('levels', `${scene}-4`, 'isBossLevel', '每场景第 4 关须为 Boss（V4）', boss?.id ?? null);
        }
    }
    if (LEVEL_ORDER.length !== LEVELS.length) {
        push('levels', '*', 'order', 'LEVEL_ORDER 长度须 = LEVELS', LEVEL_ORDER.length);
    }
}

function validateGoods(itemIdSet: Set<string>, weaponIdSet: Set<string>): void {
    const seen = new Set<string>();
    for (const g of GOODS) {
        if (seen.has(g.id)) { push('goods', g.id, 'id', 'id 表内唯一', g.id); }
        seen.add(g.id);
        checkRange('goods', g.id, 'price', g.price, 15, 300);
        if (!isInt(g.price)) { push('goods', g.id, 'price', '须为整数', g.price); }
        if (![1, 2, 3].includes(g.unlockScene)) {
            push('goods', g.id, 'unlockScene', '枚举 1/2/3（V6）', g.unlockScene);
        }
        if (g.stockLimit !== null && (!isInt(g.stockLimit) || g.stockLimit < 1)) {
            push('goods', g.id, 'stockLimit', 'null 或正整数', g.stockLimit);
        }
        const targetSet = g.refType === 'item' ? itemIdSet : weaponIdSet;
        if (!targetSet.has(g.refId)) {
            push('goods', g.id, 'refId', `refType=${g.refType} 须引用存在项（V3）`, g.refId);
        }
    }
}

function validateLootTables(itemIdSet: Set<string>): void {
    const seen = new Set<string>();
    for (const lt of LOOT_TABLES) {
        if (seen.has(lt.id)) { push('lootTables', lt.id, 'id', 'id 表内唯一', lt.id); }
        seen.add(lt.id);
        for (const en of lt.entries) {
            if (!itemIdSet.has(en.itemId)) {
                push('lootTables', lt.id, 'entries.itemId', '须引用存在的 ItemDef（V3）', en.itemId);
            }
            if (!isInt(en.weight) || en.weight < 0) { push('lootTables', lt.id, 'entries.weight', '须为非负整数', en.weight); }
            if (!isInt(en.countMin) || en.countMin < 0) { push('lootTables', lt.id, 'entries.countMin', '须为非负整数', en.countMin); }
            if (!isInt(en.countMax) || en.countMax < en.countMin) { push('lootTables', lt.id, 'entries.countMax', '须 ≥ countMin', en.countMax); }
        }
    }
}

function validateEconomyClosure(): void {
    if (SKP_OBTAINABLE_TOTAL !== 42) {
        push('economy', '*', 'skpObtainable', 'SKP 可得须 42（V5）', SKP_OBTAINABLE_TOTAL);
    }
    if (SKP_FULL_UNLOCK_COST !== 46) {
        push('economy', '*', 'skpFullUnlock', 'SKP 全解锁须 46（V5）', SKP_FULL_UNLOCK_COST);
    }
    for (const w of INITIAL_WEAPONS) {
        if (!WEAPONS.some((x) => x.id === w.itemId)) {
            push('economy', w.itemId, 'initialWeapon', '初始武器须在 WeaponDef 中', w.itemId);
        }
    }
    if (!WEAPONS.some((x) => x.id === INITIAL_EQUIP.main) || !WEAPONS.some((x) => x.id === INITIAL_EQUIP.sub)) {
        push('economy', '*', 'initialEquip', '初始装备须指向存在的武器', INITIAL_EQUIP);
    }
    const bossCount = LEVELS.filter((l) => l.isBossLevel).length;
    if (bossCount * BOSS_SKP_REWARD !== 6) {
        push('economy', '*', 'bossSkp', 'Boss SKP 合计须 6', bossCount * BOSS_SKP_REWARD);
    }
}

/** SRS 附录 A：实现期数值可在基线 ±20% 内调整（超出须走 9.3 变更流程） */
function within20(actual: number, baseline: number): boolean {
    return actual >= baseline * 0.8 - 1e-9 && actual <= baseline * 1.2 + 1e-9;
}
function validatePlayerDefaults(): void {
    const p = PLAYER_DEFAULTS;
    if (p.hp !== 100 || p.hpMax !== 100) { push('playerDefaults', '*', 'hp', '初始/上限 100', p.hp); }
    if (p.sp !== 50 || p.spMax !== 50) { push('playerDefaults', '*', 'sp', '初始/上限 50', p.sp); }
    if (p.collider.w !== 22 || p.collider.h !== 44) { push('playerDefaults', '*', 'collider', '22×44', p.collider); }
    if (!within20(p.walkSpeed, 210)) { push('playerDefaults', '*', 'walkSpeed', '基线 210 ±20%', p.walkSpeed); }
    if (!within20(p.jumpVelocity, 480)) { push('playerDefaults', '*', 'jumpVelocity', '基线 480 ±20%', p.jumpVelocity); }
    if (!within20(p.gravity, 1300)) { push('playerDefaults', '*', 'gravity', '基线 1300 ±20%', p.gravity); }
    if (p.coyoteMs !== 100) { push('playerDefaults', '*', 'coyoteMs', '100', p.coyoteMs); }
    if (p.jumpBufferMs !== 120) { push('playerDefaults', '*', 'jumpBufferMs', '120', p.jumpBufferMs); }
    if (p.iFrameMs !== 800) { push('playerDefaults', '*', 'iFrameMs', '800', p.iFrameMs); }
}

/**
 * 全量校验入口（DD-02 V1~V6）。任一失败 → CONFIG_INVALID + errors 清单。
 * 每次调用重置 errs，不持有跨调用状态（可重复单测）。
 */
export function validateAll(): Result<void, 'CONFIG_INVALID'> & { errors?: ConfigValidationError[] } {
    errs = [];

    const itemIdSet = new Set(ITEMS.map((i) => i.id));
    const weaponIdSet = new Set(WEAPONS.map((w) => w.id));
    const enemyIdSet = new Set(ENEMIES.map((e) => e.id));
    const lootIdSet = new Set(LOOT_TABLES.map((l) => l.id));

    validateWeapons(itemIdSet);
    validateEnemies(lootIdSet);
    validateSkills();
    validateItems();
    validateLevels(enemyIdSet);
    validateGoods(itemIdSet, weaponIdSet);
    validateLootTables(itemIdSet);
    validateEconomyClosure();
    validatePlayerDefaults();

    if (errs.length > 0) {
        const result = fail('CONFIG_INVALID', `配置校验失败：${errs.length} 项违规`) as
            Result<void, 'CONFIG_INVALID'> & { errors?: ConfigValidationError[] };
        result.errors = errs.slice();
        return result;
    }
    return ok(undefined);
}

// ---------- 只读访问门面（IF-M12）----------

let validated = false;

/** 由 PreloaderScene 在 validateAll 成功后调用，解锁 get 系列（fail-fast）。 */
export function markValidated(): void {
    validated = true;
}

function assertValidated(table: string): void {
    if (!validated) {
        throw new Error(`[ConfigRegistry] 配置未通过校验即读取 "${table}"（E-2 程序性错误）`);
    }
}

function toRecord<T extends { id: string }>(list: T[]): Readonly<Record<string, T>> {
    const rec: Record<string, T> = {};
    for (const item of list) { rec[item.id] = item; }
    return rec;
}

export const ConfigRegistry = {
    weapons(): Readonly<Record<string, WeaponDef>> { assertValidated('weapons'); return toRecord(WEAPONS); },
    enemies(): Readonly<Record<string, EnemyDef>> { assertValidated('enemies'); return toRecord(ENEMIES); },
    skills(): Readonly<Record<string, SkillDef>> { assertValidated('skills'); return toRecord(SKILLS); },
    items(): Readonly<Record<string, ItemDef>> { assertValidated('items'); return toRecord(ITEMS); },
    levels(): ReadonlyArray<LevelDef> { assertValidated('levels'); return LEVELS; },
    goods(): ReadonlyArray<ShopGoodsDef> { assertValidated('goods'); return GOODS; },
    lootTables(): Readonly<Record<string, LootTableDef>> { assertValidated('lootTables'); return toRecord(LOOT_TABLES); },
    playerDefaults(): Readonly<PlayerDefaults> { assertValidated('playerDefaults'); return PLAYER_DEFAULTS; },
    levelOrder(): ReadonlyArray<string> { assertValidated('levels'); return LEVEL_ORDER; },
    initialWeapons(): ReadonlyArray<{ itemId: string; level: number }> { assertValidated('weapons'); return INITIAL_WEAPONS; },
    initialEquip(): Readonly<{ main: string; sub: string }> { assertValidated('weapons'); return INITIAL_EQUIP; },
    bossSkpReward(): number { assertValidated('levels'); return BOSS_SKP_REWARD; }
};
