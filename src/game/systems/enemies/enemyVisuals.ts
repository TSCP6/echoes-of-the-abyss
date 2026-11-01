import type { Physics, Scene } from 'phaser';
import { NORMAL_ENEMY_PROFILES, NORMAL_ENEMY_SHEETS } from './normalEnemyArt';

const SHEETS = [
    ...NORMAL_ENEMY_SHEETS,
    { texture: 'ant_run', animation: 'ant-run', size: 96, frames: 8, fps: 6, repeat: -1 },
    { texture: 'ant_run', animation: 'ant-idle', size: 96, frames: 1, fps: 1, repeat: -1 },
    { texture: 'guardian_idle', animation: 'guardian-idle', size: 200, frames: 4, fps: 8, repeat: -1 },
    { texture: 'guardian_glow', animation: 'guardian-glow', size: 200, frames: 8, fps: 10, repeat: -1 },
    { texture: 'guardian_shoot', animation: 'guardian-shoot', size: 200, frames: 9, fps: 10, repeat: 0 },
    { texture: 'guardian_immune', animation: 'guardian-immune', size: 200, frames: 8, fps: 12, repeat: 0 },
    { texture: 'guardian_melee', animation: 'guardian-melee', size: 200, frames: 7, fps: 10, repeat: 0 },
    { texture: 'guardian_melee', animation: 'guardian-hammer', size: 200, frames: 7, fps: 12, repeat: 0 },
    { texture: 'guardian_shoot', animation: 'guardian-stomp', size: 200, frames: 9, fps: 14, repeat: 0 },
    { texture: 'guardian_immune', animation: 'guardian-charge', size: 200, frames: 8, fps: 14, repeat: -1 },
    { texture: 'guardian_death', animation: 'guardian-death', size: 200, frames: 14, fps: 10, repeat: 0 },
    { texture: 'spider_idle', animation: 'spider-idle', size: 160, frames: 4, fps: 6, repeat: -1 },
    { texture: 'spider_move', animation: 'spider-move', size: 160, frames: 4, fps: 8, repeat: -1 },
    { texture: 'spider_cast', animation: 'spider-summon', size: 160, frames: 3, fps: 8, repeat: 0 },
    { texture: 'spider_cast', animation: 'spider-shoot', size: 160, frames: 3, fps: 10, repeat: 0 },
    { texture: 'spider_cast', animation: 'spider-hazard', size: 160, frames: 3, fps: 8, repeat: 0 },
    { texture: 'spider_cast', animation: 'spider-web', size: 160, frames: 3, fps: 10, repeat: 0 },
    { texture: 'spider_cast', animation: 'spider-eggs', size: 160, frames: 3, fps: 6, repeat: 0 },
    { texture: 'spider_cast', animation: 'spider-hang', size: 160, frames: 3, fps: 6, repeat: 0 },
    { texture: 'spider_move', animation: 'spider-drop', size: 160, frames: 4, fps: 14, repeat: 0 },
    { texture: 'spider_idle', animation: 'spider-phase', size: 160, frames: 4, fps: 12, repeat: -1 },
    { texture: 'spider_cast', animation: 'spider-hit', size: 160, frames: 1, fps: 1, repeat: 0 },
    { texture: 'spider_death', animation: 'spider-death', size: 160, frames: 4, fps: 8, repeat: 0 },
    { texture: 'spiderling_idle', animation: 'spiderling-idle', size: 80, frames: 4, fps: 6, repeat: -1 },
    { texture: 'spiderling_move', animation: 'spiderling-move', size: 80, frames: 4, fps: 8, repeat: -1 },
    { texture: 'spiderling_cast', animation: 'spiderling-hit', size: 80, frames: 1, fps: 1, repeat: 0 },
    { texture: 'spiderling_death', animation: 'spiderling-death', size: 80, frames: 4, fps: 8, repeat: 0 },
    { texture: 'echo_idle', animation: 'echo-idle', size: 200, frames: 4, fps: 8, repeat: -1 },
    { texture: 'echo_phase', animation: 'echo-phase', size: 200, frames: 8, fps: 10, repeat: -1 },
    { texture: 'echo_charge', animation: 'echo-charge', size: 200, frames: 12, fps: 18, repeat: 0 },
    { texture: 'echo_shoot', animation: 'echo-shoot', size: 200, frames: 13, fps: 20, repeat: 0 },
    { texture: 'echo_summon', animation: 'echo-summon', size: 200, frames: 5, fps: 8, repeat: 0 },
    { texture: 'echo_charge', animation: 'echo-step', size: 200, frames: 12, fps: 20, repeat: 0 },
    { texture: 'echo_shoot', animation: 'echo-dance', size: 200, frames: 13, fps: 16, repeat: 1 },
    { texture: 'echo_shoot', animation: 'echo-replay', size: 200, frames: 13, fps: 20, repeat: 0 },
    { texture: 'echo_idle', animation: 'echo-hit', size: 200, frames: 1, fps: 1, repeat: 0 },
    { texture: 'echo_death', animation: 'echo-death', size: 200, frames: 18, fps: 10, repeat: 0 },
    { texture: 'echo_spirit_idle', animation: 'echo-spirit-idle', size: 150, frames: 4, fps: 8, repeat: -1 },
    { texture: 'echo_spirit_appear', animation: 'echo-spirit-appear', size: 150, frames: 6, fps: 10, repeat: 0 },
    { texture: 'echo_spirit_death', animation: 'echo-spirit-death', size: 150, frames: 5, fps: 10, repeat: 0 }
];

export function loadEnemyArt(scene: Scene): void {
    const loaded = new Set<string>();
    for (const sheet of SHEETS) {
        if (loaded.has(sheet.texture)) { continue; }
        loaded.add(sheet.texture);
        scene.load.spritesheet(sheet.texture, `art/enemies/${sheet.texture}.png`, {
            frameWidth: sheet.size, frameHeight: sheet.size
        });
    }
}

export function registerEnemyAnimations(scene: Scene): void {
    for (const sheet of SHEETS) {
        if (scene.anims.exists(sheet.animation)) { continue; }
        scene.anims.create({
            key: sheet.animation,
            frames: scene.anims.generateFrameNumbers(sheet.texture, { start: 0, end: sheet.frames - 1 }),
            frameRate: sheet.fps, repeat: sheet.repeat
        });
    }
}

export function enemyTexture(id: string, kind: string): string {
    if (id in NORMAL_ENEMY_PROFILES) { return NORMAL_ENEMY_PROFILES[id as keyof typeof NORMAL_ENEMY_PROFILES].texture; }
    if (id === 'enm_patrol') { return 'ant_run'; }
    if (id === 'enm_boss_guardian') { return 'guardian_idle'; }
    if (id === 'enm_boss_spider') { return 'spider_idle'; }
    if (id === 'enm_boss_echo') { return 'echo_idle'; }
    if (id === 'echo_spirit') { return 'echo_spirit_idle'; }
    if (id === 'spiderling') { return 'spiderling_idle'; }
    return `enemy_${kind}`;
}

type VisualState = 'idle' | 'move' | 'hit' | 'phase' | 'dead';

interface VisualProfile {
    size: number; death: number; idle: string; move: string; hit: string; phase: string;
    skills: Record<string, { key: string; duration: number; windup?: string }>;
    windup: string;
    appear?: string;
    deathKey?: string;
    facesLeft?: boolean;
}

const PROFILES: Record<string, VisualProfile> = {
    ...NORMAL_ENEMY_PROFILES,
    enm_boss_guardian: {
        size: 200, death: 1.4, idle: 'guardian-idle', move: 'guardian-idle', hit: 'guardian-immune', phase: 'guardian-glow', windup: 'guardian-glow',
        skills: {
            guardianHammer: { key: 'guardian-hammer', duration: 0.6, windup: 'guardian-glow' },
            guardianStomp: { key: 'guardian-stomp', duration: 0.65, windup: 'guardian-immune' },
            charge: { key: 'guardian-charge', duration: 0.6, windup: 'guardian-glow' },
            projectileSpread: { key: 'guardian-shoot', duration: 0.9 }, arenaHazard: { key: 'guardian-glow', duration: 0.8 }
        }
    },
    enm_boss_spider: {
        size: 160, death: 0.5, idle: 'spider-idle', move: 'spider-move', hit: 'spider-hit', phase: 'spider-phase', windup: 'spider-summon',
        skills: {
            spiderWeb: { key: 'spider-web', duration: 0.35, windup: 'spider-hazard' },
            spiderEggs: { key: 'spider-eggs', duration: 0.5, windup: 'spider-summon' },
            spiderDrop: { key: 'spider-drop', duration: 0.4, windup: 'spider-hang' },
            summon: { key: 'spider-summon', duration: 0.5 }, projectileSpread: { key: 'spider-shoot', duration: 0.4 }, arenaHazard: { key: 'spider-hazard', duration: 0.5 }
        }
    },
    enm_boss_echo: {
        size: 200, death: 1.8, idle: 'echo-idle', move: 'echo-idle', hit: 'echo-hit', phase: 'echo-phase', windup: 'echo-phase',
        skills: {
            echoStep: { key: 'echo-step', duration: 0.6, windup: 'echo-phase' },
            echoDance: { key: 'echo-dance', duration: 13 / 16 * 2, windup: 'echo-summon' },
            echoReplay: { key: 'echo-replay', duration: 0.65, windup: 'echo-phase' },
            charge: { key: 'echo-charge', duration: 0.7 }, projectileSpread: { key: 'echo-shoot', duration: 0.65 }, summon: { key: 'echo-summon', duration: 0.65 }
        }
    },
    echo_spirit: {
        size: 150, death: 0.5, idle: 'echo-spirit-idle', move: 'echo-spirit-idle', hit: 'echo-spirit-idle', phase: 'echo-spirit-idle', windup: 'echo-spirit-idle',
        skills: {}, appear: 'echo-spirit-appear'
    },
    spiderling: {
        size: 80, death: 0.5, idle: 'spiderling-idle', move: 'spiderling-move', hit: 'spiderling-hit', phase: 'spiderling-idle', windup: 'spiderling-idle', skills: {}
    }
};

/** Presentation only: skill clips never control damage or interrupt the AI. */
export class EnemyVisual {
    readonly frameSize: number;
    readonly deathDuration: number;
    readonly hasArt: boolean;
    private readonly profile: VisualProfile | undefined;
    private readonly ant: boolean;
    private currentKey = '';
    private state: VisualState = 'idle';
    private actionRemaining = 0;
    private deathElapsed = 0;

    constructor(private sprite: Physics.Arcade.Sprite, private id: string) {
        this.profile = PROFILES[id];
        this.ant = id === 'enm_patrol';
        this.hasArt = this.profile !== undefined || this.ant;
        this.frameSize = this.profile?.size ?? (this.ant ? 96 : 48);
        this.deathDuration = this.profile?.death ?? 0.4;
        this.reset();
    }

    private play(key: string): void {
        if (this.currentKey === key) { return; }
        this.currentKey = key;
        this.sprite.play(key);
    }

    face(direction: 1 | -1): void {
        this.sprite.setFlipX((this.profile?.facesLeft ?? this.ant) ? direction > 0 : direction < 0);
    }

    /** 视觉保持时间由实际技能窗口提供；省略时使用素材本身的播放长度。 */
    skill(kind: string, activeDuration?: number): void {
        if (this.state === 'dead') { return; }
        const clip = this.profile?.skills[kind];
        if (clip === undefined) { return; }
        this.actionRemaining = activeDuration !== undefined && Number.isFinite(activeDuration) && activeDuration >= 0
            ? activeDuration : clip.duration;
        this.currentKey = ''; // A release can reuse the windup sheet; restart it once.
        this.play(clip.key);
    }

    windup(kind = ''): void {
        if (this.profile === undefined || this.state === 'dead') { return; }
        this.actionRemaining = Number.POSITIVE_INFINITY;
        this.play(this.profile.skills[kind]?.windup
            ?? (kind === 'summon' ? this.profile.skills.summon?.key ?? this.profile.windup : this.profile.windup));
    }

    update(dt: number, state: VisualState, sleeping = false): void {
        if (!this.hasArt) { return; }
        if (sleeping) { this.sprite.anims.pause(); return; }
        if (this.sprite.anims.isPaused) { this.sprite.anims.resume(); }
        this.actionRemaining = Math.max(0, this.actionRemaining - dt);
        if (state === 'dead') {
            this.actionRemaining = 0;
            if (this.profile !== undefined) {
                this.play(this.profile.deathKey ?? (this.id === 'echo_spirit' ? 'echo-spirit-death' : `${this.id.replace('enm_boss_', '')}-death`));
            } else {
                this.sprite.anims.stop();
                this.deathElapsed += dt;
                this.sprite.setAlpha(Math.max(0, 1 - this.deathElapsed / this.deathDuration));
            }
        } else if (state === 'phase') {
            this.actionRemaining = 0;
            if (this.profile !== undefined) { this.play(this.profile.phase); }
        } else if (state === 'hit') {
            this.actionRemaining = 0;
            if (this.profile !== undefined) { this.play(this.profile.hit); }
            else { this.sprite.anims.pause(); }
        } else if (this.actionRemaining === 0) {
            this.play(this.profile !== undefined ? (state === 'move' ? this.profile.move : this.profile.idle)
                : state === 'move' ? 'ant-run' : 'ant-idle');
        }
        this.state = state;
    }

    reset(): void {
        this.actionRemaining = 0;
        this.deathElapsed = 0;
        this.state = 'idle';
        this.currentKey = '';
        this.sprite.setAlpha(1);
        if (this.sprite.anims.isPaused) { this.sprite.anims.resume(); }
        if (this.profile?.appear !== undefined) {
            this.actionRemaining = 0.6;
            this.play(this.profile.appear);
        } else if (this.hasArt) { this.play(this.profile?.idle ?? 'ant-idle'); }
    }
}
