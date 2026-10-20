/**
 * MOD-15 SkillService（领域层，IF-M05）—— FR-07 全部规则。
 * 21 节点三分支拓扑（ConfigRegistry.skills()，prerequisiteId 森林）；
 * unlock：SKP 校验 + 前置校验（AT-25）；equip：loadout ≤4 替换不退 SKP（FR-07 边界）；
 * tryCast：决策与执行分离（4.3.5）——领域判 SP/冷却产出 CastDecision，Phaser 执行；
 * 冷却以游戏时钟递减（tickCooldowns，暂停自停，EX-05）；洗点 200 金币返还（FR-07 规则 8 子项）。
 * SKP 余额 = 累计获得 - 累计消耗；skpObtainableLeft 支撑 AT-26"剩余可获点数"。
 */
import { ok, fail, type Result } from './result';
import type { SkillDef, SkillEffect } from './types';
import type { SaveSkillsSection } from './saveSchema';
import { ConfigRegistry } from './configRegistry';
import { economyService } from './economyService';
import { resourceSystem } from './resourceSystem';
import { emitEvent } from '../events';

export type SkillNodeState = 'unlocked' | 'available' | 'locked';

export interface TreeSnapshot {
    nodes: Array<{ id: string; state: SkillNodeState }>;
    skpBalance: number;
    skpObtainableLeft: number;
    loadout: (string | null)[];
}

export interface CastDecision {
    skillId: string;
    spCost: number;
    effect: SkillEffect;
    durationMs: number;
}

const SKP_OBTAINABLE = 42; // 附录 A：碎片 36 + Boss 6

export class SkillService {
    private unlocked = new Set<string>();
    private skpEarned = 0;
    private skpSpent = 0;
    private loadout: (string | null)[] = [null, null, null, null];
    private cooldowns = new Map<string, number>();

    get skpBalance(): number { return this.skpEarned - this.skpSpent; }

    /** 碎片兑换（ProgressService 采集时调用，1 枚 = 1 SKP） */
    grantShardSkp(): void { this.skpEarned += 1; }
    /** Boss 首通奖励（附录 A：各 2 点） */
    grantBossSkp(n: number): void { this.skpEarned += n; }

    getTreeSnapshot(): Readonly<TreeSnapshot> {
        const defs = ConfigRegistry.skills();
        const nodes = Object.values(defs).map((d) => ({ id: d.id, state: this.nodeState(d) }));
        return {
            nodes,
            skpBalance: this.skpBalance,
            skpObtainableLeft: Math.max(0, SKP_OBTAINABLE - this.skpEarned),
            loadout: [...this.loadout]
        };
    }

    private nodeState(d: SkillDef): SkillNodeState {
        if (this.unlocked.has(d.id)) { return 'unlocked'; }
        if (d.prerequisiteId === null || this.unlocked.has(d.prerequisiteId)) { return 'available'; }
        return 'locked';
    }

    /** FR-07 规则 5：前置未解锁拒绝（AT-25）；SKP 不足拒绝 */
    unlock(skillId: string): Result<void, 'SKP_INSUFFICIENT' | 'PREREQ_LOCKED' | 'ALREADY_UNLOCKED'> {
        const def = ConfigRegistry.skills()[skillId];
        if (def === undefined) { return fail('PREREQ_LOCKED', `未知技能 ${skillId}`); }
        if (this.unlocked.has(skillId)) { return fail('ALREADY_UNLOCKED', '已解锁'); }
        if (def.prerequisiteId !== null && !this.unlocked.has(def.prerequisiteId)) {
            return fail('PREREQ_LOCKED', `需先解锁 ${def.prerequisiteId}`);
        }
        if (this.skpBalance < def.skpCost) {
            return fail('SKP_INSUFFICIENT', `SKP 不足：需 ${def.skpCost}，现有 ${this.skpBalance}`);
        }
        this.skpSpent += def.skpCost;
        this.unlocked.add(skillId);
        emitEvent('skill:unlocked', { skillId, remainingSkp: this.skpBalance });
        return ok(undefined);
    }

    /** FR-07 规则 6：loadout ≤4；替换不退 SKP */
    equip(skillId: string, slot: 0 | 1 | 2 | 3): Result<void, 'LOADOUT_FULL' | 'PREREQ_LOCKED'> {
        if (!this.unlocked.has(skillId)) { return fail('PREREQ_LOCKED', '未解锁'); }
        const def = ConfigRegistry.skills()[skillId];
        if (def === undefined || def.kind !== 'active') { return fail('PREREQ_LOCKED', '被动技能不入栏'); }
        const existing = this.loadout.indexOf(skillId);
        if (existing >= 0) { this.loadout[existing] = null; }
        this.loadout[slot] = skillId;
        return ok(undefined);
    }

    unequip(slot: 0 | 1 | 2 | 3): void { this.loadout[slot] = null; }

    getLoadout(): ReadonlyArray<string | null> { return this.loadout; }

    /** 决策与执行分离（4.3.5）：成功即扣 SP、启动冷却 */
    tryCast(skillId: string): Result<CastDecision, 'SP_INSUFFICIENT' | 'ON_COOLDOWN' | 'NOT_UNLOCKED'> {
        if (!this.unlocked.has(skillId)) { return fail('NOT_UNLOCKED', '未解锁'); }
        const left = this.cooldowns.get(skillId) ?? 0;
        if (left > 0) { return fail('ON_COOLDOWN', `冷却中 ${left.toFixed(1)}s`); }
        const def = ConfigRegistry.skills()[skillId];
        if (def === undefined) { return fail('NOT_UNLOCKED', '未知技能'); }
        const spend = resourceSystem.spendSp(def.spCost);
        if (!spend.ok) { return fail('SP_INSUFFICIENT', spend.message); }
        this.cooldowns.set(skillId, def.cooldown);
        return ok({ skillId, spCost: def.spCost, effect: def.effect, durationMs: 300 });
    }

    getCooldownLeft(skillId: string): number {
        return Math.max(0, this.cooldowns.get(skillId) ?? 0);
    }

    /** 管线阶段 8：冷却递减（游戏时钟，暂停自停） */
    tickCooldowns(dt: number): void {
        for (const [id, left] of this.cooldowns) {
            const next = left - dt;
            if (next <= 0) { this.cooldowns.delete(id); } else { this.cooldowns.set(id, next); }
        }
    }

    /** 被动聚合：HP/SP 上限加成与伤害百分比（CombatResolver skillFactor） */
    passiveBonuses(): { hp: number; sp: number; damagePct: number } {
        let hp = 0;
        let sp = 0;
        let pct = 0;
        for (const id of this.unlocked) {
            const def = ConfigRegistry.skills()[id];
            if (def === undefined || def.kind !== 'passive') { continue; }
            hp += def.passiveHpBonus ?? 0;
            sp += def.passiveSpBonus ?? 0;
            pct += def.effect.damagePct ?? 0;
        }
        return { hp, sp, damagePct: pct };
    }

    /** FR-07 规则 8 子项：洗点 200 金币返还全部已用 SKP */
    resetBuild(): Result<void, 'COINS_INSUFFICIENT'> {
        const spend = economyService.spend({ coins: 200 });
        if (!spend.ok) { return fail('COINS_INSUFFICIENT', '金币不足（需 200）'); }
        this.skpSpent = 0;
        this.unlocked.clear();
        this.loadout = [null, null, null, null];
        this.cooldowns.clear();
        return ok(undefined);
    }

    toSnapshot(): SaveSkillsSection {
        return { unlocked: [...this.unlocked], loadout: [...this.loadout] };
    }

    fromSnapshot(d: SaveSkillsSection): void {
        const defs = ConfigRegistry.skills();
        this.unlocked = new Set((d.unlocked ?? []).filter((id) => defs[id] !== undefined));
        this.skpSpent = [...this.unlocked].reduce((s, id) => s + (defs[id]?.skpCost ?? 0), 0);
        this.loadout = [0, 1, 2, 3].map((i) => {
            const id = d.loadout?.[i] ?? null;
            return id !== null && this.unlocked.has(id) ? id : null;
        });
        this.cooldowns.clear();
    }

    /** 读档后由 ProgressService 同步累计获得（碎片数 + Boss 首通×2） */
    syncEarned(earned: number): void { this.skpEarned = earned; }
}

/** 全局单例（ARCH-5：SKP 与已解锁技能唯一所有者） */
export const skillService = new SkillService();
