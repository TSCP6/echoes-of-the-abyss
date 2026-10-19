/**
 * DR-01 LevelDef ×12（附录 B 顺序 = 数组顺序 = FR-12 解锁顺序表）。
 * id 格式 场景-序号（V4 校验）；每场景第 4 关 isBossLevel=true 且 bossId 非空；shardIds 长度 3。
 * targetTimeSec 常规 180~300 / Boss 240~420（附录 B 目标时长换算，SRS 5.1 范围内）。
 * tilemapAsset 指向 public/assets/levels/*.json（DD-04，DEC-7 CSV 明文）。
 */
import type { LevelDef } from '../domain/types';

export const LEVELS: LevelDef[] = [
    // ---- 场景一 森林遗迹 ----
    {
        id: '1-1', sceneId: 1, tilemapAsset: 'levels/1-1.json', bgmId: 'bgm_scene1',
        isBossLevel: false, bossId: null, targetTimeSec: 180,
        shardIds: ['1-1-a', '1-1-b', '1-1-c']
    },
    {
        id: '1-2', sceneId: 1, tilemapAsset: 'levels/1-2.json', bgmId: 'bgm_scene1',
        isBossLevel: false, bossId: null, targetTimeSec: 240,
        shardIds: ['1-2-a', '1-2-b', '1-2-c']
    },
    {
        id: '1-3', sceneId: 1, tilemapAsset: 'levels/1-3.json', bgmId: 'bgm_scene1',
        isBossLevel: false, bossId: null, targetTimeSec: 300,
        shardIds: ['1-3-a', '1-3-b', '1-3-c']
    },
    {
        id: '1-4', sceneId: 1, tilemapAsset: 'levels/1-4.json', bgmId: 'bgm_boss1_tense',
        isBossLevel: true, bossId: 'enm_boss_guardian', targetTimeSec: 360,
        shardIds: ['1-4-a', '1-4-b', '1-4-c']
    },
    // ---- 场景二 地下洞窟 ----
    {
        id: '2-1', sceneId: 2, tilemapAsset: 'levels/2-1.json', bgmId: 'bgm_scene2',
        isBossLevel: false, bossId: null, targetTimeSec: 300,
        shardIds: ['2-1-a', '2-1-b', '2-1-c']
    },
    {
        id: '2-2', sceneId: 2, tilemapAsset: 'levels/2-2.json', bgmId: 'bgm_scene2',
        isBossLevel: false, bossId: null, targetTimeSec: 300,
        shardIds: ['2-2-a', '2-2-b', '2-2-c']
    },
    {
        id: '2-3', sceneId: 2, tilemapAsset: 'levels/2-3.json', bgmId: 'bgm_scene2',
        isBossLevel: false, bossId: null, targetTimeSec: 300,
        shardIds: ['2-3-a', '2-3-b', '2-3-c']
    },
    {
        id: '2-4', sceneId: 2, tilemapAsset: 'levels/2-4.json', bgmId: 'bgm_boss2_tense',
        isBossLevel: true, bossId: 'enm_boss_spider', targetTimeSec: 420,
        shardIds: ['2-4-a', '2-4-b', '2-4-c']
    },
    // ---- 场景三 天空神殿 ----
    {
        id: '3-1', sceneId: 3, tilemapAsset: 'levels/3-1.json', bgmId: 'bgm_scene3',
        isBossLevel: false, bossId: null, targetTimeSec: 300,
        shardIds: ['3-1-a', '3-1-b', '3-1-c']
    },
    {
        id: '3-2', sceneId: 3, tilemapAsset: 'levels/3-2.json', bgmId: 'bgm_scene3',
        isBossLevel: false, bossId: null, targetTimeSec: 300,
        shardIds: ['3-2-a', '3-2-b', '3-2-c']
    },
    {
        id: '3-3', sceneId: 3, tilemapAsset: 'levels/3-3.json', bgmId: 'bgm_scene3',
        isBossLevel: false, bossId: null, targetTimeSec: 300,
        shardIds: ['3-3-a', '3-3-b', '3-3-c']
    },
    {
        id: '3-4', sceneId: 3, tilemapAsset: 'levels/3-4.json', bgmId: 'bgm_boss3_tense',
        isBossLevel: true, bossId: 'enm_boss_echo', targetTimeSec: 420,
        shardIds: ['3-4-a', '3-4-b', '3-4-c']
    }
];

/** 关卡顺序表（FR-12 解锁链的权威顺序，ProgressService 连续前缀校验依据） */
export const LEVEL_ORDER: string[] = LEVELS.map((l) => l.id);

/** 每个 Boss 击杀奖励 SKP（附录 A：Boss 各 2 点，合计 6）——ProgressService 首通发放 */
export const BOSS_SKP_REWARD = 2;
