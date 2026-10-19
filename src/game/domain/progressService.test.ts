/**
 * TT-01：ProgressService 单测（FR-12 规则 1/2/边界 + AT-41~44 + K5 截断）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressService } from './progressService';
import { validateAll, markValidated } from './configRegistry';

beforeEach(() => {
    const r = validateAll();
    if (!r.ok) { throw new Error('config invalid'); }
    markValidated();
});

describe('ProgressService（FR-12）', () => {
    let ps: ProgressService;
    beforeEach(() => {
        ps = new ProgressService();
        ps.reset();
    });

    it('新档仅 1-1 解锁（AT-41）', () => {
        const views = ps.getLevelViews();
        expect(views.filter((v) => v.unlocked).map((v) => v.levelId)).toEqual(['1-1']);
    });

    it('通关 1-3 解锁 1-4 Boss 关（AT-42）', () => {
        ps.completeLevel('1-1');
        ps.completeLevel('1-2');
        const r = ps.completeLevel('1-3');
        expect(r.unlocked).toEqual(['1-4']);
    });

    it('通关 1-4 解锁 2-1（AT-43）', () => {
        for (const id of ['1-1', '1-2', '1-3', '1-4']) { ps.completeLevel(id); }
        expect(ps.isUnlocked('2-1')).toBe(true);
    });

    it('重复通关不再首通、不重复解锁（AT-44）', () => {
        const first = ps.completeLevel('1-1');
        expect(first.firstClear).toBe(true);
        const second = ps.completeLevel('1-1');
        expect(second.firstClear).toBe(false);
        expect(second.unlocked).toEqual([]);
        expect(ps.getLevelViews().filter((v) => v.unlocked)).toHaveLength(2);
    });

    it('碎片采集幂等（FR-11 规则 5）', () => {
        ps.collectShard('1-1', 'shard_a');
        ps.collectShard('1-1', 'shard_a');
        expect(ps.getLevelViews()[0].shards).toBe(1);
        expect(ps.isShardCollected('1-1', 'shard_a')).toBe(true);
    });

    it('读档截断非连续前缀（K5 / FR-12 边界）', () => {
        ps.fromSnapshot({
            unlockedLevels: ['1-1', '1-2', '2-1'], // 2-1 非连续
            clearedLevels: ['1-1', '3-4'],          // 3-4 未解锁 → 丢弃
            collectedShards: ['1-1-a', '1-1-a'],
            tutorialDone: true
        });
        expect(ps.getLevelViews().filter((v) => v.unlocked).map((v) => v.levelId)).toEqual(['1-1', '1-2']);
        expect(ps.isCleared('3-4')).toBe(false);
        expect(ps.isTutorialDone()).toBe(true);
    });
});
