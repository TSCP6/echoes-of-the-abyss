/**
 * DR-01 PlayerDefaults —— SRS 5.1 PlayerState 默认值列 + 附录 A 玩家运动物理常量。
 * MotionModel / ResourceSystem / PlayerController 的数值来源（ARCH-8 配置驱动）。
 */
import type { PlayerDefaults } from '../domain/types';

export const PLAYER_DEFAULTS: PlayerDefaults = {
    hp: 100, hpMax: 100,
    sp: 50, spMax: 50,
    coins: 0,
    skillPoints: 0,
    facing: 1,
    collider: { w: 22, h: 44 },
    walkSpeed: 210,
    accelTimeSec: 0.12,
    decelTimeSec: 0.10,
    airControlFactor: 0.85,
    jumpVelocity: 560, // 基线 480 +16.7%（SRS 附录 A ±20% 内）
    gravity: 1140, // 基线 1300 −12.3%；跳高 ≈138px，滞空 ≈0.98s，收紧原先偏飘的跳跃
    jumpCutVelocity: -180,
    coyoteMs: 100,
    jumpBufferMs: 120,
    iFrameMs: 800,
    knockbackPx: 60
};

/** HP/SP 上限硬约束（FR-06 规则 1/2，applyPassiveMaxBonus 钳制上限） */
export const HP_MAX_CAP = 200;
export const SP_MAX_CAP = 150;

/** SP 回复常量（附录 A：脱战 4 点/s、击杀 6 点/次；脱战判定 3s 内未造成且未受到伤害） */
export const SP_REGEN_PER_SEC = 4;
export const SP_KILL_GAIN = 6;
export const OUT_OF_COMBAT_DELAY_SEC = 3;
/** 技能树上限计算的基础值；读档重算被动时不以已加成上限为基数。 */
export const BASE_HP_MAX = 100;
export const BASE_SP_MAX = 50;

/** 2026-10-28 用户确认：死亡保留金币；常量保留以兼容既有调用。 */
export const DEATH_COIN_LOSS_RATIO = 0;
export const DEATH_COIN_LOSS_CAP = 0;

/** 金币持有上限（DR-02 / FR-09 规则 6） */
export const COINS_CAP = 99999;

/** SKP 收支（附录 A：可得 42 = 碎片 36 + Boss 6；全解锁需 46）——V5 校验依据 */
export const SKP_OBTAINABLE_TOTAL = 42;
export const SKP_FROM_SHARDS = 36;   // 36 枚碎片 × 1
export const SKP_FROM_BOSSES = 6;    // 3 Boss × 2
export const SKP_FULL_UNLOCK_COST = 46;
