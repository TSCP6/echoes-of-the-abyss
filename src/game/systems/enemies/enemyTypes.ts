import type { Geom } from 'phaser';
import type { EnemyEntity } from './enemyEntity';
import type { BossAttack } from '../boss/bossAttack';

export interface EnemyEvents {
    onBossPhase: (enemy: EnemyEntity, phaseIndex: number) => void;
    onBossSkill: (enemy: EnemyEntity, kind: string, params: Record<string, number>) => void;
    onBossAttackBegan?: (enemy: EnemyEntity, attack: BossAttack) => void;
}

/** Boss 场地危险区矩形（arenaHazard 技能产物，LevelScene 持有并检测） */
export interface ArenaHazard {
    rect: Geom.Rectangle;
    startsAtSec: number;
    untilSec: number;
    damage: number;
    sourceId: string;
}
