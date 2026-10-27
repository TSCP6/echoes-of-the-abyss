/**
 * MOD-13 ResourceSystem（领域层，IF-M03）—— FR-06 HP/SP 全部规则。
 * tick(dt) 仅由 LevelScene 管线阶段 8 调用（帧增量驱动，失焦自动暂停，EX-05）。
 * 上限钳制 hpMax≤200 / spMax≤150（FR-06 规则 1/2）；非法值 EX-09 钳制 + 去重警告。
 */
import { ok, fail, type Result } from './result';
import { warnThrottled } from './warn';
import { HP_MAX_CAP, SP_MAX_CAP, SP_REGEN_PER_SEC, SP_KILL_GAIN, OUT_OF_COMBAT_DELAY_SEC, BASE_HP_MAX, BASE_SP_MAX } from '../data/playerDefaults';
import type { ResourceSnapshot } from './types';
import type { SavePlayerSection } from './saveSchema';
export class ResourceSystem {
    private hp: number;
    private hpMax: number;
    private sp: number;
    private spMax: number;
    private outOfCombatTimer = OUT_OF_COMBAT_DELAY_SEC; // 初始视为脱战
    private lowHp = false;

    constructor(hp = BASE_HP_MAX, hpMax = BASE_HP_MAX, sp = BASE_SP_MAX, spMax = BASE_SP_MAX) {
        this.hp = this.clampFinite(hp, 0, hpMax, 'hp');
        this.hpMax = this.clampFinite(hpMax, 1, HP_MAX_CAP, 'hpMax');
        this.sp = this.clampFinite(sp, 0, spMax, 'sp');
        this.spMax = this.clampFinite(spMax, 1, SP_MAX_CAP, 'spMax');
        this.recomputeLowHp();
    }

    private clampFinite(v: number, lo: number, hi: number, field: string): number {
        if (!Number.isFinite(v)) {
            warnThrottled(`resource.${field}`, `${field} 非法值 ${v}，钳制到 [${lo},${hi}]`);
            return lo;
        }
        return Math.min(hi, Math.max(lo, v));
    }

    private recomputeLowHp(): void {
        this.lowHp = this.hp / this.hpMax < 0.3; // FR-06 规则 8
    }

    getSnapshot(): Readonly<ResourceSnapshot> {
        return {
            hp: this.hp, hpMax: this.hpMax, sp: this.sp, spMax: this.spMax,
            lowHp: this.lowHp, outOfCombat: this.outOfCombatTimer >= OUT_OF_COMBAT_DELAY_SEC
        };
    }

    /** FR-06：HP 钳制 [0,hpMax]；died = HP 归零（FR-06 规则 6 触发死亡流程由调用方编排） */
    applyDamage(amount: number): Result<{ hp: number; died: boolean }, 'INVALID_VALUE'> {
        if (!Number.isFinite(amount) || amount < 0) {
            warnThrottled('resource.damage', `伤害量非法 ${amount}，按 0 处理`);
            return fail('INVALID_VALUE', `伤害量非法：${amount}`);
        }
        this.hp = Math.max(0, Math.min(this.hpMax, this.hp - amount));
        this.notifyCombatEvent();
        this.recomputeLowHp();
        return ok({ hp: this.hp, died: this.hp <= 0 });
    }

    /** 超出上限丢弃（FR-06 边界） */
    heal(amount: number): { hp: number; overflow: number } {
        const safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
        if (safe !== amount) { warnThrottled('resource.heal', `回复量非法 ${amount}，按 0 处理`); }
        const before = this.hp;
        this.hp = Math.min(this.hpMax, this.hp + safe);
        this.recomputeLowHp();
        return { hp: this.hp, overflow: safe - (this.hp - before) };
    }

    restoreSp(amount: number): { sp: number; overflow: number } {
        const safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
        if (safe !== amount) { warnThrottled('resource.restoreSp', `SP 回复非法 ${amount}，按 0 处理`); }
        const before = this.sp;
        this.sp = Math.min(this.spMax, this.sp + safe);
        return { sp: this.sp, overflow: safe - (this.sp - before) };
    }

    spendSp(cost: number): Result<{ sp: number }, 'SP_INSUFFICIENT'> {
        if (!Number.isFinite(cost) || cost < 0) {
            warnThrottled('resource.spendSp', `SP 消耗非法 ${cost}`);
            return fail('SP_INSUFFICIENT', 'SP 消耗非法');
        }
        if (this.sp < cost) {
            return fail('SP_INSUFFICIENT', `SP 不足：需 ${cost}，现有 ${this.sp}`);
        }
        this.sp -= cost;
        this.notifyCombatEvent(); // 造成伤害类技能视为战斗事件
        return ok({ sp: this.sp });
    }

    /** FR-06 规则 5：击杀 +6 SP（不超上限） */
    notifyKill(): void {
        this.restoreSp(SP_KILL_GAIN);
    }

    /** FR-06 规则 4：重置脱战计时（造成或受到伤害） */
    notifyCombatEvent(): void {
        this.outOfCombatTimer = 0;
    }

    /** 技能被动上限加成，钳制 hpMax≤200 / spMax≤150 */
    setPassiveMaxBonus(hpBonus: number, spBonus: number): void {
        this.hpMax = Math.min(HP_MAX_CAP, BASE_HP_MAX + Math.max(0, hpBonus));
        this.spMax = Math.min(SP_MAX_CAP, BASE_SP_MAX + Math.max(0, spBonus));
        this.hp = Math.min(this.hp, this.hpMax);
        this.sp = Math.min(this.sp, this.spMax);
        this.recomputeLowHp();
    }

    /** 增量接口；技能树用绝对合计，避免读档重复叠加。 */
    applyPassiveMaxBonus(hpBonus: number, spBonus: number): void {
        this.hpMax = Math.min(HP_MAX_CAP, this.hpMax + Math.max(0, hpBonus));
        this.spMax = Math.min(SP_MAX_CAP, this.spMax + Math.max(0, spBonus));
        this.hp = Math.min(this.hp, this.hpMax);
        this.sp = Math.min(this.sp, this.spMax);
        this.recomputeLowHp();
    }

    /** FR-06 规则 3/4：脱战 3s 后 SP 以 4 点/s 回复；HP 不自然回复 */
    tick(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0) { return; }
        if (this.outOfCombatTimer < OUT_OF_COMBAT_DELAY_SEC) {
            this.outOfCombatTimer = Math.min(OUT_OF_COMBAT_DELAY_SEC, this.outOfCombatTimer + dt);
            return;
        }
        if (this.sp < this.spMax) {
            this.sp = Math.min(this.spMax, this.sp + SP_REGEN_PER_SEC * dt);
        }
    }

    /** 检查点重生：HP/SP 回满（FR-11 规则 7） */
    refill(): void {
        this.hp = this.hpMax;
        this.sp = this.spMax;
        this.outOfCombatTimer = OUT_OF_COMBAT_DELAY_SEC;
        this.recomputeLowHp();
    }

    toSnapshot(): Pick<SavePlayerSection, 'hp' | 'hpMax' | 'sp' | 'spMax'> {
        return { hp: this.hp, hpMax: this.hpMax, sp: this.sp, spMax: this.spMax };
    }

    fromSnapshot(d: Pick<SavePlayerSection, 'hp' | 'hpMax' | 'sp' | 'spMax'>): void {
        this.hpMax = this.clampFinite(d.hpMax, 1, HP_MAX_CAP, 'hpMax');
        this.spMax = this.clampFinite(d.spMax, 1, SP_MAX_CAP, 'spMax');
        this.hp = this.clampFinite(d.hp, 0, this.hpMax, 'hp');
        this.sp = this.clampFinite(d.sp, 0, this.spMax, 'sp');
        this.recomputeLowHp();
    }
}

/** 全局单例（ARCH-5：HP/SP 唯一所有者） */
export const resourceSystem = new ResourceSystem();
