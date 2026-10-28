import type { GameObjects, Scene } from 'phaser';
import type { SkillDef, WeaponDef } from '../domain/types';
import { PLAYER_SKILL_ART, PLAYER_WEAPON_ART, type SkillArtKind, type WeaponArtKind } from '../data/playerCombatArt';
import type { PlayerController } from './playerController';

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
interface Effect {
    kind: SkillArtKind | WeaponArtKind;
    color: number; x: number; y: number; facing: number;
    age: number; duration: number; radius: number;
    rect?: Rect;
    samples: { x: number; y: number; age: number }[];
}
const MAX_EFFECTS = 16;

function polygon(g: GameObjects.Graphics, points: readonly Point[]): void {
    const first = points[0];
    if (first === undefined) { return; }
    g.beginPath().moveTo(first.x, first.y);
    for (const point of points.slice(1)) { g.lineTo(point.x, point.y); }
    g.closePath().fillPath();
}

/** 两个持久图形对象，秒制 update 驱动，无计时器、粒子对象或命中判定。 */
export class PlayerCombatFx {
    private readonly held: GameObjects.Graphics;
    private readonly effects: GameObjects.Graphics;
    private equipped: WeaponDef | null = null;
    private attack: { def: WeaponDef; age: number; duration: number } | null = null;
    private pending: Effect[] = [];
    private disposed = false;
    private readonly onShutdown = (): void => this.destroy();

    constructor(private readonly scene: Scene, private readonly player: PlayerController) {
        this.held = scene.add.graphics().setDepth(12).setName('player-held-weapon');
        this.effects = scene.add.graphics().setDepth(13).setName('player-combat-effects');
        scene.events.once('shutdown', this.onShutdown);
    }

    setEquipped(def: WeaponDef | null): void { this.equipped = def; }

    weapon(def: WeaponDef, rect?: Rect, duration = 0.1): void {
        const art = PLAYER_WEAPON_ART[def.id];
        if (this.disposed || art === undefined) { return; }
        const life = Math.max(0.1, Number.isFinite(duration) ? duration : 0.1);
        // 主手每帧同步装备时，副手施放仍维持完整后坐/回弹动作。
        this.attack = { def, age: 0, duration: Math.max(life, def.type === 'melee' ? 0.22 : 0.18) };
        if (def.type === 'melee' && (rect === undefined || rect.width <= 0 || rect.height <= 0)) { return; }
        this.add(art.kind, art.color, life, 0, rect);
    }

    skill(id: string, effect: SkillDef['effect']): void {
        const art = PLAYER_SKILL_ART[id];
        if (art === undefined || art.kind === 'passive' || this.disposed) { return; }
        const isDash = art.kind === 'dash' || art.kind === 'blink';
        this.add(art.kind, art.color, isDash ? Math.max(0.2, (effect.invincibleMs ?? 200) / 1000) : 0.52,
            effect.radius ?? 0);
    }

    /** 解锁通知可在暂停时排入，时间仅在恢复后的 update 中推进。 */
    passive(id: string): void {
        const art = PLAYER_SKILL_ART[id];
        if (art?.kind === 'passive' && !this.disposed) { this.add('passive', art.color, 0.65, 0); }
    }

    private add(kind: Effect['kind'], color: number, duration: number, radius: number, rect?: Rect): void {
        const p = this.player.sprite;
        if (this.pending.length >= MAX_EFFECTS) { this.pending.shift(); }
        this.pending.push({ kind, color, x: p.x, y: p.y, facing: this.player.getFacing(),
            age: 0, duration, radius, rect: rect === undefined ? undefined : { ...rect }, samples: [] });
    }

    update(dt: number): void {
        if (this.disposed) { return; }
        this.held.clear(); this.effects.clear();
        if (!this.player.sprite.active || this.player.getState() === 'dead') { this.clear(); return; }
        const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (this.attack !== null) {
            this.attack.age += delta;
            if (this.attack.age >= this.attack.duration) { this.attack = null; }
        }
        this.drawHeld();
        for (const fx of this.pending) {
            fx.age += delta;
            if (fx.age >= fx.duration) { continue; }
            this.drawEffect(fx, delta);
        }
        this.pending = this.pending.filter(fx => fx.age < fx.duration);
    }

    private drawHeld(): void {
        const def = this.attack?.def ?? this.equipped;
        if (def == null) { return; }
        const art = PLAYER_WEAPON_ART[def.id];
        if (art === undefined) { return; }
        const g = this.held;
        const p = this.player.body.center;
        const t = this.attack === null ? 0 : this.attack.age / this.attack.duration;
        const swing = this.attack === null ? 0 : Math.sin(t * Math.PI);
        const melee = def.type === 'melee';
        g.setPosition(melee ? p.x + this.player.getFacing() * 8 : this.player.sprite.x + this.player.getFacing() * (-7 - swing * 3),
            melee ? p.y + 4 : this.player.sprite.y - 6)
            .setScale(this.player.getFacing(), 1)
            .setRotation(melee ? (this.attack === null ? -0.55 : -1.6 + t * 2.9) * this.player.getFacing() : 0);
        // 暗色背衬确保实体武器在明亮平台前依然清晰。
        g.lineStyle(6, 0x152031, 1).lineBetween(-3, 0, 27, 0);
        g.fillStyle(0x84654a, 1).fillRect(-6, -3, 12, 6);
        if (art.kind === 'sword' || art.kind === 'daggers') {
            const blade = (y: number, length: number) => {
                g.fillStyle(art.color, 1); polygon(g, [{ x: 4, y: y - 3 }, { x: length - 5, y: y - 3 }, { x: length, y }, { x: length - 5, y: y + 3 }, { x: 4, y: y + 3 }]);
                g.lineStyle(1, 0x7099bf).lineBetween(7, y + 1, length - 5, y + 1);
                g.fillStyle(0xd2a85e).fillRect(2, y - 6, 3, 12);
            };
            blade(0, art.kind === 'daggers' ? 20 : 31);
            if (art.kind === 'daggers') { blade(10, 18); }
        } else if (art.kind === 'axe') {
            g.fillStyle(0x926745).fillRect(-6, -2, 35, 4);
            g.fillStyle(art.color); polygon(g, [{ x: 18, y: -15 }, { x: 30, y: -12 }, { x: 35, y: 0 }, { x: 30, y: 12 }, { x: 18, y: 15 }, { x: 22, y: 0 }]);
            g.lineStyle(2, 0xffecc3).lineBetween(30, -11, 34, 0).lineBetween(34, 0, 30, 11);
        } else if (art.kind === 'crossbow') {
            g.fillStyle(art.color).fillRect(0, -3, 27, 6);
            g.lineStyle(4, 0x986b42).lineBetween(18, 0, 23 - swing * 5, -15).lineBetween(18, 0, 23 - swing * 5, 15);
            g.lineStyle(1.5, 0xf7eed1).lineBetween(23 - swing * 5, -15, 8 + swing * 8, 0).lineBetween(8 + swing * 8, 0, 23 - swing * 5, 15);
        } else if (art.kind === 'dartgun') {
            g.fillStyle(0x40546c).fillRect(1, -6, 25, 12);
            g.fillStyle(art.color).fillRect(9, -4, 19, 3).fillRect(24, -6, 4, 12);
            g.fillStyle(0x21364c).fillRect(3, 4, 7, 9);
        } else {
            g.fillStyle(0x9b704c).fillRect(-5, -3, 30, 6);
            g.fillStyle(art.color).fillCircle(26, 0, 7);
            g.fillStyle(0xffd377).fillTriangle(21, -1, 27, -12 - swing * 4, 31, 2);
            g.fillStyle(0xfff4bb).fillCircle(27, -1, 3);
        }
        // 手掌将武器和角色身体连起来，保留原角色全身动画。
        g.fillStyle(0x7bad63).fillCircle(0, 1, 4);
    }

    private drawEffect(fx: Effect, delta: number): void {
        const g = this.effects;
        const t = fx.age / fx.duration;
        const alpha = Math.min(1, (1 - t) * 2);
        if (fx.rect !== undefined) { this.drawMelee(fx, t, alpha); return; }
        const p = this.player.body.center;
        g.lineStyle(3, fx.color, alpha).fillStyle(fx.color, alpha);
        if (fx.kind === 'dash' || fx.kind === 'blink') {
            for (const sample of fx.samples) { sample.age += delta; }
            fx.samples = fx.samples.filter(s => s.age < 0.18);
            const last = fx.samples[fx.samples.length - 1];
            if (last === undefined || Math.hypot(last.x - p.x, last.y - p.y) >= 7) {
                fx.samples.push({ x: p.x, y: p.y, age: 0 });
                if (fx.samples.length > 10) { fx.samples.shift(); }
            }
            for (const sample of fx.samples) {
                const a = (1 - sample.age / 0.18) * 0.55;
                g.fillStyle(fx.color, a).fillEllipse(sample.x, sample.y - 1, 21, 31);
                g.lineStyle(2, fx.color, a).strokeEllipse(sample.x, sample.y + 16, 24, 7);
                g.fillStyle(0xeafaff, a).fillCircle(sample.x + fx.facing * 5, sample.y - 8, 3);
            }
        } else if (fx.kind === 'heal') {
            g.lineStyle(2, fx.color, alpha).strokeEllipse(p.x, p.y + 20, 42 + t * 16, 12);
            for (let i = 0; i < 3; i++) {
                const x = p.x + (i - 1) * 17; const y = p.y - 6 - t * 32 + i % 2 * 14;
                g.fillStyle(fx.color, alpha).fillRect(x - 2, y - 7, 4, 14).fillRect(x - 7, y - 2, 14, 4);
            }
        } else if (fx.kind === 'passive') {
            g.strokeEllipse(p.x, p.y + 17, 28 + t * 14, 10);
            g.fillTriangle(p.x, p.y - 28 - t * 10, p.x - 4, p.y - 23 - t * 10, p.x + 4, p.y - 23 - t * 10);
        } else if (fx.kind === 'whirlwind' || fx.kind === 'fury' || fx.kind === 'storm') {
            // 半径由已成功施放技能的 effect 提供，轮廓外缘不越过真实圆形范围。
            const radius = Math.max(0, fx.radius - 4);
            if (radius <= 0) { return; }
            const r = radius * (0.65 + 0.35 * Math.sin(t * Math.PI / 2));
            if (fx.kind === 'fury') {
                const d = r / Math.SQRT2;
                g.lineStyle(7, fx.color, alpha).lineBetween(fx.x - d, fx.y - d, fx.x + d, fx.y + d)
                    .lineBetween(fx.x - d, fx.y + d, fx.x + d, fx.y - d);
                g.lineStyle(2, 0xfff3d1, alpha).strokeCircle(fx.x, fx.y, r * 0.65);
            } else {
                const count = fx.kind === 'storm' ? 8 : 3;
                for (let i = 0; i < count; i++) {
                    const a = t * Math.PI * 2 + i * Math.PI * 2 / count;
                    g.lineStyle(fx.kind === 'storm' ? 5 : 4, fx.color, alpha).beginPath()
                        .arc(fx.x, fx.y, r, a, a + (fx.kind === 'storm' ? 0.4 : 1.35)).strokePath();
                    if (fx.kind === 'storm') {
                        const x = fx.x + Math.cos(a) * r; const y = fx.y + Math.sin(a) * r;
                        g.fillStyle(0xf3e9ff, alpha).fillTriangle(x, y, x - Math.cos(a - 0.4) * 14, y - Math.sin(a - 0.4) * 14, x - Math.cos(a + 0.4) * 14, y - Math.sin(a + 0.4) * 14);
                    }
                }
            }
        } else {
            // 远程只表现真实发射位置，不绘制尚未命中的扇形或长距离弹道。
            const x = fx.x + fx.facing * 20; const y = fx.y - 6;
            if (fx.kind === 'multishot' || fx.kind === 'volley' || fx.kind === 'rain') {
                const count = fx.kind === 'multishot' ? 3 : fx.kind === 'volley' ? 4 : 5;
                for (let i = 0; i < count; i++) {
                    const a = -Math.PI / 2 + i * Math.PI / (count - 1);
                    const r = 7 + t * (fx.kind === 'rain' ? 14 : 8);
                    g.fillCircle(x + Math.cos(a) * r * fx.facing, y + Math.sin(a) * r, 2.5);
                }
                g.lineStyle(2, fx.color, alpha).strokeCircle(x, y, 6 + (fx.kind === 'rain' ? (t * 3 % 1) : t) * 10);
            } else if (fx.kind === 'firestaff') {
                g.fillTriangle(x - fx.facing * 4, y - 7, x + fx.facing * (14 - t * 7), y, x - fx.facing * 4, y + 7);
                g.fillStyle(0xffedac, alpha).fillCircle(x, y, 4);
            } else {
                g.fillTriangle(x, y - 5, x + fx.facing * 12, y, x, y + 5);
                g.fillStyle(0xf4fffa, alpha).fillCircle(x, y, 2);
            }
        }
    }

    private drawMelee(fx: Effect, t: number, alpha: number): void {
        const r = fx.rect!;
        const g = this.effects;
        // 所有点均从盒内归一化坐标构造；填充多边形没有描边溢出。
        const point = (x: number, y: number): Point => ({
            x: r.x + r.width * (fx.facing < 0 ? 1 - x : x), y: r.y + r.height * y
        });
        if (fx.kind === 'daggers') {
            for (let i = 0; i < 2; i++) {
                const y = 0.28 + i * 0.43; const end = 0.7 + 0.28 * Math.sin(Math.min(1, t * 1.6 + i * 0.2) * Math.PI / 2);
                g.fillStyle(fx.color, alpha); polygon(g, [point(0.05, y - 0.07), point(end - 0.15, y - 0.07), point(end, y), point(end - 0.15, y + 0.07), point(0.05, y + 0.07)]);
            }
            return;
        }
        const outer: Point[] = []; const inner: Point[] = [];
        const span = fx.kind === 'axe' ? 2.65 : 2.4;
        const start = -1.4 + t * 0.65;
        for (let i = 0; i <= 18; i++) {
            const a = start + span * i / 18;
            outer.push(point(0.16 + Math.cos(a) * 0.8, 0.5 + Math.sin(a) * 0.48));
            inner.unshift(point(0.16 + Math.cos(a) * (fx.kind === 'axe' ? 0.52 : 0.64), 0.5 + Math.sin(a) * (fx.kind === 'axe' ? 0.29 : 0.36)));
        }
        // 极端矩形和朝向也严格限制在实际盒中。
        const bounded = [...outer, ...inner].map(p => ({ x: Math.max(r.x, Math.min(r.x + r.width, p.x)), y: Math.max(r.y, Math.min(r.y + r.height, p.y)) }));
        g.fillStyle(fx.color, alpha); polygon(g, bounded);
    }

    clear(): void { this.pending = []; this.attack = null; this.held.clear(); this.effects.clear(); }
    destroy(): void {
        if (this.disposed) { return; }
        this.disposed = true;
        this.scene.events.off('shutdown', this.onShutdown);
        this.clear(); this.held.destroy(); this.effects.destroy();
    }
}
