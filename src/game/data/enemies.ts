/**
 * DR-01 EnemyDef ×4（巡逻/追击/飞行/精英）+ BossDef ×3（DD-06 三阶段）。
 * HP/接触伤害/移动速度/金币掉落 = SRS 附录 A 敌人表；detectRange/hurtboxSize 在 SRS 5.1 范围内取值。
 * 飞行型 moveSpeed=50（巡航），俯冲 240 px/s 为 FlyerBrain 行为常量（附录 A，不占 moveSpeed 字段）。
 * Boss 技能脚本为配置数据（DD-06），数值域受 V2/V4 校验（damage 5~30、cooldownSec 0.5~8）。
 */
import type { EnemyDef } from '../domain/types';

export const ENEMIES: EnemyDef[] = [
    {
        id: 'enm_patrol', kind: 'patrol', hp: 30, contactDamage: 10,
        moveSpeed: 60, detectRange: 160, coinsDrop: [3, 6],
        lootTableId: 'loot_patrol', hurtboxSize: { w: 28, h: 32 }, phases: []
    },
    {
        id: 'enm_chaser', kind: 'chaser', hp: 45, contactDamage: 14,
        moveSpeed: 130, detectRange: 220, coinsDrop: [6, 10],
        lootTableId: 'loot_chaser', hurtboxSize: { w: 28, h: 34 }, phases: []
    },
    {
        id: 'enm_flyer', kind: 'flyer', hp: 25, contactDamage: 8,
        moveSpeed: 50, detectRange: 220, coinsDrop: [5, 8],
        lootTableId: 'loot_flyer', hurtboxSize: { w: 28, h: 24 }, phases: []
    },
    {
        id: 'enm_elite', kind: 'patrol', hp: 120, contactDamage: 20,
        moveSpeed: 90, detectRange: 200, coinsDrop: [25, 35],
        lootTableId: 'loot_elite', hurtboxSize: { w: 40, h: 48 }, phases: []
    },
    // ---- Boss 1-4 石像守卫者（600 HP，冲撞型）----
    {
        id: 'enm_boss_guardian', kind: 'boss', hp: 600, contactDamage: 25,
        moveSpeed: 70, detectRange: 300, coinsDrop: [150, 150],
        lootTableId: 'loot_boss1', hurtboxSize: { w: 80, h: 96 },
        phases: [
            {
                hpThreshold: 1.0, invincibleMs: 1500, skills: [
                    { kind: 'charge', damage: 25, cooldownSec: 3.0, params: { distance: 240, windupSec: 0.6 } },
                    { kind: 'arenaHazard', damage: 20, cooldownSec: 5.0, params: { count: 3, durationSec: 2.0 } }
                ]
            },
            {
                hpThreshold: 0.66, invincibleMs: 1500, skills: [
                    { kind: 'charge', damage: 25, cooldownSec: 2.4, params: { distance: 300, windupSec: 0.5 } },
                    { kind: 'projectileSpread', damage: 18, cooldownSec: 3.5, params: { count: 3, spreadDeg: 30, speed: 260 } },
                    { kind: 'arenaHazard', damage: 20, cooldownSec: 5.0, params: { count: 4, durationSec: 2.0 } }
                ]
            },
            {
                hpThreshold: 0.33, invincibleMs: 1500, skills: [
                    { kind: 'charge', damage: 25, cooldownSec: 1.8, params: { distance: 360, windupSec: 0.4 } },
                    { kind: 'projectileSpread', damage: 18, cooldownSec: 2.8, params: { count: 5, spreadDeg: 40, speed: 300 } },
                    { kind: 'arenaHazard', damage: 22, cooldownSec: 4.0, params: { count: 5, durationSec: 2.5 } }
                ]
            }
        ]
    },
    // ---- Boss 2-4 深渊蛛后（900 HP，召唤型）----
    {
        id: 'enm_boss_spider', kind: 'boss', hp: 900, contactDamage: 22,
        moveSpeed: 110, detectRange: 300, coinsDrop: [220, 220],
        lootTableId: 'loot_boss2', hurtboxSize: { w: 88, h: 72 },
        phases: [
            {
                hpThreshold: 1.0, invincibleMs: 1500, skills: [
                    { kind: 'summon', damage: 10, cooldownSec: 4.0, params: { count: 2, enemyRef: 0 } },
                    { kind: 'projectileSpread', damage: 16, cooldownSec: 3.0, params: { count: 3, spreadDeg: 24, speed: 240 } }
                ]
            },
            {
                hpThreshold: 0.66, invincibleMs: 1500, skills: [
                    { kind: 'summon', damage: 10, cooldownSec: 3.2, params: { count: 3, enemyRef: 0 } },
                    { kind: 'projectileSpread', damage: 16, cooldownSec: 2.6, params: { count: 5, spreadDeg: 36, speed: 280 } },
                    { kind: 'arenaHazard', damage: 14, cooldownSec: 5.0, params: { count: 2, durationSec: 3.0 } }
                ]
            },
            {
                hpThreshold: 0.33, invincibleMs: 1500, skills: [
                    { kind: 'summon', damage: 12, cooldownSec: 2.6, params: { count: 4, enemyRef: 1 } },
                    { kind: 'projectileSpread', damage: 18, cooldownSec: 2.2, params: { count: 6, spreadDeg: 45, speed: 320 } },
                    { kind: 'arenaHazard', damage: 16, cooldownSec: 4.0, params: { count: 3, durationSec: 3.0 } }
                ]
            }
        ]
    },
    // ---- Boss 3-4 回响之影（1400 HP，复用玩家技能的多阶段 AI）----
    {
        id: 'enm_boss_echo', kind: 'boss', hp: 1400, contactDamage: 28,
        moveSpeed: 130, detectRange: 300, coinsDrop: [320, 320],
        lootTableId: 'loot_boss3', hurtboxSize: { w: 64, h: 88 },
        phases: [
            {
                hpThreshold: 1.0, invincibleMs: 1500, skills: [
                    { kind: 'charge', damage: 28, cooldownSec: 2.8, params: { distance: 260, windupSec: 0.45 } },
                    { kind: 'projectileSpread', damage: 20, cooldownSec: 3.2, params: { count: 3, spreadDeg: 20, speed: 300 } }
                ]
            },
            {
                hpThreshold: 0.66, invincibleMs: 1500, skills: [
                    { kind: 'charge', damage: 28, cooldownSec: 2.2, params: { distance: 320, windupSec: 0.4 } },
                    { kind: 'projectileSpread', damage: 22, cooldownSec: 2.6, params: { count: 5, spreadDeg: 30, speed: 340 } },
                    { kind: 'summon', damage: 14, cooldownSec: 5.0, params: { count: 2, enemyRef: 2 } }
                ]
            },
            {
                hpThreshold: 0.33, invincibleMs: 1500, skills: [
                    { kind: 'charge', damage: 30, cooldownSec: 1.6, params: { distance: 380, windupSec: 0.35 } },
                    { kind: 'projectileSpread', damage: 24, cooldownSec: 2.0, params: { count: 7, spreadDeg: 50, speed: 380 } },
                    { kind: 'summon', damage: 14, cooldownSec: 4.5, params: { count: 3, enemyRef: 2 } }
                ]
            }
        ]
    }
];
