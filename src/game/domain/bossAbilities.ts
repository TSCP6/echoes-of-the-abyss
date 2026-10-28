import type { BossSkillDef } from './types';

export interface AbilityRect { x: number; y: number; width: number; height: number }
export interface AbilityPoint { x: number; y: number }
export interface BossCastContext {
    bossId: string;
    phase: number;
    direction: 1 | -1;
    origin: AbilityPoint;
    target: AbilityPoint;
    bodyWidth: number;
    arena: AbilityRect;
}
export interface AbilityZone {
    id: string;
    kind: 'hammer' | 'wave' | 'charge' | 'drop' | 'slash' | 'echo' | 'shift' | 'web' | 'egg';
    rect: AbilityRect;
    announcedAt: number;
    startsAt: number;
    endsAt: number;
    damage: number;
    sourceId: string;
    direction: 1 | -1;
    label: string;
}
export interface WebPatch { id: string; rect: AbilityRect; expiresAt: number; slowFactor: number }
export interface SpiderEgg { id: string; rect: AbilityRect; hp: number; hpMax: number; hatchAt: number }
export interface BossMotion { x: number; y: number; alpha: number; facing: 1 | -1 }
export interface BossAbilitySnapshot {
    now: number;
    zones: AbilityZone[];
    webs: WebPatch[];
    eggs: SpiderEgg[];
    motion: BossMotion | null;
}
interface MovingZone { zone: AbilityZone; startX: number; speed: number; minX: number; maxX: number }
interface Cast { skill: BossSkillDef; context: BossCastContext; since: number; destination: number }
interface Pending { at: number; cast: Cast; kind: 'web' | 'eggs' }

export function abilityOverlaps(a: AbilityRect, b: AbilityRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** 独立技能的全部预警、伤害范围和实体生命周期；不导入 Phaser，不读取墙钟。 */
export class BossAbilityField {
    now = 0;
    private serial = 0;
    private zones: AbilityZone[] = [];
    private webs: WebPatch[] = [];
    private eggs: SpiderEgg[] = [];
    private waves: MovingZone[] = [];
    private pending: Pending[] = [];
    private cast: Cast | null = null;
    private motion: BossMotion | null = null;

    get snapshot(): BossAbilitySnapshot { return { now: this.now, zones: this.zones, webs: this.webs, eggs: this.eggs, motion: this.motion }; }
    get damageZones(): AbilityZone[] { return this.zones.filter(z => z.damage > 0 && this.now >= z.startsAt && this.now < z.endsAt); }

    private zone(kind: AbilityZone['kind'], rect: AbilityRect, startsAt: number, duration: number,
        cast: Cast, label: string, damage = cast.skill.damage, direction = cast.context.direction): AbilityZone {
        const z: AbilityZone = { id: `boss_zone_${++this.serial}`, kind, rect: { ...rect }, announcedAt: this.now,
            startsAt, endsAt: startsAt + duration, damage, sourceId: cast.context.bossId, direction, label };
        this.zones.push(z);
        return z;
    }

    begin(skill: BossSkillDef, context: BossCastContext): void {
        // 捕获施招位置和目标，玩家之后的位移不会偷偷改变预警。
        const c: BossCastContext = { ...context, origin: { ...context.origin }, target: { ...context.target }, arena: { ...context.arena } };
        const floor = c.arena.y + c.arena.height;
        const destination = clamp(c.target.x + c.direction * (skill.params.shiftDistance ?? 180),
            c.arena.x + 100, c.arena.x + c.arena.width - 100);
        const cast: Cast = { skill, context: c, since: this.now, destination };
        this.cast = cast;
        const start = this.now + (skill.params.windupSec ?? 0.8);
        const reach = skill.params.reach ?? 130;
        const edge = c.origin.x + c.direction * (c.bodyWidth / 2 + 8);
        const frontal = (width: number, height: number): AbilityRect => ({
            x: c.direction === 1 ? edge : edge - width, y: floor - height, width, height
        });
        switch (skill.kind) {
            case 'guardianHammer':
                this.zone('hammer', frontal(reach, 80), start, skill.params.activeSec ?? 0.25, cast, '裂地重锤 · 离开前方裂纹');
                break;
            case 'guardianStomp':
                for (const direction of [-1, 1] as const) {
                    const width = 48, height = skill.params.waveHeight ?? 24;
                    const x = c.origin.x + direction * (c.bodyWidth / 2 + 24) - width / 2;
                    const z = this.zone('wave', { x, y: floor - height, width, height }, start, 5.8, cast, '踏地震波 · 跳跃躲避', skill.damage, direction);
                    this.waves.push({ zone: z, startX: x, speed: (skill.params.waveSpeed ?? 230) * direction,
                        minX: c.arena.x, maxX: c.arena.x + c.arena.width });
                }
                break;
            case 'charge': {
                const left = c.direction === 1 ? c.origin.x : c.arena.x;
                const right = c.direction === 1 ? c.arena.x + c.arena.width : c.origin.x;
                this.zone('charge', { x: left, y: floor - 86, width: right - left, height: 86 }, start,
                    skill.params.activeSec ?? 2.4, cast, '岩甲冲撞 · 跳过冲撞，撞墙后反击');
                break;
            }
            case 'spiderWeb': {
                const width = Math.min(skill.params.width ?? 150, c.arena.width / 4);
                const x = clamp(c.target.x - width / 2, c.arena.x + 50, c.arena.x + c.arena.width - width - 50);
                this.zone('web', { x, y: floor - 12, width, height: 12 }, start, 0.15, cast, '织网封路 · 留意纤维范围', 0);
                this.pending.push({ at: start, cast, kind: 'web' });
                break;
            }
            case 'spiderEggs': {
                const slots = Math.min(2 - this.eggs.length, Math.max(0, Math.floor(skill.params.count ?? 2)));
                for (let n = 0; n < slots; n++) {
                    const x = clamp(c.origin.x + (n % 2 === 0 ? -160 : 160), c.arena.x + 40, c.arena.x + c.arena.width - 40);
                    this.zone('egg', { x: x - 18, y: floor - 42, width: 36, height: 42 }, start, 0.15, cast, '孵化蛛卵 · 可攻击打碎', 0);
                }
                this.pending.push({ at: start, cast, kind: 'eggs' });
                break;
            }
            case 'spiderDrop': {
                const width = skill.params.width ?? 140;
                const x = clamp(c.target.x, c.arena.x + width / 2, c.arena.x + c.arena.width - width / 2);
                cast.destination = x;
                this.zone('drop', { x: x - width / 2, y: floor - 72, width, height: 72 }, start + 0.3,
                    Math.max(0.05, Math.min(0.25, (skill.params.activeSec ?? 0.4) - 0.3)), cast, '吊顶俯袭 · 离开落点光环');
                break;
            }
            case 'echoStep': {
                const direction = c.target.x >= destination ? 1 : -1;
                this.zone('shift', { x: destination - 32, y: floor - 100, width: 64, height: 100 }, start,
                    0.55, cast, '瞬影换位 · 标记位置即将现身', 0, direction);
                this.zone('slash', { x: direction === 1 ? destination + 28 : destination - 158,
                    y: floor - 66, width: 130, height: 58 }, start + 0.55, 0.2, cast, '拔剑 · 后退或跳跃', skill.damage, direction);
                break;
            }
            case 'echoDance': {
                const tempo = skill.params.tempo ?? 1;
                this.zone('slash', frontal(reach, 64), start, 0.18, cast, '剑舞 · 第一横斩');
                this.zone('slash', frontal(reach + 18, 64), start + 0.55 * tempo, 0.18, cast, '剑舞 · 第二横斩');
                const x = clamp(c.target.x, c.origin.x - reach - 70, c.origin.x + reach + 70);
                this.zone('slash', { x: x - 48, y: floor - 128, width: 96, height: 128 }, start + 1.35 * tempo,
                    0.24, cast, '剑舞 · 重劈，离开竖直剑痕');
                break;
            }
            case 'echoReplay': {
                // 待触发回响唯一，原坐标重放同一剑痕，绝不追踪玩家。
                this.zones = this.zones.filter(z => z.kind !== 'echo');
                const r = frontal(reach, 64);
                this.zone('slash', r, start, 0.2, cast, '回响剑 · 避开横斩');
                this.zone('echo', r, start + (skill.params.echoDelaySec ?? 0.95), 0.24, cast, '延迟回响 · 别返回原剑痕');
                break;
            }
        }
    }

    /** 返回本帧孵化点；实际召唤实体由呈现桥接创建。 */
    tick(dt: number, pose?: AbilityPoint, attackStage?: 'windup' | 'active' | 'recovery', liveMinions = 0): AbilityPoint[] {
        this.now += Math.max(0, Math.min(dt, 0.1));
        const due = this.pending.filter(p => p.at <= this.now + 1e-8);
        this.pending = this.pending.filter(p => p.at > this.now + 1e-8);
        for (const p of due) {
            const { skill, context: c } = p.cast;
            const floor = c.arena.y + c.arena.height;
            if (p.kind === 'web') {
                const width = Math.min(skill.params.width ?? 150, c.arena.width / 4);
                const x = clamp(c.target.x - width / 2, c.arena.x + 50, c.arena.x + c.arena.width - width - 50);
                this.webs.push({ id: `web_${++this.serial}`, rect: { x, y: floor - 12, width, height: 12 },
                    expiresAt: this.now + (skill.params.durationSec ?? 5), slowFactor: skill.params.slowFactor ?? 0.65 });
                this.webs = this.webs.slice(-2);
            } else {
                const slots = Math.min(2 - this.eggs.length, Math.max(0, Math.floor(skill.params.count ?? 2)));
                for (let n = 0; n < slots; n++) {
                    const x = clamp(c.origin.x + (n % 2 === 0 ? -160 : 160), c.arena.x + 40, c.arena.x + c.arena.width - 40);
                    this.eggs.push({ id: `egg_${++this.serial}`, rect: { x: x - 18, y: floor - 42, width: 36, height: 42 },
                        hp: 18, hpMax: 18, hatchAt: this.now + (skill.params.hatchSec ?? 3) });
                }
            }
        }
        const summons: AbilityPoint[] = [];
        this.eggs = this.eggs.filter(egg => {
            if (egg.hp <= 0) return false;
            if (egg.hatchAt <= this.now && liveMinions + summons.length < 3) {
                summons.push({ x: egg.rect.x + egg.rect.width / 2, y: egg.rect.y + egg.rect.height - 24 });
                return false;
            }
            return true;
        });
        this.webs = this.webs.filter(w => w.expiresAt > this.now);
        for (const wave of this.waves) {
            if (this.now < wave.zone.startsAt) continue;
            wave.zone.rect.x = wave.startX + (this.now - wave.zone.startsAt) * wave.speed;
            if (wave.zone.rect.x + wave.zone.rect.width < wave.minX || wave.zone.rect.x > wave.maxX) wave.zone.endsAt = this.now;
        }
        this.zones = this.zones.filter(z => z.endsAt > this.now);
        this.waves = this.waves.filter(w => w.zone.endsAt > this.now);
        this.motion = null;
        const cast = this.cast;
        if (cast !== null) {
            const { skill, context: c } = cast;
            const age = this.now - cast.since, windup = skill.params.windupSec ?? 0.8;
            const floor = c.arena.y + c.arena.height;
            if (skill.kind === 'charge') {
                const z = this.zones.find(z => z.kind === 'charge');
                if (z && (attackStage === 'recovery' || age > windup + (skill.params.activeSec ?? 2.4))) z.endsAt = this.now;
                else if (z && age >= windup && pose) {
                    z.rect = { x: pose.x - c.bodyWidth / 2 - 18, y: floor - 86, width: c.bodyWidth + 36, height: 86 };
                }
            } else if (skill.kind === 'spiderDrop' && age < windup + 0.3 + 1e-8) {
                const rise = clamp(age / Math.min(windup, 0.45), 0, 1);
                const fall = clamp((age - windup) / 0.3, 0, 1);
                this.motion = { x: c.origin.x + (cast.destination - c.origin.x) * rise,
                    y: floor - 24 - (skill.params.liftHeight ?? 260) * rise * (1 - fall), alpha: 1, facing: c.direction };
            } else if (skill.kind === 'echoStep' && age < windup + (skill.params.activeSec ?? 0.8)) {
                const moved = age >= windup;
                this.motion = { x: moved ? cast.destination : c.origin.x, y: floor - 24,
                    alpha: moved ? 1 : 0.4, facing: moved ? (c.target.x >= cast.destination ? 1 : -1) : c.direction };
            }
            const total = windup + (skill.params.activeSec ?? 0.3) + (skill.params.recoverySec ?? 1);
            if (age > total + 0.1) this.cast = null;
        }
        return summons;
    }

    hitEgg(id: string, damage: number): boolean {
        const egg = this.eggs.find(e => e.id === id);
        if (!egg || !Number.isFinite(damage) || damage <= 0) return false;
        egg.hp = Math.max(0, egg.hp - damage);
        if (egg.hp === 0) this.eggs = this.eggs.filter(e => e !== egg);
        return true;
    }

    slowFactor(body: AbilityRect): number {
        return this.webs.reduce((factor, w) => abilityOverlaps(body, w.rect) ? Math.min(factor, w.slowFactor) : factor, 1);
    }

    clear(): void {
        this.zones = []; this.webs = []; this.eggs = []; this.waves = []; this.pending = [];
        this.cast = null; this.motion = null;
    }

    stopCharge(): void { this.zones = this.zones.filter(z => z.kind !== 'charge'); }
}
