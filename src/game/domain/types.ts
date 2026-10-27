/**
 * 领域层共享类型：DR-01 配置表 Def（字段/取值范围逐条对齐 SRS 5.1）、
 * DD-06 Boss 阶段结构、运行时状态投影。
 * ARCH-7：本文件禁止 import 'phaser'。类型单一出处（12.4 一致性 2）。
 */

// ---------- DR-01 配置表 Def ----------

/** WeaponDef —— 字段与取值范围 = SRS 5.1 WeaponDef 表 */
export interface WeaponDef {
    id: string;                 // 全局唯一，wpn_ 前缀
    type: 'melee' | 'ranged';
    baseDamage: number;         // @range 5~60
    attackSpeed: number;        // @range 0.5~6.0 次/s
    range: number;              // @range 近战 20~80 / 远程 200~600 px
    projectileSpeed: number | null; // @range 远程 300~800，近战 null
    ammoItemId: string | null;  // 远程必填，引用 ItemDef.id
    hitboxSize: { w: number; h: number }; // @range 8~120
    price: number | null;       // @range 120~300，初始武器 null
}

/** BossPhaseDef / BossSkillDef —— DD-06（SRS 5.1 EnemyDef.phases 取值结构） */
export interface BossSkillDef {
    kind: 'charge' | 'summon' | 'projectileSpread' | 'arenaHazard';
    damage: number;               // @range 5~30
    cooldownSec: number;          // @range 0.5~8（设计参数域）
    params: Record<string, number>;
}
export interface BossPhaseDef {
    hpThreshold: number;          // 1.0 / 0.66 / 0.33（FR-03 规则 4）
    invincibleMs: number;         // 1500（固定值）
    skills: BossSkillDef[];       // 每阶段循环 2~3 个技能
}

/** EnemyDef —— 字段与取值范围 = SRS 5.1 EnemyDef 表 */
export interface EnemyDef {
    id: string;                 // 全局唯一，enm_ 前缀
    kind: 'patrol' | 'chaser' | 'flyer' | 'boss';
    hp: number;                 // @range 20~1400
    contactDamage: number;      // @range 5~30
    moveSpeed: number;          // @range 40~180 px/s
    detectRange: number;        // @range 100~300 px
    coinsDrop: [number, number];// @range 0~350，min ≤ max
    lootTableId: string | null;
    hurtboxSize: { w: number; h: number }; // @range 8~160
    phases: BossPhaseDef[];     // 仅 kind='boss' 长度为 3，其余为空数组
}

/** SkillEffect —— SRS 5.1 SkillDef.effect 结构化对象（伤害 5~60 / 位移 60~240 / 回复 10~50） */
export interface SkillEffect {
    damage?: number;      // @range 5~60
    radius?: number;      // 范围技能半径（旋风斩 80）
    dashDistance?: number;// @range 60~240（回响冲刺 180）
    invincibleMs?: number;// 冲刺无敌 200
    heal?: number;        // @range 10~50（治疗祷言 35）
    projectileCount?: number; // 多重射击 3 发
    spreadDeg?: number;       // 多重射击 15°
    /** 被动伤害加成百分数（skillFactor = 1 + Σ damagePct/100）；设计扩展：SRS 5.1 effect 为"结构化对象"，被动数值属数据内容 */
    damagePct?: number;
}

/** SkillDef —— 字段与取值范围 = SRS 5.1 SkillDef 表 */
export interface SkillDef {
    id: string;                 // 全局唯一，sk_ 前缀
    branch: 'blade' | 'bolt' | 'ruin';
    kind: 'active' | 'passive';
    spCost: number;             // @range 主动 8~40，被动 0
    cooldown: number;           // @range 主动 0.5~30，被动 0（秒）
    skpCost: number;            // @range 1~4
    prerequisiteId: string | null;
    effect: SkillEffect;
    /** 被动数值加成（如遗迹分支"坚韧"每级 +20 HP/+SP）；主动技能为空 */
    passiveHpBonus?: number;
    passiveSpBonus?: number;
}

/** ItemDef —— 字段与取值范围 = SRS 5.1 ItemDef 表 */
export interface ItemDef {
    id: string;                 // 全局唯一，itm_ 前缀
    name: string;               // 1~12 汉字
    category: 'weapon' | 'consumable' | 'material';
    stackMax: number;           // 武器 1，其余 99
    effect: { hp?: number; sp?: number; fullHp?: boolean }; // 回复量 10~60，仅消耗品；fullHp=回满（高级 HP 药水，附录 A；设计扩展，先例 DD-05 向后兼容新增可选字段）
    throwable: boolean;         // 仅投掷类消耗品 true
    price: number;              // @range 5~300
    icon: string;               // 图集帧名，必须存在
    description: string;        // ≤40 汉字
}

/** LevelDef —— 字段与取值范围 = SRS 5.1 LevelDef 表 */
export interface LevelDef {
    id: string;                 // 格式 场景-序号，共 12
    sceneId: number;            // 1~3
    tilemapAsset: string;       // DR-03 JSON 路径
    bgmId: string;
    isBossLevel: boolean;
    bossId: string | null;      // isBossLevel 时必填
    targetTimeSec: number;      // 常规 180~300，Boss 240~420
    shardIds: [string, string, string]; // 固定 3 枚
}

/** ShopGoodsDef —— SRS 5.1 商品配置 */
export interface ShopGoodsDef {
    id: string;
    refType: 'item' | 'weapon';
    refId: string;              // 必须在 ItemDef 或 WeaponDef 中存在
    price: number;              // @range 15~300
    unlockScene: 1 | 2 | 3;
    stockLimit: number | null;
    /** 单次购买数量（飞镖×10 / 箭矢×10，FR-10 规则 2）；缺省 1。设计扩展：向后兼容可选语义 */
    count?: number;
}

/** LootTableDef —— DD-02 lootTables.ts 结构 */
export interface LootEntry {
    itemId: string;
    weight: number;             // ≥0
    countMin: number;           // ≥0
    countMax: number;           // ≥ countMin
}
export interface LootTableDef {
    id: string;
    entries: LootEntry[];
}

/** PlayerDefaults —— SRS 5.1 PlayerState 默认值列 */
export interface PlayerDefaults {
    hp: number; hpMax: number;
    sp: number; spMax: number;
    coins: number;
    skillPoints: number;
    facing: 1 | -1;
    // 运动物理常量（SRS 附录 A 玩家表，MotionModel 读取源）
    collider: { w: number; h: number };  // 22×44
    walkSpeed: number;      // 210
    accelTimeSec: number;   // 0.12
    decelTimeSec: number;   // 0.10
    airControlFactor: number; // 0.85
    jumpVelocity: number;   // 480（向上）
    gravity: number;        // 1300
    jumpCutVelocity: number;// -180（可变跳高截断）
    coyoteMs: number;       // 100
    jumpBufferMs: number;   // 120
    iFrameMs: number;       // 800
    knockbackPx: number;    // 玩家受击击退强度参数（FR-04 规则 7，实际位移受移动减速影响）
}

// ---------- 运行时状态投影（DD-12） ----------

/** SlotEntry —— IF-M06（背包槽位条目）；单一出处，events.ts 与 InventoryStore 共用 */
export interface SlotEntry {
    itemId: string;
    count: number;
    instanceKey?: string; // 武器实例键，关联 WeaponService 等级（4.3.6）
}

/** SRS 5.1 PlayerState 枚举 state 字段 */
export type PlayerAnimState = 'idle' | 'run' | 'jump' | 'fall' | 'attack' | 'hurt' | 'dead';

/** ResourceSnapshot —— IF-M03 */
export interface ResourceSnapshot {
    hp: number; hpMax: number;
    sp: number; spMax: number;
    lowHp: boolean;        // hp/hpMax < 30%（FR-06 规则 8）
    outOfCombat: boolean;
}

/** HudSnapshot —— IF-M13 / IF-E02 载荷（= DR-04 hud:update） */
export interface HudSnapshot {
    hp: number; hpMax: number;
    sp: number; spMax: number;
    coins: number;
    materials: Record<string, number>;
}
