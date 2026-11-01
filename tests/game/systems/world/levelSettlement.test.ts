import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settleLevel } from '../../../../src/game/systems/world/levelSettlement';
import { validateAll, markValidated, ConfigRegistry } from '../../../../src/game/domain/shared/configRegistry';
import { progressService } from '../../../../src/game/domain/progression/progressService';
import { economyService } from '../../../../src/game/domain/economy/economyService';
import { skillService } from '../../../../src/game/domain/player/skillService';
import { recordStore } from '../../../../src/game/domain/progression/recordStore';

vi.mock('../../../../src/game/systems/presentation/audioDirector', () => ({ audioDirector: { playSfx: vi.fn() } }));

beforeEach(() => {
    expect(validateAll().ok).toBe(true);
    markValidated();
    progressService.reset();
    economyService.fromSnapshot({ coins: 0, materials: {} });
    skillService.fromSnapshot({ unlocked: [], loadout: [null, null, null, null] });
    skillService.syncEarned(0);
    recordStore.fromSnapshot({ bestTimeSec: {}, bestShards: {}, totalDeaths: 0, totalKills: 0, totalPlaySec: 0 });
});

describe('通关结算与场景分离后的公开行为', () => {
    it('区分本局收益和钱包，重复通关不重复发首通奖励', () => {
        economyService.addCoins(80);
        const input = { levelId: '1-1', bossId: null, shards: 2, elapsedSec: 12.34, kills: 3, earnedCoins: 40 };
        const first = settleLevel(input);
        expect(first).toMatchObject({ coins: 110, earnedCoins: 40, firstClearCoins: 30, lostCoins: 0, timeSec: 12.3 });
        expect(progressService.getCurrentLevel()).toBe('1-2');
        expect(recordStore.getLevelRecord('1-1')).toEqual({ bestTimeSec: 12.3, bestShards: 2 });
        expect(settleLevel(input)).toMatchObject({ coins: 110, firstClearCoins: 0 });
    });

    it('终章判定先于完成最后一关，首次Boss奖励只发一次', () => {
        for (const level of ConfigRegistry.levels().slice(0, -1)) { progressService.completeLevel(level.id); }
        const input = { levelId: '3-4', bossId: 'enm_boss_echo', shards: 0, elapsedSec: 60, kills: 1, earnedCoins: 0 };
        expect(settleLevel(input)).toMatchObject({ firstClearCoins: 300, campaignVictory: { firstClear: true } });
        expect(skillService.skpBalance).toBe(2);
        expect(settleLevel(input)).toMatchObject({ firstClearCoins: 0, campaignVictory: { firstClear: false } });
        expect(skillService.skpBalance).toBe(2);
    });
});
