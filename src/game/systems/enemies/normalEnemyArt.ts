/** 普通敌人仅配置表现资源；生命、速度、碰撞及伤害仍由 enemies.ts 决定。 */
export const NORMAL_ENEMY_SHEETS = [
    { texture: 'chaser_run', animation: 'chaser-idle', size: 128, frames: 1, fps: 1, repeat: -1 },
    { texture: 'chaser_run', animation: 'chaser-move', size: 128, frames: 6, fps: 8, repeat: -1 },
    { texture: 'chaser_run', animation: 'chaser-hit', size: 128, frames: 1, fps: 1, repeat: 0 },
    { texture: 'flyer_fly', animation: 'flyer-idle', size: 128, frames: 4, fps: 6, repeat: -1 },
    { texture: 'flyer_fly', animation: 'flyer-move', size: 128, frames: 4, fps: 6, repeat: -1 },
    { texture: 'flyer_fly', animation: 'flyer-hit', size: 128, frames: 1, fps: 1, repeat: 0 },
    { texture: 'elite_move', animation: 'elite-idle', size: 128, frames: 4, fps: 4, repeat: -1 },
    { texture: 'elite_move', animation: 'elite-move', size: 128, frames: 4, fps: 6, repeat: -1 },
    { texture: 'elite_move', animation: 'elite-hit', size: 128, frames: 1, fps: 1, repeat: 0 },
    { texture: 'normal_enemy_death', animation: 'normal-enemy-death', size: 128, frames: 6, fps: 10, repeat: 0 }
];

export const NORMAL_ENEMY_PROFILES = {
    enm_chaser: {
        texture: 'chaser_run', size: 128, death: 0.6,
        idle: 'chaser-idle', move: 'chaser-move', hit: 'chaser-hit', phase: 'chaser-idle', windup: 'chaser-idle',
        deathKey: 'normal-enemy-death', facesLeft: true, skills: {}
    },
    enm_flyer: {
        texture: 'flyer_fly', size: 128, death: 0.6,
        idle: 'flyer-idle', move: 'flyer-move', hit: 'flyer-hit', phase: 'flyer-idle', windup: 'flyer-idle',
        deathKey: 'normal-enemy-death', facesLeft: true, skills: {}
    },
    enm_elite: {
        texture: 'elite_move', size: 128, death: 0.6,
        idle: 'elite-idle', move: 'elite-move', hit: 'elite-hit', phase: 'elite-idle', windup: 'elite-idle',
        deathKey: 'normal-enemy-death', facesLeft: true, skills: {}
    }
};
