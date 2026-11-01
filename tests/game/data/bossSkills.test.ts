import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../../src/game/data/enemies';
import { validateAll } from '../../../src/game/domain/shared/configRegistry';
import type { BossSkillDef } from '../../../src/game/domain/shared/types';

const boss = (id: string) => ENEMIES.find(enemy => enemy.id === id)!;

function withSkill(skill: BossSkillDef, check: () => void): void {
    const skills = boss('enm_boss_guardian').phases[0].skills;
    const original = skills[0];
    skills[0] = skill;
    try { check(); } finally { skills[0] = original; }
}

function candidate(kind = 'guardianHammer', params: Record<string, number> = {}): BossSkillDef {
    return {
        kind: kind as BossSkillDef['kind'], damage: 22, cooldownSec: 2.4,
        params: { windupSec: 0.9, activeSec: 0.25, recoverySec: 1.1, reach: 180, ...params }
    };
}

describe('三个 Boss 独立招式配置', () => {
    it.each([
        { id: 'enm_boss_guardian', phases: [
            ['guardianHammer', 'guardianStomp'],
            ['guardianHammer', 'guardianStomp', 'charge'],
            ['guardianHammer', 'guardianStomp', 'charge']
        ] },
        { id: 'enm_boss_spider', phases: [
            ['spiderWeb', 'spiderDrop'],
            ['spiderWeb', 'spiderDrop', 'spiderEggs'],
            ['spiderWeb', 'spiderDrop', 'spiderEggs']
        ] },
        { id: 'enm_boss_echo', phases: [
            ['echoStep', 'echoDance'],
            ['echoStep', 'echoDance', 'echoReplay'],
            ['echoStep', 'echoDance', 'echoReplay']
        ] }
    ])('$id 按阶段提供独立招式，首阶段不提前加入第三招', ({ id, phases }) => {
        expect(boss(id).phases.map(phase => phase.skills.map(skill => skill.kind))).toEqual(phases);
    });

    it('保留当前血量、接触伤害和阶段保护，招式均有可读时序与适度冷却', () => {
        const actual = ['enm_boss_guardian', 'enm_boss_spider', 'enm_boss_echo'].map(boss);
        expect(actual.map(enemy => [enemy.hp, enemy.contactDamage])).toEqual([[600, 5], [900, 5], [1400, 5]]);
        for (const enemy of actual) {
            expect(enemy.phases.map(phase => phase.hpThreshold)).toEqual([1, 0.66, 0.33]);
            for (const phase of enemy.phases) {
                expect(phase.invincibleMs).toBe(1500);
                for (const skill of phase.skills) {
                    expect(skill.damage).toBeGreaterThanOrEqual(5);
                    expect(skill.damage).toBeLessThanOrEqual(30);
                    expect(skill.cooldownSec).toBeGreaterThanOrEqual(1.5);
                    expect(skill.cooldownSec).toBeLessThanOrEqual(3);
                    expect(skill.params.windupSec).toBeGreaterThanOrEqual(0.6);
                    expect(skill.params.windupSec).toBeLessThanOrEqual(1);
                    expect(skill.params.activeSec).toBeGreaterThan(0);
                    expect(skill.params.recoverySec).toBeGreaterThan(0);
                }
            }
        }
    });

    it.each([
        { kind: 'charge', params: { activeSec: 2.4, recoverySec: 1.4, distance: 1600 } },
        { kind: 'guardianHammer', params: { activeSec: 0.25, recoverySec: 1.1, reach: 180 } },
        { kind: 'guardianStomp', params: { activeSec: 0.3, recoverySec: 0.9, waveSpeed: 230, waveHeight: 24 } },
        { kind: 'spiderWeb', params: { activeSec: 0.25, recoverySec: 0.8, width: 150, durationSec: 5, slowFactor: 0.65 } },
        { kind: 'spiderEggs', params: { activeSec: 0.3, recoverySec: 0.8, count: 2, hatchSec: 3 } },
        { kind: 'spiderDrop', params: { activeSec: 0.4, recoverySec: 1.2, liftHeight: 260, width: 140 } },
        { kind: 'echoStep', params: { activeSec: 0.8, recoverySec: 0.7, shiftDistance: 100 } },
        { kind: 'echoDance', params: { activeSec: 1.85, recoverySec: 1, reach: 130 } },
        { kind: 'echoReplay', params: { activeSec: 0.25, recoverySec: 1.25, reach: 130, echoDelaySec: 0.95 } }
    ])('$kind 将招式时长和范围交给同一配置来源', ({ kind, params }) => {
        const skills = ENEMIES.flatMap(enemy => enemy.phases.flatMap(phase => phase.skills)).filter(skill => skill.kind === kind);
        expect(skills.length).toBeGreaterThan(0);
        for (const skill of skills) { expect(skill.params).toMatchObject(params); }
    });

    it('守卫第二、三阶段冲撞分别保留 0.8/0.7 秒前摇', () => {
        expect(boss('enm_boss_guardian').phases.slice(1).map(phase => phase.skills.find(skill => skill.kind === 'charge')?.params.windupSec))
            .toEqual([0.8, 0.7]);
    });
});

describe('Boss 技能配置闸门', () => {
    it('完整的新配置通过启动校验', () => {
        const result = validateAll();
        expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    });

    it.each(['windupSec', 'activeSec', 'recoverySec'])('缺少 %s 时拒绝启动', field => {
        const skill = candidate();
        delete skill.params[field];
        withSkill(skill, () => {
            expect(validateAll().errors).toEqual(expect.arrayContaining([
                expect.objectContaining({ table: 'enemies', field: `skill.params.${field}` })
            ]));
        });
    });

    it.each<{ kind: string; params: Record<string, number>; field: string }>([
        { kind: 'guardianHammer', params: { windupSec: 0.59 }, field: 'windupSec' },
        { kind: 'guardianHammer', params: { windupSec: 1.01 }, field: 'windupSec' },
        { kind: 'guardianHammer', params: { activeSec: 0 }, field: 'activeSec' },
        { kind: 'guardianHammer', params: { recoverySec: -1 }, field: 'recoverySec' },
        { kind: 'guardianHammer', params: { reach: 0 }, field: 'reach' },
        { kind: 'guardianStomp', params: { waveSpeed: Infinity, waveHeight: 24 }, field: 'waveSpeed' },
        { kind: 'guardianStomp', params: { waveSpeed: 230, waveHeight: 0 }, field: 'waveHeight' },
        { kind: 'charge', params: { distance: 0 }, field: 'distance' },
        { kind: 'spiderWeb', params: { width: 150, durationSec: 5, slowFactor: 0 }, field: 'slowFactor' },
        { kind: 'spiderWeb', params: { width: 0, durationSec: 5, slowFactor: 0.65 }, field: 'width' },
        { kind: 'spiderWeb', params: { width: 150, durationSec: -1, slowFactor: 0.65 }, field: 'durationSec' },
        { kind: 'spiderEggs', params: { count: 1.5, hatchSec: 3 }, field: 'count' },
        { kind: 'spiderEggs', params: { count: 3, hatchSec: 3 }, field: 'count' },
        { kind: 'spiderEggs', params: { count: 2, hatchSec: NaN }, field: 'hatchSec' },
        { kind: 'spiderDrop', params: { liftHeight: 0, width: 140 }, field: 'liftHeight' },
        { kind: 'echoStep', params: { shiftDistance: 0 }, field: 'shiftDistance' },
        { kind: 'echoDance', params: { reach: 0 }, field: 'reach' },
        { kind: 'echoReplay', params: { echoDelaySec: -1 }, field: 'echoDelaySec' }
    ])('$kind 的非法 $field 被配置校验拦截', ({ kind, params, field }) => {
        withSkill(candidate(kind, params), () => {
            expect(validateAll().errors).toEqual(expect.arrayContaining([
                expect.objectContaining({ table: 'enemies', field: `skill.params.${field}` })
            ]));
        });
    });

    it('未知技能枚举仍被拒绝，额外数值参数也不能带入非有限值', () => {
        withSkill(candidate('unsupported'), () => {
            expect(validateAll().errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'skill.kind' })]));
        });
        withSkill(candidate('guardianHammer', { extra: NaN }), () => {
            expect(validateAll().errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'skill.params.extra' })]));
        });
    });
});
