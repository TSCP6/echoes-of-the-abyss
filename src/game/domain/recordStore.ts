/**
 * MOD-21 RecordStore（领域层，IF-M10）—— FR-19 本地最佳榜。
 * 每关最佳用时（1 位小数）/最佳碎片；全局统计（死亡/击杀/时长/碎片总数 /36）；
 * submitResult：timeSec ≤0 丢弃（EX-09）；新纪录判定（FR-19 规则 3）；
 * getLastSubmit：结算页读取本次提交的新纪录标记（DD-15：IF-E06 载荷 + submitResult 返回）。
 */
import type { SaveRecordsSection } from './saveSchema';
import { warnThrottled } from './warn';

export interface LevelRecord { bestTimeSec: number | null; bestShards: number }
export interface GlobalStats { totalDeaths: number; totalKills: number; totalPlaySec: number; shardsTotal: number }

export class RecordStore {
    private bestTime = new Map<string, number>();
    private bestShards = new Map<string, number>();
    private totalDeaths = 0;
    private totalKills = 0;
    private totalPlaySec = 0;
    private shardsTotal = 0;
    private lastSubmit: { levelId: string; newRecord: boolean } | null = null;

    submitResult(levelId: string, timeSec: number, shards: number): { newRecord: boolean } {
        if (!Number.isFinite(timeSec) || timeSec <= 0) {
            warnThrottled('record.submit', `无效用时 ${timeSec}，丢弃（EX-09）`);
            this.lastSubmit = { levelId, newRecord: false };
            return { newRecord: false };
        }
        const rounded = Math.round(timeSec * 10) / 10;
        const prev = this.bestTime.get(levelId);
        const newRecord = prev === undefined || rounded < prev;
        if (newRecord) { this.bestTime.set(levelId, rounded); }
        const prevShards = this.bestShards.get(levelId) ?? 0;
        if (shards > prevShards) { this.bestShards.set(levelId, shards); }
        this.lastSubmit = { levelId, newRecord };
        return { newRecord };
    }

    getLastSubmit(): Readonly<{ levelId: string; newRecord: boolean }> | null { return this.lastSubmit; }

    getLevelRecord(levelId: string): LevelRecord {
        return {
            bestTimeSec: this.bestTime.get(levelId) ?? null,
            bestShards: this.bestShards.get(levelId) ?? 0
        };
    }

    getGlobalStats(): Readonly<GlobalStats> {
        return {
            totalDeaths: this.totalDeaths,
            totalKills: this.totalKills,
            totalPlaySec: Math.round(this.totalPlaySec),
            shardsTotal: this.shardsTotal
        };
    }

    addDeath(): void { this.totalDeaths += 1; }
    addKill(): void { this.totalKills += 1; }
    addPlayTime(sec: number): void {
        if (Number.isFinite(sec) && sec > 0) { this.totalPlaySec += sec; }
    }
    setShardsTotal(n: number): void { this.shardsTotal = Math.max(0, Math.floor(n)); }

    toSnapshot(): SaveRecordsSection {
        return {
            bestTimeSec: Object.fromEntries(this.bestTime),
            bestShards: Object.fromEntries(this.bestShards),
            totalDeaths: this.totalDeaths,
            totalKills: this.totalKills,
            totalPlaySec: Math.round(this.totalPlaySec)
        };
    }

    /** K5 宽容恢复：非法条目丢弃 */
    fromSnapshot(d: SaveRecordsSection): void {
        this.bestTime = new Map();
        for (const [k, v] of Object.entries(d.bestTimeSec ?? {})) {
            if (Number.isFinite(v) && v > 0) { this.bestTime.set(k, Math.round(v * 10) / 10); }
        }
        this.bestShards = new Map();
        for (const [k, v] of Object.entries(d.bestShards ?? {})) {
            if (Number.isFinite(v) && v >= 0) { this.bestShards.set(k, Math.floor(v)); }
        }
        this.totalDeaths = Number.isFinite(d.totalDeaths) ? Math.max(0, Math.floor(d.totalDeaths)) : 0;
        this.totalKills = Number.isFinite(d.totalKills) ? Math.max(0, Math.floor(d.totalKills)) : 0;
        this.totalPlaySec = Number.isFinite(d.totalPlaySec) ? Math.max(0, d.totalPlaySec) : 0;
    }
}

/** 全局单例（ARCH-5：最佳成绩与全局统计唯一所有者） */
export const recordStore = new RecordStore();
