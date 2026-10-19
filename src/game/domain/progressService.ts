/**
 * MOD-19 ProgressService（领域层，IF-M09）—— FR-12 解锁链、FR-11 碎片/宝箱进度。
 * 顺序表 = ConfigRegistry.levelOrder()（附录 B 顺序）；通关第 n 关解锁第 n+1 关
 * （含场景内第 3 常规关 → Boss 关、Boss 关 → 下一场景首关，线性序天然覆盖 FR-12 规则 1/2）。
 * 首通奖励只在 clearedLevels 首次加入时发放（AT-44）；碎片采集幂等。
 * 读档宽容恢复：unlockedLevels 非连续前缀 → 截断到最长合法前缀 + warn（K5，不作废整档）。
 * 构造不读配置（模块加载早于 Preloader 校验）；启动流程在校验后调 reset()/fromSnapshot()。
 */
import { ConfigRegistry } from './configRegistry';
import { warnThrottled } from './warn';
import type { SaveProgressSection } from './saveSchema';

export interface LevelProgressView {
    levelId: string;
    unlocked: boolean;
    cleared: boolean;
    bestTimeSec: number | null; // 归 RecordStore（P3），视图层合并；领域内占位 null
    shards: number;
}

export class ProgressService {
    private unlocked: string[] = [];
    private cleared: string[] = [];
    private shards: string[] = []; // 全局 shard id："1-1-a"
    private tutorialDone = false;
    private currentLevelId: string | null = null;
    private lastCheckpointId: string | null = null;

    reset(): void {
        const order = ConfigRegistry.levelOrder();
        this.unlocked = order.length > 0 ? [order[0]] : [];
        this.cleared = [];
        this.shards = [];
        this.tutorialDone = false;
        this.currentLevelId = null;
        this.lastCheckpointId = null;
    }

    getLevelViews(): LevelProgressView[] {
        return ConfigRegistry.levels().map((def) => ({
            levelId: def.id,
            unlocked: this.unlocked.includes(def.id),
            cleared: this.cleared.includes(def.id),
            bestTimeSec: null,
            shards: this.shards.filter((s) => s.startsWith(`${def.id}-`)).length
        }));
    }

    isUnlocked(levelId: string): boolean { return this.unlocked.includes(levelId); }
    isCleared(levelId: string): boolean { return this.cleared.includes(levelId); }

    /** FR-12 规则 1/2：通关推进解锁；返回首通标志与新解锁列表（AT-41~44） */
    completeLevel(levelId: string): { firstClear: boolean; unlocked: string[] } {
        const order = ConfigRegistry.levelOrder();
        const idx = order.indexOf(levelId);
        if (idx < 0) {
            warnThrottled('progress.complete', `未知关卡 ${levelId}`);
            return { firstClear: false, unlocked: [] };
        }
        const firstClear = !this.cleared.includes(levelId);
        if (firstClear) { this.cleared.push(levelId); }
        const newly: string[] = [];
        const next = order[idx + 1];
        if (next !== undefined && !this.unlocked.includes(next)) {
            this.unlocked.push(next);
            newly.push(next);
        }
        return { firstClear, unlocked: newly };
    }

    /** FR-11 规则 5：碎片采集幂等（跨死亡/重进保持） */
    collectShard(levelId: string, shardKey: string): void {
        const gid = `${levelId}-${shardKey.replace(/^shard_/, '')}`;
        if (!this.shards.includes(gid)) { this.shards.push(gid); }
    }

    isShardCollected(levelId: string, shardKey: string): boolean {
        return this.shards.includes(`${levelId}-${shardKey.replace(/^shard_/, '')}`);
    }

    markTutorialDone(): void { this.tutorialDone = true; }
    isTutorialDone(): boolean { return this.tutorialDone; }

    setCurrentLevel(levelId: string | null): void { this.currentLevelId = levelId; }
    getCurrentLevel(): string | null { return this.currentLevelId; }
    setLastCheckpoint(id: string | null): void { this.lastCheckpointId = id; }
    getLastCheckpoint(): string | null { return this.lastCheckpointId; }

    toSnapshot(): SaveProgressSection {
        return {
            unlockedLevels: [...this.unlocked],
            clearedLevels: [...this.cleared],
            collectedShards: [...this.shards],
            tutorialDone: this.tutorialDone,
            currentLevelId: this.currentLevelId,
            lastCheckpointId: this.lastCheckpointId
        };
    }

    /** K5：连续前缀校验，非法截断到最长合法前缀 + warn（篡改宽容恢复） */
    fromSnapshot(d: SaveProgressSection): void {
        const order = ConfigRegistry.levelOrder();
        const valid = new Set(order);
        const prefix: string[] = [];
        for (const id of d.unlockedLevels ?? []) {
            if (id === order[prefix.length] && valid.has(id)) { prefix.push(id); } else { break; }
        }
        if (prefix.length !== (d.unlockedLevels ?? []).length) {
            warnThrottled('progress.load', `unlockedLevels 非连续前缀，截断到 ${prefix.length} 项`);
        }
        this.unlocked = prefix.length > 0 ? prefix : (order[0] !== undefined ? [order[0]] : []);
        this.cleared = (d.clearedLevels ?? []).filter((id) => valid.has(id) && this.unlocked.includes(id));
        this.shards = [...new Set(d.collectedShards ?? [])];
        this.tutorialDone = d.tutorialDone === true;
        this.currentLevelId = typeof d.currentLevelId === 'string' && valid.has(d.currentLevelId) ? d.currentLevelId : null;
        this.lastCheckpointId = typeof d.lastCheckpointId === 'string' ? d.lastCheckpointId : null;
    }
}

/** 全局单例（ARCH-5：解锁/通关/碎片唯一所有者） */
export const progressService = new ProgressService();
