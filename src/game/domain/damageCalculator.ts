/**
 * MOD-12 DamageCalculator（领域层纯函数，IF-M02）。
 * FR-04 处理规则 3：实际伤害 = round(基础伤害 × 武器等级系数 × 技能加成系数 × 随机(0.95~1.05))，最小 1。
 * 随机源以参数注入（rng），单测可注入确定性序列（TT-01 接缝）；
 * 武器等级系数由 WeaponService 计算后传入，本模块不读配置（职责单一）。
 * NaN/Infinity/负值 → { amount: 1, clamped: true } + 去重警告（EX-09）。
 */
import { warnThrottled } from './warn';

export interface DamageRequest {
    baseDamage: number;        // WeaponDef.baseDamage 或技能 effect.damage
    weaponLevelFactor: number; // WeaponService 计算：1 + 0.15×(等级-1)
    skillFactor: number;       // 技能加成系数，无加成时 1
    defenseFactor?: number;    // Boss 武器抗性/弱点倍率来自配置，其他目标缺省 1
}

export interface DamageResult {
    amount: number;
    clamped: boolean; // true = 触发过 EX-09 钳制（非法输入/结果）
}

export function calcDamage(req: DamageRequest, rng: () => number): DamageResult {
    const defense = req.defenseFactor ?? 1;
    const roll = rng();
    const raw = req.baseDamage * req.weaponLevelFactor * req.skillFactor * defense * (0.95 + roll * 0.10);

    const inputsInvalid =
        !Number.isFinite(req.baseDamage) || req.baseDamage < 0 ||
        !Number.isFinite(req.weaponLevelFactor) || req.weaponLevelFactor <= 0 ||
        !Number.isFinite(req.skillFactor) || req.skillFactor <= 0 ||
        !Number.isFinite(defense) || defense <= 0 ||
        !Number.isFinite(roll) || roll < 0 || roll > 1;

    if (inputsInvalid || !Number.isFinite(raw) || raw <= 0) {
        warnThrottled('calcDamage', `非法伤害输入或结果，回退最小伤害 1（base=${req.baseDamage}, raw=${raw}）`);
        return { amount: 1, clamped: true };
    }
    // "结果最小为 1"是公式的正常组成（FR-04 规则 3），不属于 EX-09 钳制。
    return { amount: Math.max(1, Math.round(raw)), clamped: false };
}
