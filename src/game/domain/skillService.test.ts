/**
 * TT-01：SkillService 单测（FR-07 规则 4/5/6/8 + AT-23~26）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SkillService } from './skillService';
import { validateAll, markValidated } from './configRegistry';
import { resourceSystem } from './resourceSystem';
import { economyService } from './economyService';
beforeEach(() => {
    const r = validateAll();
    if (!r.ok) { throw new Error('config invalid'); }
    markValidated();
});

describe('SkillService（FR-07）', () => {
    let sk: SkillService;
    beforeEach(() => {
        sk = new SkillService();
        resourceSystem.fromSnapshot({ hp: 100, hpMax: 100, sp: 50, spMax: 50 });
    });

    it('前置未解锁拒绝且 SKP 不变（AT-25）', () => {
        sk.grantShardSkp(); // 1 SKP
        const r = sk.unlock('sk_whirlwind'); // 前置 sk_blade_focus
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('PREREQ_LOCKED'); }
        expect(sk.skpBalance).toBe(1);
    });

    it('SKP 不足拒绝（AT-23 语义同源）', () => {
        const r = sk.unlock('sk_blade_focus'); // 需 2，现有 0
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('SKP_INSUFFICIENT'); }
    });

    it('解锁成功扣 SKP + 事件语义（remainingSkp）', () => {
        sk.grantShardSkp();
        sk.grantShardSkp();
        expect(sk.unlock('sk_blade_focus').ok).toBe(true);
        expect(sk.skpBalance).toBe(0);
        expect(sk.getTreeSnapshot().nodes.find((n) => n.id === 'sk_blade_focus')?.state).toBe('unlocked');
        expect(sk.getTreeSnapshot().nodes.find((n) => n.id === 'sk_whirlwind')?.state).toBe('available');
    });

    it('重复解锁拒绝', () => {
        sk.grantShardSkp();
        sk.grantShardSkp();
        sk.unlock('sk_blade_focus');
        const r = sk.unlock('sk_blade_focus');
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('ALREADY_UNLOCKED'); }
    });

    it('SP 不足拒放且不扣（AT-23）', () => {
        sk.grantShardSkp();
        sk.grantShardSkp();
        sk.unlock('sk_blade_focus');
        sk.grantShardSkp();
        sk.grantShardSkp();
        sk.grantShardSkp();
        sk.unlock('sk_whirlwind'); // 3 SKP
        resourceSystem.spendSp(40); // sp=10 < 20
        const r = sk.tryCast('sk_whirlwind');
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('SP_INSUFFICIENT'); }
        expect(resourceSystem.getSnapshot().sp).toBe(10);
    });

    it('释放成功扣 SP + 冷却（AT-24 前置）', () => {
        for (let i = 0; i < 5; i++) { sk.grantShardSkp(); }
        sk.unlock('sk_blade_focus');
        sk.unlock('sk_whirlwind');
        const r = sk.tryCast('sk_whirlwind');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.spCost).toBe(20);
            expect(r.value.effect.damage).toBe(25);
            expect(r.value.effect.radius).toBe(80);
        }
        expect(resourceSystem.getSnapshot().sp).toBe(30);
        expect(sk.getCooldownLeft('sk_whirlwind')).toBe(6);
        const again = sk.tryCast('sk_whirlwind');
        expect(again.ok).toBe(false);
        if (!again.ok) { expect(again.code).toBe('ON_COOLDOWN'); }
    });

    it('冷却随 tick 递减到 0', () => {
        for (let i = 0; i < 5; i++) { sk.grantShardSkp(); }
        sk.unlock('sk_blade_focus');
        sk.unlock('sk_whirlwind');
        sk.tryCast('sk_whirlwind');
        sk.tickCooldowns(6.1);
        expect(sk.getCooldownLeft('sk_whirlwind')).toBe(0);
    });

    it('loadout 装备与替换不退 SKP（FR-07 规则 6/边界）', () => {
        for (let i = 0; i < 7; i++) { sk.grantShardSkp(); } // 2+3+2 = 7 SKP
        sk.unlock('sk_blade_focus');
        sk.unlock('sk_whirlwind');
        expect(sk.equip('sk_whirlwind', 0).ok).toBe(true);
        expect(sk.getLoadout()[0]).toBe('sk_whirlwind');
        // 替换到同槽
        sk.unlock('sk_dash'); // ruin 分支无前置
        expect(sk.equip('sk_dash', 0).ok).toBe(true);
        expect(sk.getLoadout()[0]).toBe('sk_dash');
        expect(sk.skpBalance).toBe(0); // 5 earned - 2 - 3 = 0，替换不退还
    });

    it('被动技能不入栏', () => {
        sk.grantShardSkp();
        sk.grantShardSkp();
        sk.unlock('sk_blade_focus');
        const r = sk.equip('sk_blade_focus', 0);
        expect(r.ok).toBe(false);
    });

    it('skpObtainableLeft 支撑取舍提示（AT-26）', () => {
        expect(sk.getTreeSnapshot().skpObtainableLeft).toBe(42);
        sk.grantShardSkp();
        expect(sk.getTreeSnapshot().skpObtainableLeft).toBe(41);
    });

    it('洗点 200 金币返还（FR-07 规则 8）', () => {
        for (let i = 0; i < 5; i++) { sk.grantShardSkp(); }
        sk.unlock('sk_blade_focus');
        sk.unlock('sk_whirlwind');
        expect(sk.resetBuild().ok).toBe(false); // 无金币
        economyService.addCoins(200);
        expect(sk.resetBuild().ok).toBe(true);
        expect(sk.skpBalance).toBe(5); // 已用 5 SKP 全部返还
        expect(economyService.getCoins()).toBe(0);
    });
});
