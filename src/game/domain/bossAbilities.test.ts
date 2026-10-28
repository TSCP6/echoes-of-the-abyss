import { describe, expect, it } from 'vitest';
import type { BossSkillDef } from './types';
import { ENEMIES } from '../data/enemies';
import { BossAbilityField, abilityOverlaps, type BossCastContext } from './bossAbilities';

const context = (bossId = 'enm_boss_guardian'): BossCastContext => ({
    bossId, phase: 0, direction: -1, origin: { x: 700, y: 776 }, target: { x: 400, y: 768 },
    bodyWidth: 80, arena: { x: 100, y: 0, width: 1280, height: 800 }
});
const skill = (kind: BossSkillDef['kind'], params = {}): BossSkillDef => ({
    kind, damage: 20, cooldownSec: 2, params: { windupSec: 0.8, activeSec: 0.3, recoverySec: 1, ...params }
});
function advance(field: BossAbilityField, seconds: number, minions = 0) {
    const summons = [];
    for (let t = 0; t < seconds - 0.00001; t += 1 / 60) { summons.push(...field.tick(Math.min(1 / 60, seconds - t), undefined, undefined, minions + summons.length)); }
    return summons;
}

describe('三个 Boss 的独立技能', () => {
    it('蛛网快照锁定玩家平台顶边，落地后预警与减速范围一致', () => {
        const f = new BossAbilityField();
        const c = { ...context('enm_boss_spider'), targetSurface: { x: 300, y: 560, width: 240, height: 32 } };
        f.begin(skill('spiderWeb', { width: 150 }), c);
        expect(f.snapshot.zones[0].rect).toEqual({ x: 325, y: 548, width: 150, height: 12 });
        c.targetSurface.y = 800;
        c.target.x = 1100;
        advance(f, 0.81);
        expect(f.snapshot.webs[0].rect).toEqual({ x: 325, y: 548, width: 150, height: 12 });
        expect(f.slowFactor({ x: 389, y: 516, width: 22, height: 44 })).toBe(0.65);
        expect(f.slowFactor({ x: 389, y: 756, width: 22, height: 44 })).toBe(1);
    });
    it('蛛网在平台边界内裁切，蛛卵夹击目标并在原平台孵化', () => {
        const c = { ...context('enm_boss_spider'), targetSurface: { x: 300, y: 560, width: 240, height: 32 } };
        c.target.x = 310;
        const web = new BossAbilityField();
        web.begin(skill('spiderWeb', { width: 150 }), c);
        expect(web.snapshot.zones[0].rect).toEqual({ x: 300, y: 548, width: 150, height: 12 });
        c.target.x = 420;
        const eggs = new BossAbilityField();
        eggs.begin(skill('spiderEggs', { count: 2, hatchSec: 3 }), c);
        const warned = eggs.snapshot.zones.map(z => ({ ...z.rect }));
        expect(warned).toEqual([
            { x: 300, y: 518, width: 36, height: 42 },
            { x: 504, y: 518, width: 36, height: 42 }
        ]);
        advance(eggs, 0.81);
        expect(eggs.snapshot.eggs.map(e => e.rect)).toEqual(warned);
        expect(advance(eggs, 3.1)).toEqual([{ x: 318, y: 536 }, { x: 522, y: 536 }]);
    });
    it('窄平台的蛛卵不会因目标贴边而重叠或越界', () => {
        const c = { ...context('enm_boss_spider'), targetSurface: { x: 300, y: 560, width: 100, height: 32 } };
        c.target.x = 300;
        const f = new BossAbilityField();
        f.begin(skill('spiderEggs', { count: 2 }), c);
        advance(f, 0.81);
        expect(f.snapshot.eggs).toHaveLength(2);
        const [a, b] = f.snapshot.eggs;
        expect(abilityOverlaps(a.rect, b.rect)).toBe(false);
        expect(a.rect.x).toBeGreaterThanOrEqual(300);
        expect(b.rect.x + b.rect.width).toBeLessThanOrEqual(400);
    });
    it('俯袭保留260升高及0.3秒落下，伤害锁定平台且收招前落在顶边', () => {
        const f = new BossAbilityField();
        const c = { ...context('enm_boss_spider'), targetSurface: { x: 300, y: 560, width: 240, height: 32 } };
        f.begin(skill('spiderDrop', { liftHeight: 260, width: 140, activeSec: 0.4, recoverySec: 1.2 }), c);
        const warning = f.snapshot.zones[0];
        expect(warning.rect).toEqual({ x: 330, y: 488, width: 140, height: 72 });
        expect(warning.startsAt).toBeCloseTo(1.1);
        expect(warning.endsAt).toBeCloseTo(1.2);
        advance(f, 0.8);
        expect(f.snapshot.motion!.y).toBe(276);
        advance(f, 0.29);
        expect(f.damageZones).toHaveLength(0);
        advance(f, 0.01);
        expect(f.snapshot.motion!.y).toBeCloseTo(536);
        expect(f.damageZones[0].rect).toEqual({ x: 330, y: 488, width: 140, height: 72 });
    });
    it('俯袭跨过落地时刻的不规则帧仍提供精确平台落点，直到收招', () => {
        const f = new BossAbilityField();
        f.begin(skill('spiderDrop', { liftHeight: 260, activeSec: 0.4, recoverySec: 1.2 }), {
            ...context('enm_boss_spider'), targetSurface: { x: 300, y: 560, width: 240, height: 32 }
        });
        advance(f, 1.06);
        f.tick(0.08);
        expect(f.snapshot.motion).toMatchObject({ x: 400, y: 536 });
        f.tick(0.05);
        expect(f.snapshot.motion).toMatchObject({ x: 400, y: 536 });
        f.tick(0.02);
        expect(f.snapshot.motion).toBeNull();
    });
    it('换位的实际配置使横斩覆盖原目标，仍等标记后0.55秒出手', () => {
        const configured = ENEMIES.find(e => e.id === 'enm_boss_echo')!.phases[0].skills[0];
        const f = new BossAbilityField();
        const c = { ...context('enm_boss_echo'), targetSurface: { x: 250, y: 560, width: 400, height: 32 } };
        c.bodyWidth = 64;
        f.begin(configured, c);
        advance(f, 0.75);
        expect(f.snapshot.motion).toMatchObject({ x: 300, y: 536, facing: 1 });
        expect(f.damageZones).toHaveLength(0);
        advance(f, 0.54);
        expect(f.damageZones).toHaveLength(0);
        advance(f, 0.02);
        expect(abilityOverlaps(f.damageZones[0].rect, { x: 389, y: 516, width: 22, height: 44 })).toBe(true);
    });
    it.each([{ x: 205, direction: -1 as const, destination: 305 }, { x: 1275, direction: 1 as const, destination: 1175 }])(
        '边界换位不与玩家身体重叠，横斩覆盖目标$x', ({ x, direction, destination }) => {
            const f = new BossAbilityField();
            const c = context('enm_boss_echo');
            c.target.x = x; c.direction = direction; c.bodyWidth = 64;
            f.begin(skill('echoStep', { activeSec: 0.8 }), c);
            advance(f, 0.8);
            expect(f.snapshot.motion!.x).toBe(destination);
            expect(abilityOverlaps({ x: destination - 32, y: 732, width: 64, height: 68 },
                { x: x - 11, y: 756, width: 22, height: 44 })).toBe(false);
            advance(f, 0.56);
            expect(abilityOverlaps(f.damageZones[0].rect, { x: x - 11, y: 756, width: 22, height: 44 })).toBe(true);
        }
    );
    it('平台上的原地剑舞及回响沿Boss脚底出剑', () => {
        const c = context('enm_boss_echo');
        c.origin.y = 536;
        const dance = new BossAbilityField();
        dance.begin(skill('echoDance', { reach: 130 }), c);
        expect(dance.snapshot.zones.map(z => z.rect.y)).toEqual([496, 496, 432]);
        const replay = new BossAbilityField();
        replay.begin(skill('echoReplay', { reach: 130 }), c);
        expect(replay.snapshot.zones.map(z => z.rect.y)).toEqual([496, 496]);
    });
    it('窄平台中央换位保留脚底支撑且不与玩家重叠', () => {
        const f = new BossAbilityField();
        const c = { ...context('enm_boss_echo'), bodyWidth: 64,
            target: { x: 350, y: 536 }, targetSurface: { x: 300, y: 560, width: 100, height: 32 } };
        f.begin(skill('echoStep', { activeSec: 0.8 }), c);
        advance(f, 0.8);
        const x = f.snapshot.motion!.x;
        expect(abilityOverlaps({ x: x - 32, y: 492, width: 64, height: 68 },
            { x: 339, y: 516, width: 22, height: 44 })).toBe(false);
        expect(x + 32).toBeGreaterThan(300);
        expect(x - 32).toBeLessThan(400);
        advance(f, 0.56);
        expect(abilityOverlaps(f.damageZones[0].rect, { x: 339, y: 516, width: 22, height: 44 })).toBe(true);
    });
    it('重锤锁定面向和位置，预警未结束时没有伤害', () => {
        const f = new BossAbilityField();
        f.begin(skill('guardianHammer', { reach: 180 }), context());
        const z = f.snapshot.zones[0];
        expect(z.rect.x + z.rect.width).toBeLessThan(700);
        expect(f.damageZones).toHaveLength(0);
        advance(f, 0.79);
        expect(f.damageZones).toHaveLength(0);
        advance(f, 0.03);
        expect(f.damageZones[0].rect).toEqual(z.rect);
    });
    it('震波贴地向两侧传播，基础满跳高度高于波面', () => {
        const f = new BossAbilityField();
        f.begin(skill('guardianStomp', { waveSpeed: 230, waveHeight: 24 }), context());
        advance(f, 0.9);
        const before = f.damageZones.map(z => z.rect.x);
        expect(before).toHaveLength(2);
        advance(f, 0.3);
        const after = f.damageZones.map(z => z.rect.x);
        expect(after[0]).toBeLessThan(before[0]);
        expect(after[1]).toBeGreaterThan(before[1]);
        expect(f.damageZones.every(z => z.rect.y === 776 && z.rect.height === 24)).toBe(true);
    });
    it('守卫踏地为高台提供固定台面共振，充分预告后跳起可躲', () => {
        const f = new BossAbilityField();
        const c = { ...context(), target: { x: 200, y: 536 },
            targetSurface: { x: 50, y: 560, width: 300, height: 32 } };
        f.begin(skill('guardianStomp', { windupSec: 0.9, waveSpeed: 230, waveHeight: 24 }), c);
        const waves = f.snapshot.zones.filter(z => z.kind === 'wave');
        expect(waves).toHaveLength(2);
        expect(waves.map(z => z.rect)).toEqual([
            { x: 612, y: 776, width: 48, height: 24 },
            { x: 740, y: 776, width: 48, height: 24 }
        ]);
        expect(waves.every(z => z.startsAt === 0.9 && z.damage === 20)).toBe(true);
        const resonance = f.snapshot.zones.find(z => z.kind === 'hammer')!;
        expect(resonance).toMatchObject({ rect: { x: 100, y: 536, width: 250, height: 24 },
            announcedAt: 0, damage: 20, label: '台面共振 · 跳起避开震动' });
        expect(resonance.startsAt).toBeCloseTo(1.35);
        expect(resonance.endsAt).toBeCloseTo(1.6);
        c.target.x = 1200;
        c.targetSurface.x = 1100;
        advance(f, 1.34);
        expect(f.damageZones.some(z => z.kind === 'hammer')).toBe(false);
        advance(f, 0.02);
        const active = f.damageZones.find(z => z.kind === 'hammer')!;
        expect(active.rect).toEqual({ x: 100, y: 536, width: 250, height: 24 });
        expect(abilityOverlaps(active.rect, { x: 189, y: 516, width: 22, height: 44 })).toBe(true);
        expect(abilityOverlaps(active.rect, { x: 189, y: 480, width: 22, height: 44 })).toBe(false);
        advance(f, 0.25);
        expect(f.damageZones.some(z => z.kind === 'hammer')).toBe(false);
    });
    it.each([
        { surface: undefined, width: 0 },
        { surface: { x: 300, y: 800, width: 200, height: 32 }, width: 0 },
        { surface: { x: 300, y: 768, width: 200, height: 32 }, width: 0 },
        { surface: { x: 1300, y: 767, width: 300, height: 32 }, width: 80 },
        { surface: { x: 1400, y: 560, width: 100, height: 32 }, width: 0 }
    ])('台面共振仅覆盖高于地面32px且位于战场内的平台 $surface', ({ surface, width }) => {
        const f = new BossAbilityField();
        f.begin(skill('guardianStomp'), { ...context(), targetSurface: surface });
        expect(f.snapshot.zones.filter(z => z.kind === 'wave')).toHaveLength(2);
        const resonance = f.snapshot.zones.filter(z => z.kind === 'hammer');
        expect(resonance).toHaveLength(width > 0 ? 1 : 0);
        if (width > 0) expect(resonance[0].rect).toEqual({ x: 1300, y: 743, width: 80, height: 24 });
    });
    it('蛛网只减速脚边，最多两片，并保留场地通道', () => {
        const f = new BossAbilityField();
        const c = context('enm_boss_spider');
        for (let i = 0; i < 4; i++) { f.begin(skill('spiderWeb', { width: 150, durationSec: 5, slowFactor: 0.65 }), c); advance(f, 0.81); }
        expect(f.snapshot.webs.length).toBeLessThanOrEqual(2);
        const web = f.snapshot.webs[0];
        expect(f.slowFactor({ ...web.rect, y: 756, height: 44 })).toBe(0.65);
        expect(f.slowFactor({ ...web.rect, y: 600, height: 44 })).toBe(1);
        expect(f.snapshot.webs.reduce((a, w) => a + w.rect.width, 0)).toBeLessThan(c.arena.width);
    });
    it('蛛卵可以提前打碎；卵和孵化物分别有数量上限', () => {
        const f = new BossAbilityField();
        f.begin(skill('spiderEggs', { count: 2, hatchSec: 3 }), context('enm_boss_spider'));
        expect(f.snapshot.zones.filter(z => z.kind === 'egg')).toHaveLength(2);
        advance(f, 0.81);
        expect(f.snapshot.eggs).toHaveLength(2);
        const id = f.snapshot.eggs[0].id;
        f.hitEgg(id, 12);
        expect(f.snapshot.eggs[0].hp).toBe(6);
        f.hitEgg(id, 12);
        expect(f.snapshot.eggs).toHaveLength(1);
        expect(advance(f, 3.1, 2)).toHaveLength(1);
        f.begin(skill('spiderEggs', { count: 8, hatchSec: 0.1 }), context('enm_boss_spider'));
        advance(f, 0.81, 3);
        expect(f.snapshot.eggs.length).toBeLessThanOrEqual(2);
        expect(advance(f, 0.5, 3)).toHaveLength(0);
    });
    it('俯袭与换位锁定目标，换位本身没有伤害', () => {
        const f = new BossAbilityField();
        f.begin(skill('spiderDrop', { liftHeight: 260, width: 140 }), context('enm_boss_spider'));
        advance(f, 0.6);
        expect(f.snapshot.motion!.y).toBeLessThan(600);
        expect(f.snapshot.zones.find(z => z.kind === 'drop')!.rect.x).toBe(330);
        expect(f.damageZones).toHaveLength(0);
        const e = new BossAbilityField();
        e.begin(skill('echoStep', { shiftDistance: 180, activeSec: 0.8 }), context('enm_boss_echo'));
        advance(e, 0.85);
        expect(e.snapshot.motion!.x).toBe(220);
        expect(e.damageZones).toHaveLength(0);
        advance(e, 0.6);
        expect(e.damageZones.some(z => z.kind === 'slash')).toBe(true);
    });
    it('剑舞分三次判定，延迟剑痕固定且同一时间最多一道待触发', () => {
        const f = new BossAbilityField();
        f.begin(skill('echoDance', { activeSec: 1.85, reach: 130 }), context('enm_boss_echo'));
        const slashes = f.snapshot.zones.filter(z => z.kind === 'slash');
        expect(slashes).toHaveLength(3);
        expect(slashes[2].startsAt - slashes[1].startsAt).toBeGreaterThan(slashes[1].startsAt - slashes[0].startsAt);
        f.clear();
        f.begin(skill('echoReplay', { echoDelaySec: 0.95 }), context('enm_boss_echo'));
        const echo = f.snapshot.zones.find(z => z.kind === 'echo')!;
        const rect = { ...echo.rect };
        advance(f, 0.9);
        expect(f.damageZones.some(z => z.kind === 'echo')).toBe(false);
        advance(f, 0.9);
        expect(f.damageZones.find(z => z.kind === 'echo')!.rect).toEqual(rect);
    });
    it('重试或阶段取消清空攻击、蛛网、卵和动作，恢复正常速度', () => {
        const f = new BossAbilityField();
        f.begin(skill('spiderEggs'), context('enm_boss_spider')); advance(f, 0.9);
        f.clear();
        expect(f.snapshot.zones).toHaveLength(0);
        expect(f.snapshot.eggs).toHaveLength(0);
        expect(f.snapshot.webs).toHaveLength(0);
        expect(f.snapshot.motion).toBe(null);
        expect(f.slowFactor({ x: 400, y: 756, width: 22, height: 44 })).toBe(1);
    });
});
