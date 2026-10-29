/**
 * DD-08：存档结构类型化 —— 逐字段 = SRS DR-02 JSON（5.2 节）。
 * SaveSystem 与八 store 的快照接口（IF-M16 SaveParticipant<K>）以此类型为契约。
 * 存储文本不要求键序；键序规范化仅用于 checksum 计算（DD-09）。
 */

export const CURRENT_SCHEMA_VERSION = 1;

export interface SavePlayerSection {
    hp: number;
    hpMax: number;
    sp: number;
    spMax: number;
    coins: number;                  // 0~99999 整数
    skillPoints: number;            // 0~42 整数
    materials: Record<string, number>; // 键 = ItemDef.id（material 类）
}

export interface SaveProgressSection {
    unlockedLevels: string[];       // 必须是关卡顺序表连续前缀（FR-12 边界）
    clearedLevels: string[];
    collectedShards: string[];      // 全局唯一 shard id（"1-1-a" 形式）
    /** 已领取宝箱，格式为 关卡id:对象名；旧档缺失按空集合恢复。 */
    openedChests?: string[];
    /** 每关成功通关次数；旧档已通关关卡按一次恢复。 */
    clearCounts?: Record<string, number>;
    runRewards?: Record<string, string[]>;
    coinRemainders?: Record<string, number>;
    /** 最终 Boss 满包掉落暂存；旧档缺失时为空。 */
    victoryLoot?: { itemId: string; count: number }[];
    tutorialDone: boolean;
    /** 设计层补充字段（7.3.2）：旧档缺失时回退"最后解锁关卡的入口检查点"，向后兼容 */
    currentLevelId?: string | null;
    lastCheckpointId?: string | null;
}

export interface SaveSlotEntry {
    slot: number;                   // 0~19 不重复
    itemId: string;                 // 必须在配置表存在
    count: number;                  // 1~stackMax
    instanceKey?: string;           // 武器实例键（关联 WeaponService 等级）
}

export interface SaveInventorySection {
    capacity: 20;
    slots: SaveSlotEntry[];
    equipped: { main: string | null; sub: string | null };
}

export type SaveWeaponsSection = Record<string, { level: number }>; // level 1~5

export interface SaveSkillsSection {
    unlocked: string[];
    loadout: (string | null)[];     // 长度 4
}

export type KeymapData = Partial<Record<'moveLeft' | 'moveRight' | 'jump' | 'attackMain' | 'interact', string>>;

export interface SaveSettingsSection {
    masterVolume: number;           // 0~100 步进 5
    musicVolume: number;
    sfxVolume: number;
    screenShake: boolean;
    fullscreen: boolean;
    keymap: KeymapData | null;
}

export interface SaveRecordsSection {
    bestTimeSec: Record<string, number>;  // levelId → 秒（1 位小数）
    bestShards: Record<string, number>;   // levelId → 0~3
    totalDeaths: number;
    totalKills: number;
    totalPlaySec: number;
}

/** DR-02 顶层结构（= SaveData，IF-M16 契约根） */
export interface SaveData {
    schemaVersion: number;
    checksum: string;               // 8 位小写十六进制 FNV-1a
    savedAt: string;                // ISO 8601
    player: SavePlayerSection;
    progress: SaveProgressSection;
    inventory: SaveInventorySection;
    weapons: SaveWeaponsSection;
    skills: SaveSkillsSection;
    settings: SaveSettingsSection;
    records: SaveRecordsSection;
}

/** DD-07：localStorage 键族（全部经 StorageAdapter 白名单前缀 seapp.echoes. 访问） */
export const SAVE_KEY_PREFIX = 'seapp.echoes.';
export const saveKey = (slot: number): string => `${SAVE_KEY_PREFIX}save.slot${slot}`;
export const pendingKey = (slot: number): string => `${saveKey(slot)}.pending`;
export const corruptKey = (slot: number, at: string): string => `${saveKey(slot)}.corrupt.${at}`;
export const PROBE_KEY = `${SAVE_KEY_PREFIX}probe`;
