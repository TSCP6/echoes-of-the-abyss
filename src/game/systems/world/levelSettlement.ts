/** 通关时的奖励、纪录与结算数据；物理暂停和事件发布仍由场景协调。 */
import { canFinishCampaign } from '../../domain/progression/campaignVictory';
import { progressService } from '../../domain/progression/progressService';
import { economyService } from '../../domain/economy/economyService';
import { recordStore } from '../../domain/progression/recordStore';
import { skillService } from '../../domain/player/skillService';
import { ConfigRegistry } from '../../domain/shared/configRegistry';
import { FIRST_CLEAR_COINS } from '../../data/rewardDefaults';
import { audioDirector } from '../presentation/audioDirector';
import type { EventPayloads } from '../../events';

export interface LevelSettlementInput {
    levelId: string;
    bossId: string | null;
    shards: number;
    elapsedSec: number;
    kills: number;
    earnedCoins: number;
}

export function settleLevel(input: LevelSettlementInput): EventPayloads['level:cleared'] {
    const { levelId, bossId, shards, elapsedSec, kills, earnedCoins } = input;
    const campaignVictory = canFinishCampaign(levelId);
    audioDirector.playSfx('clear');
    const res = progressService.completeLevel(levelId);
    let firstClearCoins = 0;
    if (res.firstClear) {
        const before = economyService.getCoins();
        const chapter = ConfigRegistry.levels().find(l => l.id === levelId)!.sceneId;
        economyService.addCoins((bossId === null ? FIRST_CLEAR_COINS.normal : FIRST_CLEAR_COINS.boss) * chapter);
        firstClearCoins = economyService.getCoins() - before;
    }
    // FR-19：最佳成绩（AT-64 新纪录判定）
    recordStore.submitResult(levelId, elapsedSec, shards);
    recordStore.setShardsTotal(progressService.toSnapshot().collectedShards.length);
    // 首通奖励：Boss 关 +2 SKP（附录 A）；碎片 SKP 已在采集时发放
    if (res.firstClear && bossId !== null) {
        skillService.grantBossSkp(ConfigRegistry.bossSkpReward());
    }
    return {
        levelId,
        timeSec: Math.round(elapsedSec * 10) / 10,
        kills,
        shards,
        coins: economyService.getCoins(), earnedCoins, firstClearCoins, lostCoins: 0,
        ...(campaignVictory ? { campaignVictory: { firstClear: res.firstClear } } : {})
    };
}
