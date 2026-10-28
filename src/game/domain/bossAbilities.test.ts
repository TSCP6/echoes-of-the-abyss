import { describe, expect, it } from 'vitest';
import type { BossSkillDef } from './types';
import { BossAbilityField, type BossCastContext } from './bossAbilities';

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
