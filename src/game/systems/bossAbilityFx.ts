import { Scenes, TintModes, type GameObjects, type Scene } from 'phaser';
import type { AbilityRect, AbilityZone, BossAbilitySnapshot, SpiderEgg, WebPatch } from '../domain/bossAbilities';
import type { EnemyEntity } from './enemyAI';

type Graphics = GameObjects.Graphics;
const WARNING = 0xffd47a;
const DAMAGE = 0xff6946;
const HOT_EDGE = 0xffdd9a;
const ECHO = 0xc6a8ff;
const SAFE = 0x91d6ed;
const SILK = 0xd5ead3;
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

interface LabelSlot { node: GameObjects.Text; text: string; color: string }
interface TrailSample { x: number; y: number; at: number; facing: 1 | -1 }

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const progress = (zone: AbilityZone, now: number): number =>
    clamp01((now - zone.announcedAt) / Math.max(0.001, zone.startsAt - zone.announcedAt));

/** 以归一化坐标绘制细节，所有伤害纹理都留在模型的同一矩形内。 */
function line(g: Graphics, r: AbilityRect, ax: number, ay: number, bx: number, by: number): void {
    g.lineBetween(r.x + r.width * ax, r.y + r.height * ay, r.x + r.width * bx, r.y + r.height * by);
}

/**
 * 三 Boss 独立技能的呈现层。领域快照是预警与伤害几何的唯一来源。
 * 只使用一个 Graphics、六个文本与四张残影；render 不创建场景对象或定时器。
 */
export class BossAbilityFx {
    private readonly graphics: Graphics;
    private readonly labels: LabelSlot[];
    private readonly ghosts: GameObjects.Image[];
    private readonly trails: TrailSample[] = Array.from({ length: 3 }, () => ({ x: 0, y: 0, at: -Infinity, facing: 1 }));
    private pendingGhostId = '';
    private lastTrailAt = -Infinity;
    private trailIndex = 0;
    private disposed = false;
    private readonly onShutdown = (): void => this.destroy();

    constructor(private readonly scene: Scene) {
        this.graphics = scene.add.graphics().setDepth(5).setName('boss-ability-shared-geometry');
        this.labels = Array.from({ length: 6 }, (_, index) => ({
            node: scene.add.text(0, 0, '', {
                fontFamily: FONT, fontSize: index === 2 ? '18px' : '16px', fontStyle: 'bold',
                color: '#ffd47a', stroke: '#151c2a', strokeThickness: 5
            }).setOrigin(0.5, 1).setDepth(36).setVisible(false).setName(`boss-ability-label-${index}`),
            text: '', color: '#ffd47a'
        }));
        this.ghosts = Array.from({ length: 4 }, (_, index) => scene.add.image(0, 0, 'echo_idle')
            .setDepth(4).setTint(ECHO).setTintMode(TintModes.FILL).setVisible(false).setName(`boss-ability-ghost-${index}`));
        scene.events.once(Scenes.Events.SHUTDOWN, this.onShutdown);
    }

    private label(index: number, text: string, x: number, y: number, color: string): void {
        const slot = this.labels[index];
        if (slot === undefined) { return; }
        // setColor/setText 会刷新文字纹理，只在内容或语义真正变化时更新。
        if (slot.text !== text) { slot.node.setText(text); slot.text = text; }
        if (slot.color !== color) { slot.node.setColor(color); slot.color = color; }
        slot.node.setPosition(x, y).setVisible(true);
    }

    private bounds(zone: AbilityZone, now: number): { active: boolean; amount: number } {
        const r = zone.rect;
        const active = now >= zone.startsAt;
        const marker = zone.damage === 0;
        const color = marker ? SAFE : active ? DAMAGE : zone.kind === 'echo' ? ECHO : WARNING;
        const g = this.graphics;
        g.fillStyle(color, marker ? 0.035 : active ? 0.14 : 0.055).fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(active && !marker ? 3 : 2, color, active ? 0.88 : 0.66).strokeRect(r.x, r.y, r.width, r.height);
        const amount = progress(zone, now);
        if (!active) {
            const h = Math.min(4, r.height / 5);
            g.fillStyle(color, 0.9).fillRect(r.x, r.y + r.height - h, r.width * amount, h);
        }
        return { active, amount };
    }

    private hammer(r: AbilityRect, active: boolean, amount: number): void {
        const g = this.graphics;
        g.lineStyle(active ? 4 : 2, active ? DAMAGE : WARNING, active ? 0.95 : 0.55);
        // 主裂纹与不对称分叉，比整片方框更清楚地表达砸地落点。
        line(g, r, 0.08, 0.72, 0.31, 0.58); line(g, r, 0.31, 0.58, 0.48, 0.78);
        line(g, r, 0.48, 0.78, 0.65, 0.46); line(g, r, 0.65, 0.46, 0.92, 0.66);
        line(g, r, 0.31, 0.58, 0.24, 0.24); line(g, r, 0.48, 0.78, 0.48, 0.94);
        line(g, r, 0.65, 0.46, 0.74, 0.2);
        if (!active) {
            g.lineStyle(2, WARNING, 0.25 + amount * 0.4)
                .strokeEllipse(r.x + r.width / 2, r.y + r.height * 0.62, r.width * 0.76, r.height * 0.5);
            return;
        }
        g.lineStyle(1.5, HOT_EDGE, 0.95);
        line(g, r, 0.08, 0.7, 0.31, 0.56); line(g, r, 0.31, 0.56, 0.48, 0.76); line(g, r, 0.48, 0.76, 0.65, 0.44);
        for (let i = 0; i < 5; i++) {
            const x = r.x + r.width * (0.12 + i * 0.18);
            const y = r.y + r.height * (0.2 + i % 2 * 0.19);
            g.fillStyle(i % 2 === 0 ? 0x9c7659 : 0xf19a60, 0.9)
                .fillTriangle(x - 4, y + 7, x + 2, y - 3, x + 7, y + 5);
        }
    }

    private wave(zone: AbilityZone, active: boolean, now: number): void {
        const g = this.graphics;
        const r = zone.rect;
        const dir = zone.direction;
        const front = dir === 1 ? 0.83 : 0.17;
        const back = dir === 1 ? 0.18 : 0.82;
        g.lineStyle(active ? 4 : 2, active ? DAMAGE : WARNING, active ? 0.9 : 0.55);
        line(g, r, back, 0.83, 0.45, 0.7); line(g, r, 0.45, 0.7, front, 0.12);
        line(g, r, front, 0.12, dir === 1 ? 0.93 : 0.07, 0.84);
        if (active) {
            g.lineStyle(2, HOT_EDGE, 0.95);
            line(g, r, 0.46, 0.67, front, 0.1);
            const pulse = 0.22 + (Math.sin(now * 25) + 1) * 0.12;
            g.fillStyle(DAMAGE, pulse).fillEllipse(r.x + r.width / 2, r.y + r.height * 0.82, r.width * 0.86, r.height * 0.25);
        }
    }

    private charge(zone: AbilityZone, active: boolean, now: number): void {
        const g = this.graphics;
        const r = zone.rect;
        const cy = r.y + r.height / 2;
        g.lineStyle(2, active ? HOT_EDGE : WARNING, active ? 0.8 : 0.55);
        const stride = Math.min(44, Math.max(22, r.width / 3));
        const phase = active ? (now * 55) % stride : 0;
        for (let x = r.x + 14 + phase; x < r.x + r.width - 12; x += stride) {
            const tip = x + zone.direction * 7;
            const back = x - zone.direction * 7;
            g.lineBetween(back, cy - Math.min(12, r.height * 0.22), tip, cy)
                .lineBetween(tip, cy, back, cy + Math.min(12, r.height * 0.22));
        }
        if (active) {
            g.lineStyle(2, DAMAGE, 0.7);
            for (let i = 0; i < 3; i++) {
                line(g, r, 0.05 + i * 0.08, 0.22 + i * 0.28, 0.8 + i * 0.04, 0.22 + i * 0.28);
            }
        }
    }

    private drop(zone: AbilityZone, active: boolean, amount: number): void {
        const g = this.graphics;
        const r = zone.rect;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height * 0.66;
        const color = active ? DAMAGE : WARNING;
        g.lineStyle(active ? 3 : 2, color, 0.9).strokeEllipse(cx, cy, r.width * 0.88, r.height * 0.5);
        g.lineStyle(2, active ? HOT_EDGE : SILK, active ? 0.85 : 0.6)
            .strokeEllipse(cx, cy, r.width * (0.3 + amount * 0.43), r.height * (0.2 + amount * 0.2));
        g.lineStyle(2, color, 0.85);
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            g.lineBetween(cx + Math.cos(a) * r.width * 0.31, cy + Math.sin(a) * r.height * 0.16,
                cx + Math.cos(a) * r.width * 0.43, cy + Math.sin(a) * r.height * 0.25);
        }
        if (active) {
            for (let i = 0; i < 5; i++) {
                const t = 0.15 + i * 0.17;
                line(g, r, 0.5, 0.7, t, i % 2 === 0 ? 0.13 : 0.36);
            }
        }
    }

    private slash(zone: AbilityZone, active: boolean, now: number): void {
        const r = zone.rect;
        const g = this.graphics;
        const echo = zone.kind === 'echo';
        const color = active ? DAMAGE : echo ? ECHO : WARNING;
        const from = (x: number): number => r.x + r.width * (zone.direction === 1 ? x : 1 - x);
        const heavy = r.height > r.width;
        const points = heavy
            ? [[0.44, 0.04], [0.69, 0.23], [0.81, 0.65], [0.52, 0.94], [0.64, 0.65], [0.54, 0.3], [0.31, 0.09]]
            : [[0.06, 0.87], [0.24, 0.47], [0.56, 0.16], [0.94, 0.08], [0.73, 0.27], [0.43, 0.55], [0.12, 0.94]];
        g.fillStyle(color, active ? 0.55 : echo ? 0.2 : 0.09).beginPath();
        points.forEach(([x, y], index) => {
            if (index === 0) { g.moveTo(from(x), r.y + r.height * y); }
            else { g.lineTo(from(x), r.y + r.height * y); }
        });
        g.closePath().fillPath();
        g.lineStyle(active ? 3 : 2, active ? HOT_EDGE : color, active ? 0.95 : 0.7).beginPath();
        for (let i = 0; i < 4; i++) {
            const [x, y] = points[i]!;
            if (i === 0) { g.moveTo(from(x), r.y + r.height * y); }
            else { g.lineTo(from(x), r.y + r.height * y); }
        }
        g.strokePath();
        if (echo) {
            // 回响的实体剑刃仍为橙红；浅紫短划线说明它来自延迟残影。
            g.lineStyle(2, ECHO, active ? 0.65 : 0.35 + Math.sin(now * 7) * 0.1);
            for (let i = 0; i < 4; i++) {
                const x = 0.15 + i * 0.18;
                g.lineBetween(from(x), r.y + r.height * 0.85, from(x + 0.09), r.y + r.height * 0.85);
            }
        }
    }

    private shift(r: AbilityRect, amount: number): void {
        const g = this.graphics;
        const cx = r.x + r.width / 2;
        const floor = r.y + r.height - 8;
        g.lineStyle(2, SAFE, 0.7).strokeEllipse(cx, floor, r.width * 0.82, Math.min(14, r.height * 0.18));
        // 空心人形与向内标记表示目的地，完全不使用伤害橙红。
        g.lineStyle(2, ECHO, 0.35 + amount * 0.25)
            .strokeEllipse(cx, r.y + r.height * 0.25, r.width * 0.23, r.height * 0.17);
        line(g, r, 0.5, 0.34, 0.5, 0.69); line(g, r, 0.3, 0.48, 0.7, 0.48);
        line(g, r, 0.5, 0.69, 0.35, 0.84); line(g, r, 0.5, 0.69, 0.65, 0.84);
        g.lineStyle(2, SAFE, 0.8);
        line(g, r, 0.08, 0.5, 0.2, 0.58); line(g, r, 0.92, 0.5, 0.8, 0.58);
    }

    private web(rect: AbilityRect, opacity: number): void {
        const g = this.graphics;
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        g.fillStyle(0x99b7a4, opacity * 0.1).fillEllipse(cx, cy, rect.width, rect.height);
        g.lineStyle(1.5, SILK, opacity);
        for (let i = 1; i <= 3; i++) { g.strokeEllipse(cx, cy, rect.width * i / 3, rect.height * i / 3); }
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            g.lineBetween(cx, cy, cx + Math.cos(a) * rect.width / 2, cy + Math.sin(a) * rect.height / 2);
        }
        // 向侧面拉伸的纤维使12px高的真实减速网也有辨认度。
        for (let i = 0; i < 4; i++) {
            const x = rect.x + rect.width * (0.12 + i * 0.24);
            g.lineBetween(x, rect.y + 2, x + rect.width * 0.1, rect.y + rect.height - 2);
        }
    }

    private egg(egg: SpiderEgg, now: number, index: number): void {
        const g = this.graphics;
        const r = egg.rect;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const hp = clamp01(egg.hp / Math.max(1, egg.hpMax));
        const remaining = Math.max(0, egg.hatchAt - now);
        g.fillStyle(0x253141, 0.95).fillEllipse(cx, cy, r.width * 0.94, r.height * 0.94);
        g.fillStyle(0xb6c4a5, 0.9).fillEllipse(cx, cy - 2, r.width * 0.77, r.height * 0.82);
        g.fillStyle(0xdde4ba, 0.75).fillEllipse(cx - r.width * 0.13, cy - r.height * 0.14, r.width * 0.3, r.height * 0.44);
        g.lineStyle(1.5, 0x637b72, 0.85);
        line(g, r, 0.23, 0.38, 0.72, 0.56); line(g, r, 0.22, 0.6, 0.72, 0.76);
        line(g, r, 0.64, 0.14, 0.48, 0.4); line(g, r, 0.48, 0.4, 0.6, 0.58);
        if (hp < 0.6) { line(g, r, 0.6, 0.58, 0.47, 0.8); line(g, r, 0.48, 0.4, 0.28, 0.26); }
        g.fillStyle(0x152331, 0.95).fillRect(r.x, r.y + r.height - 3, r.width, 5);
        g.fillStyle(0xbadc92, 1).fillRect(r.x, r.y + r.height - 3, r.width * hp, 5);
        const tenth = (Math.ceil(remaining * 10) / 10).toFixed(1);
        this.label(index, remaining > 0 ? `可击破 · ${tenth}秒` : '可击破 · 待孵化', cx, r.y - 5, '#d9efba');
    }

    private webPatch(web: WebPatch, now: number, label: boolean): void {
        this.web(web.rect, 0.25 + clamp01((web.expiresAt - now) / 1.2) * 0.48);
        if (label) { this.label(3, '蛛网 · 减速', web.rect.x + web.rect.width / 2, web.rect.y - 8, '#d2e6d0'); }
    }

    private echoGhost(zone: AbilityZone, boss: EnemyEntity, now: number): void {
        const image = this.ghosts[0]!;
        if (this.pendingGhostId !== zone.id) {
            this.pendingGhostId = zone.id;
            image.setTexture(boss.sprite.texture.key, boss.sprite.frame.name);
        }
        const r = zone.rect;
        image.setPosition(zone.direction === 1 ? r.x + 14 : r.x + r.width - 14, r.y + r.height / 2 - 5)
            .setFlipX(zone.direction < 0).setAlpha(now < zone.startsAt ? 0.19 : 0.12).setVisible(true);
    }

    private motionTrails(snapshot: BossAbilitySnapshot, boss: EnemyEntity, swordActive: boolean): void {
        if (boss.def.id !== 'enm_boss_echo') { return; }
        if ((snapshot.motion !== null || swordActive) && snapshot.now - this.lastTrailAt >= 0.075) {
            this.lastTrailAt = snapshot.now;
            this.trailIndex = (this.trailIndex + 1) % this.trails.length;
            const sample = this.trails[this.trailIndex]!;
            sample.x = boss.sprite.x; sample.y = boss.sprite.y; sample.at = snapshot.now;
            sample.facing = boss.sprite.flipX ? -1 : 1;
            this.ghosts[this.trailIndex + 1]!.setTexture(boss.sprite.texture.key, boss.sprite.frame.name);
        }
        this.trails.forEach((sample, index) => {
            const age = snapshot.now - sample.at;
            if (age < 0 || age > 0.24) { return; }
            this.ghosts[index + 1]!.setPosition(sample.x, sample.y).setFlipX(sample.facing < 0)
                .setAlpha((1 - age / 0.24) * 0.2).setVisible(true);
        });
    }

    render(snapshot: BossAbilitySnapshot, boss: EnemyEntity | null): void {
        if (this.disposed) { return; }
        const g = this.graphics;
        g.clear();
        this.labels.forEach(slot => slot.node.setVisible(false));
        this.ghosts.forEach(image => image.setVisible(false));
        if (boss === null || boss.dead) { this.clear(); return; }
        let primary: AbilityZone | null = null;
        let drop: AbilityZone | null = null;
        let swordActive = false;
        let hasEcho = false;
        // 先铺未来预告，再画当前伤害。延迟回响与原横斩重合时，紫色预告不能盖住橙红命中刃。
        for (let pass = 0; pass < 2; pass++) {
            for (const zone of snapshot.zones) {
                if ((snapshot.now >= zone.startsAt) !== (pass === 1)
                    || zone.endsAt <= snapshot.now || zone.rect.width <= 0 || zone.rect.height <= 0) { continue; }
                const { active, amount } = this.bounds(zone, snapshot.now);
                // web/egg 是无直接伤害的铺放预警，实体从 webs/eggs 快照绘制。
                switch (zone.kind) {
                    case 'hammer': this.hammer(zone.rect, active, amount); break;
                    case 'wave': this.wave(zone, active, snapshot.now); break;
                    case 'charge': this.charge(zone, active, snapshot.now); break;
                    case 'drop': this.drop(zone, active, amount); drop = zone; break;
                    case 'slash': this.slash(zone, active, snapshot.now); swordActive ||= active; break;
                    case 'echo':
                        this.slash(zone, active, snapshot.now); this.echoGhost(zone, boss, snapshot.now); hasEcho = true;
                        break;
                    case 'shift': this.shift(zone.rect, amount); break;
                    case 'web': this.web(zone.rect, 0.25 + amount * 0.3); break;
                    case 'egg':
                        g.lineStyle(2, SILK, 0.6).strokeEllipse(zone.rect.x + zone.rect.width / 2,
                            zone.rect.y + zone.rect.height / 2, zone.rect.width * 0.72, zone.rect.height * 0.82);
                        break;
                }
                // 当前伤害优先，其余显示最近一次将要触发的招式，避免多段剑舞文字堆叠。
                const primaryActive = primary !== null && snapshot.now >= primary.startsAt;
                if (primary === null || active && !primaryActive
                    || active === primaryActive && zone.startsAt < primary.startsAt) { primary = zone; }
            }
        }
        if (!hasEcho) { this.pendingGhostId = ''; }
        snapshot.webs.forEach((web, index) => this.webPatch(web, snapshot.now, index === 0));
        snapshot.eggs.slice(0, 2).forEach((egg, index) => this.egg(egg, snapshot.now, index));
        if (drop !== null && snapshot.motion !== null && boss.def.id === 'enm_boss_spider') {
            // 吊丝是非伤害装饰，颜色与实际橙红落点范围分开。
            g.lineStyle(2, SILK, 0.62).lineBetween(boss.sprite.x, boss.sprite.y - 240, boss.sprite.x, boss.sprite.y - 34);
            g.lineStyle(1, SILK, 0.25).lineBetween(boss.sprite.x - 4, boss.sprite.y - 170, boss.sprite.x - 2, boss.sprite.y - 36);
        }
        if (primary !== null) {
            const active = snapshot.now >= primary.startsAt;
            const color = primary.damage === 0 ? '#afe0ef' : active ? '#ffb38b' : primary.kind === 'echo' ? '#d8c7ff' : '#ffd47a';
            const body = boss.getHurtbox();
            this.label(2, primary.label, boss.sprite.x, body.y - 42, color);
        }
        this.motionTrails(snapshot, boss, swordActive);
    }

    clear(): void {
        if (this.disposed) { return; }
        this.graphics.clear();
        this.labels.forEach(slot => slot.node.setVisible(false));
        this.ghosts.forEach(image => image.setVisible(false));
        this.trails.forEach(sample => { sample.at = -Infinity; });
        this.pendingGhostId = '';
        this.lastTrailAt = -Infinity;
        this.trailIndex = 0;
    }

    destroy(): void {
        if (this.disposed) { return; }
        this.clear();
        this.disposed = true;
        this.scene.events.off(Scenes.Events.SHUTDOWN, this.onShutdown);
        this.graphics.destroy();
        this.labels.forEach(slot => slot.node.destroy());
        this.ghosts.forEach(image => image.destroy());
    }
}
