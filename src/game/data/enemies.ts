/**
 * DR-01 EnemyDef ×4（巡逻/追击/飞行/精英）+ BossDef ×3（DD-06 三阶段）。
 * HP/接触伤害/移动速度/金币掉落 = SRS 附录 A 敌人表；detectRange/hurtboxSize 在 SRS 5.1 范围内取值。
 * 普通敌人主动攻击与飞行追踪参数集中在 normalEnemyCombat.ts；moveSpeed=50 为紫鹰巡航速度上限。
 * Boss 技能脚本为配置数据（DD-06），数值域受 V2/V4 校验（damage 5~30、cooldownSec 0.5~8）。
 */
import type { EnemyDef } from '../domain/types';

export const ENEMIES: EnemyDef[] = [
    {
        id: 'enm_patrol', kind: 'patrol', hp: 30, contactDamage: 5,
        moveSpeed: 60, detectRange: 300, coinsDrop: [3, 6],
        lootTableId: 'loot_patrol', hurtboxSize: { w: 40, h: 36 }, phases: []
    },
    {
        id: 'enm_chaser', kind: 'chaser', hp: 45, contactDamage: 5,
        moveSpeed: 160, detectRange: 220, coinsDrop: [6, 10],
        lootTableId: 'loot_chaser', hurtboxSize: { w: 28, h: 34 }, phases: []
    },
    {
        id: 'enm_flyer', kind: 'flyer', hp: 25, contactDamage: 5,
        moveSpeed: 50, detectRange: 300, coinsDrop: [5, 8],
        lootTableId: 'loot_flyer', hurtboxSize: { w: 28, h: 24 }, phases: []
    },
    {
        id: 'enm_elite', kind: 'patrol', hp: 120, contactDamage: 5,
        moveSpeed: 90, detectRange: 200, coinsDrop: [25, 35],
        lootTableId: 'loot_elite', hurtboxSize: { w: 40, h: 48 }, phases: []
    },
    // ---- Boss 1-4 石像守卫者（600 HP：重锤 / 震波 / 岩甲冲撞）----
    {
        id: 'enm_boss_guardian', kind: 'boss', hp: 600, contactDamage: 5,
        moveSpeed: 70, detectRange: 300, coinsDrop: [150, 150],
        lootTableId: 'loot_boss1', hurtboxSize: { w: 80, h: 96 },
        phases: [
            {
                hpThreshold: 1.0, invincibleMs: 1500, skills: [
                    { kind: 'guardianHammer', damage: 22, cooldownSec: 2.4, params: { windupSec: 0.95, activeSec: 0.25, recoverySec: 1.1, reach: 180 } },
                    { kind: 'guardianStomp', damage: 18, cooldownSec: 2.6, params: { windupSec: 0.9, activeSec: 0.3, recoverySec: 0.9, waveSpeed: 230, waveHeight: 24 } }
                ]
            },
            {
                hpThreshold: 0.66, invincibleMs: 1500, skills: [
                    { kind: 'guardianHammer', damage: 24, cooldownSec: 2.1, params: { windupSec: 0.9, activeSec: 0.25, recoverySec: 1.1, reach: 180 } },
                    { kind: 'guardianStomp', damage: 20, cooldownSec: 2.3, params: { windupSec: 0.85, activeSec: 0.3, recoverySec: 0.9, waveSpeed: 230, waveHeight: 24 } },
                    { kind: 'charge', damage: 25, cooldownSec: 2.7, params: { windupSec: 0.8, activeSec: 2.4, recoverySec: 1.4, distance: 1600 } }
                ]
            },
            {
                hpThreshold: 0.33, invincibleMs: 1500, skills: [
                    { kind: 'guardianHammer', damage: 26, cooldownSec: 1.9, params: { windupSec: 0.85, activeSec: 0.25, recoverySec: 1.1, reach: 180 } },
                    { kind: 'guardianStomp', damage: 22, cooldownSec: 2.1, params: { windupSec: 0.8, activeSec: 0.3, recoverySec: 0.9, waveSpeed: 230, waveHeight: 24 } },
                    { kind: 'charge', damage: 25, cooldownSec: 2.4, params: { windupSec: 0.7, activeSec: 2.4, recoverySec: 1.4, distance: 1600 } }
                ]
            }
        ]
    },
    // ---- Boss 2-4 深渊蛛后（900 HP：减速蛛网 / 吊顶俯袭 / 可破坏蛛卵）----
    {
        id: 'enm_boss_spider', kind: 'boss', hp: 900, contactDamage: 5,
        moveSpeed: 110, detectRange: 300, coinsDrop: [220, 220],
        lootTableId: 'loot_boss2', hurtboxSize: { w: 88, h: 72 },
        phases: [
            {
                hpThreshold: 1.0, invincibleMs: 1500, skills: [
                    { kind: 'spiderWeb', damage: 12, cooldownSec: 2.4, params: { windupSec: 0.85, activeSec: 0.25, recoverySec: 0.8, width: 150, durationSec: 5, slowFactor: 0.65 } },
                    { kind: 'spiderDrop', damage: 20, cooldownSec: 2.8, params: { windupSec: 1, activeSec: 0.4, recoverySec: 1.2, liftHeight: 260, width: 140 } }
                ]
            },
            {
                hpThreshold: 0.66, invincibleMs: 1500, skills: [
                    { kind: 'spiderWeb', damage: 14, cooldownSec: 2.2, params: { windupSec: 0.8, activeSec: 0.25, recoverySec: 0.8, width: 150, durationSec: 5, slowFactor: 0.65 } },
                    { kind: 'spiderDrop', damage: 22, cooldownSec: 2.6, params: { windupSec: 0.95, activeSec: 0.4, recoverySec: 1.2, liftHeight: 260, width: 140 } },
                    { kind: 'spiderEggs', damage: 10, cooldownSec: 2.8, params: { windupSec: 1, activeSec: 0.3, recoverySec: 0.8, count: 2, hatchSec: 3 } }
                ]
            },
            {
                hpThreshold: 0.33, invincibleMs: 1500, skills: [
                    { kind: 'spiderWeb', damage: 16, cooldownSec: 2, params: { windupSec: 0.75, activeSec: 0.25, recoverySec: 0.8, width: 150, durationSec: 5, slowFactor: 0.65 } },
                    { kind: 'spiderDrop', damage: 24, cooldownSec: 2.4, params: { windupSec: 0.9, activeSec: 0.4, recoverySec: 1.2, liftHeight: 260, width: 140 } },
                    { kind: 'spiderEggs', damage: 10, cooldownSec: 2.6, params: { windupSec: 0.95, activeSec: 0.3, recoverySec: 0.8, count: 2, hatchSec: 3 } }
                ]
            }
        ]
    },
    // ---- Boss 3-4 回响之影（1400 HP：标记换位 / 三段剑舞 / 延迟回响）----
    {
        id: 'enm_boss_echo', kind: 'boss', hp: 1400, contactDamage: 5,
        moveSpeed: 130, detectRange: 300, coinsDrop: [320, 320],
        lootTableId: 'loot_boss3', hurtboxSize: { w: 64, h: 88 },
        phases: [
            {
                hpThreshold: 1.0, invincibleMs: 1500, skills: [
                    { kind: 'echoStep', damage: 14, cooldownSec: 2, params: { windupSec: 0.75, activeSec: 0.8, recoverySec: 0.7, shiftDistance: 180 } },
                    { kind: 'echoDance', damage: 20, cooldownSec: 2.6, params: { windupSec: 0.95, activeSec: 1.85, recoverySec: 1, reach: 130 } }
                ]
            },
            {
                hpThreshold: 0.66, invincibleMs: 1500, skills: [
                    { kind: 'echoStep', damage: 16, cooldownSec: 1.8, params: { windupSec: 0.7, activeSec: 0.8, recoverySec: 0.7, shiftDistance: 180 } },
                    { kind: 'echoDance', damage: 22, cooldownSec: 2.4, params: { windupSec: 0.9, activeSec: 1.85, recoverySec: 1, reach: 130 } },
                    { kind: 'echoReplay', damage: 20, cooldownSec: 2.8, params: { windupSec: 1, activeSec: 0.25, recoverySec: 1.25, reach: 130, echoDelaySec: 0.95 } }
                ]
            },
            {
                hpThreshold: 0.33, invincibleMs: 1500, skills: [
                    { kind: 'echoStep', damage: 18, cooldownSec: 1.6, params: { windupSec: 0.65, activeSec: 0.8, recoverySec: 0.7, shiftDistance: 180 } },
                    { kind: 'echoDance', damage: 24, cooldownSec: 2.2, params: { windupSec: 0.85, activeSec: 1.85, recoverySec: 1, reach: 130 } },
                    { kind: 'echoReplay', damage: 22, cooldownSec: 2.5, params: { windupSec: 0.95, activeSec: 0.25, recoverySec: 1.25, reach: 130, echoDelaySec: 0.95 } }
                ]
            }
        ]
    }
];
