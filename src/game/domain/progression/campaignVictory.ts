/** 终章只读统计与待领取物品，不依赖 Phaser/Vue；复用当前存档的真实进度。 */
import { ConfigRegistry } from '../shared/configRegistry';
import { progressService } from './progressService';
import { recordStore } from './recordStore';
import { economyService } from '../economy/economyService';
import { weaponService } from '../player/weaponService';
import { grantRewardItem } from '../economy/rewardService';

export function canFinishCampaign(levelId: string): boolean {
    const levels = ConfigRegistry.levels();
    return levels.length > 0 && levels[levels.length - 1].id === levelId
        && levels.slice(0, -1).every(level => progressService.isCleared(level.id));
}

export function campaignSummary() {
    const levels = ConfigRegistry.levels();
    const progress = progressService.toSnapshot();
    const collected = new Set(progress.collectedShards);
    const stats = recordStore.getGlobalStats();
    const chapters = [1, 2, 3].map(id => {
        const group = levels.filter(level => level.sceneId === id);
        return { id, total: group.length, cleared: group.filter(level => progressService.isCleared(level.id)).length,
            shards: group.flatMap(level => level.shardIds).filter(key => collected.has(key)).length,
            totalShards: group.reduce((sum, level) => sum + level.shardIds.length, 0),
            bossDefeated: group.some(level => level.isBossLevel && progressService.isCleared(level.id)) };
    });
    const cleared = chapters.reduce((sum, chapter) => sum + chapter.cleared, 0);
    const shards = chapters.reduce((sum, chapter) => sum + chapter.shards, 0);
    const totalShards = chapters.reduce((sum, chapter) => sum + chapter.totalShards, 0);
    const equipped = weaponService.getEquippedDefs();
    return { chapters, cleared, total: levels.length, completed: levels.length > 0 && cleared === levels.length,
        shards, totalShards, completeEcho: totalShards > 0 && shards === totalShards,
        chests: new Set(progress.openedChests).size, playSec: stats.totalPlaySec,
        kills: stats.totalKills, deaths: stats.totalDeaths, coins: economyService.getCoins(),
        finalBestSec: recordStore.getLevelRecord(levels[levels.length - 1]?.id ?? '').bestTimeSec,
        weapons: (['main', 'sub'] as const).map(hand => ({ hand, id: equipped[hand]?.id ?? null,
            name: equipped[hand] ? ConfigRegistry.items()[equipped[hand]!.id]?.name ?? null : null,
            level: equipped[hand] ? weaponService.getLevel(equipped[hand]!.id, hand) : 0 })),
        activeWeaponId: equipped[weaponService.getActiveHand()]?.id ?? null };
}

/** 领取后仅保存未装下的余量；重看结局不会重掷掉落或重复发奖。 */
export function claimVictoryLoot(): void {
    const remaining = progressService.getVictoryLoot().flatMap(item => {
        const result = grantRewardItem(item.itemId, item.count);
        return result.remaining > 0 ? [{ itemId: item.itemId, count: result.remaining }] : [];
    });
    progressService.setVictoryLoot(remaining);
}
