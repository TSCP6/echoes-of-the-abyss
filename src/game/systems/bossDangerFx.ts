import type { GameObjects, Scene } from 'phaser';
import type { ArenaHazard, EnemyEntity } from './enemyAI';
import { bossPalette, bossProjectileAngles, bossSummonPositions } from './bossSkillPresentation';
import { getBossCombatProfile } from '../data/bossCombatProfiles';
import { bindViewportLayout } from './viewportLayout';

/** Warnings and damage share rectangles; one reusable graphics object per level. */
export class BossDangerFx {
    private graphics: GameObjects.Graphics;
    private label: GameObjects.Text;
    private resistance: GameObjects.Text;
    private echoes: GameObjects.Image[];
    private bursts: { x: number; y: number; sourceId: string; until: number }[] = [];

    constructor(private scene: Scene) {
        this.graphics = scene.add.graphics().setDepth(5);
        this.label = scene.add.text(0, 0, '', {
            fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold',
            color: '#ffd470', stroke: '#171727', strokeThickness: 5
        }).setOrigin(0.5, 1).setDepth(35).setVisible(false);
        this.resistance = scene.add.text(0, 0, '', {
            fontFamily: 'sans-serif', fontSize: '14px', color: '#c4d4e8', stroke: '#171727', strokeThickness: 4
        }).setOrigin(0.5, 0).setDepth(35).setVisible(false).setName('boss-resistance-hint');
        bindViewportLayout(scene, width => this.resistance.setWordWrapWidth(Math.max(280, width - 330)));
        this.echoes = Array.from({ length: 3 }, () => scene.add.image(0, 0, 'echo_idle').setDepth(4).setVisible(false));
    }

    summonBurst(positions: { x: number; y: number }[], sourceId: string): void {
        for (const pos of positions) { this.bursts.push({ ...pos, sourceId, until: this.scene.time.now + 650 }); }
    }

    private summonRing(x: number, y: number, sourceId: string, progress: number, active: boolean): void {
        const g = this.graphics;
        const p = bossPalette(sourceId);
        const radius = active ? 22 + progress * 22 : 22 + progress * 10;
        g.fillStyle(p.danger, active ? 0.22 * (1 - progress) : 0.1);
        g.fillEllipse(x, y + 24, radius * 2, 22);
        g.lineStyle(2, p.glow, active ? 1 - progress : 0.8);
        g.strokeEllipse(x, y + 24, radius * 2, 22);
        g.strokeEllipse(x, y + 24, radius * 1.3, 14);
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3 + progress;
            const px = x + Math.cos(angle) * radius;
            const py = y + 24 + Math.sin(angle) * 11;
            g.lineBetween(px, py, x, y - 12 - progress * 30);
        }
    }

    render(hazards: ArenaHazard[], nowSec: number, boss: EnemyEntity | null): void {
        const g = this.graphics;
        g.clear();
        this.label.setVisible(false);
        for (const image of this.echoes) { image.setVisible(false); }
        this.bursts = this.bursts.filter(b => b.until > this.scene.time.now);
        for (const b of this.bursts) {
            this.summonRing(b.x, b.y, b.sourceId, 1 - (b.until - this.scene.time.now) / 650, true);
        }
        for (const hazard of hazards) {
            if (hazard.untilSec <= nowSec) { continue; }
            const r = hazard.rect;
            const warning = nowSec < hazard.startsAtSec;
            const palette = bossPalette(hazard.sourceId);
            const spider = hazard.sourceId === 'enm_boss_spider';
            const color = warning ? palette.glow : palette.danger;
            g.fillStyle(color, warning ? 0.16 : 0.45);
            g.fillRect(r.x, r.y, r.width, r.height);
            g.lineStyle(3, color, 1);
            g.strokeRect(r.x, r.y, r.width, r.height);
            if (warning) {
                const progress = 1 - Math.min(1, (hazard.startsAtSec - nowSec) / 0.85);
                g.fillStyle(color, 1);
                g.fillRect(r.x, r.bottom - 5, r.width * progress, 5);
                for (let x = r.x + 8; x < r.right - 4; x += 16) {
                    g.lineBetween(x, r.bottom - 10, x + 8, r.y + 10);
                }
            }
            if (spider) {
                // The web stays inside the exact rectangle used for damage.
                const cx = r.centerX;
                const cy = r.centerY;
                g.lineStyle(warning ? 1 : 2, palette.light, warning ? 0.45 : 0.95);
                g.strokeEllipse(cx, cy, r.width - 8, r.height - 8);
                g.strokeEllipse(cx, cy, (r.width - 8) * 0.55, (r.height - 8) * 0.55);
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    g.lineBetween(cx, cy, cx + Math.cos(a) * (r.width / 2 - 4), cy + Math.sin(a) * (r.height / 2 - 4));
                }
            } else if (!warning) {
                g.fillStyle(0xffd470, 1);
                for (let x = r.x + 4; x < r.right - 8; x += 16) {
                    g.fillTriangle(x, r.bottom, x + 6, r.y + 5, x + 12, r.bottom);
                }
            }
        }

        const attack = boss?.getBossAttack();
        this.resistance.setVisible(false);
        if (boss === null) { return; }
        const body = boss.getHurtbox();
        const x = boss.sprite.x;
        const y = body.y + body.h / 2;
        const palette = bossPalette(boss.def.id);
        const echo = boss.def.id === 'enm_boss_echo';
        const spider = boss.def.id === 'enm_boss_spider';
        const hint = getBossCombatProfile(boss.def.id)?.resistanceHint ?? '';
        const resistanceText = boss.armorBroken ? '岩甲破裂 · 暂时取消抗性' : hint;
        if (this.resistance.text !== resistanceText) { this.resistance.setText(resistanceText); }
        const cam = this.scene.cameras.main;
        this.resistance.setScale(1 / cam.zoom).setPosition(cam.scrollX + cam.width / 2,
            cam.scrollY + cam.height / 2 + (86 - cam.height / 2) / cam.zoom).setVisible(boss.bossEngaged);
        if (!boss.bossEngaged) {
            g.lineStyle(3, 0x91cfe5, 0.85).strokeEllipse(x, y, body.w + 40, body.h + 32);
            this.label.setPosition(x, body.y - 18).setVisible(true).setColor('#afe0ef').setText('结界守护 · 进入战场开战');
            return;
        }
        if (boss.guardianGuarding) {
            const side = boss.blocksProjectile(x + 1) ? 1 : -1;
            const sx = x + side * (body.w / 2 + 12);
            g.lineStyle(5, 0x91cfe5, 0.95).lineBetween(sx, body.y - 8, sx, body.y + body.h + 8);
            g.lineStyle(2, 0xe2f4ff, 0.7).strokeEllipse(sx, y, 22, body.h + 22);
            this.label.setPosition(x, body.y - 18).setVisible(true).setColor('#afe0ef').setText('举盾推进 · 绕侧或等待出招');
            return;
        }
        if (echo) {
            // A light backdrop keeps the source's dark robe readable against the cave/sky.
            g.fillStyle(palette.glow, 0.16);
            g.fillEllipse(x, y, body.w * 1.8, body.h * 1.5);
            g.lineStyle(2, palette.glow, 0.5);
            g.strokeEllipse(x, body.y + body.h, body.w * 1.4, 18);
        }
        if (boss.isInvincible(this.scene.time.now)) {
            this.label.setPosition(x, body.y - 16).setVisible(true)
                .setText(`阶段 ${boss.phaseIndex + 1} · 护盾`).setColor(palette.text);
            g.lineStyle(3, palette.glow, 0.85);
            g.strokeEllipse(x, y, body.w + 32, body.h + 28);
            const t = nowSec * 2;
            for (let i = 0; i < 6; i++) {
                const a = t + i * Math.PI / 3;
                g.fillStyle(palette.light, 0.9);
                g.fillCircle(x + Math.cos(a) * (body.w / 2 + 16), y + Math.sin(a) * (body.h / 2 + 14), 3);
            }
            return;
        }
        if (attack === null || attack === undefined) { return; }
        const dir = attack.direction;
        this.label.setPosition(x, body.y - 16).setVisible(true);
        if (attack.stage === 'recovery') {
            this.label.setText(attack.skill.kind === 'echoReplay' ? '收招 · 留意延迟剑痕' : '收招 · 可以反击').setColor('#9de5b0');
            return;
        }
        // 新技能的可见范围由 BossAbilityFx 直接读取实际判定几何；这里仅保留护盾和收招。
        if (attack.skill.params.activeSec !== undefined) {
            this.label.setVisible(false);
            return;
        }
        if (attack.stage === 'active') {
            const names: Record<string, string> = {
                charge: echo ? '残影突袭！' : '冲撞！',
                projectileSpread: spider ? '毒液弹幕！' : echo ? '灵魂弹幕！' : '出招！',
                summon: spider ? '蛛群孵化！' : '回响显形！', arenaHazard: spider ? '毒网展开！' : '地刺升起！'
            };
            this.label.setText(names[attack.skill.kind] ?? '出招！').setColor(palette.text);
            if (echo && attack.skill.kind === 'charge') {
                this.echoes.forEach((image, i) => image.setTexture(boss.sprite.texture.key, boss.sprite.frame.name)
                    .setPosition(x - dir * (i + 1) * 34, boss.sprite.y).setFlipX(boss.sprite.flipX)
                    .setTint(0xb798ff).setAlpha(0.3 - i * 0.08).setVisible(true));
            }
            return;
        }
        const names: Record<string, string> = {
            charge: '冲撞蓄力 · 跳跃躲避', projectileSpread: '扇形弹幕 · 准备躲避',
            arenaHazard: spider ? '毒网施法 · 离开亮框' : '地刺施法 · 留意脚下',
            summon: spider ? '蛛群孵化 · 留意光环' : '回响召唤 · 留意光环'
        };
        if (echo) { names.charge = '残影蓄力 · 跳跃躲避'; names.projectileSpread = '灵魂弹幕 · 准备躲避'; }
        if (spider) { names.projectileSpread = '毒液弹幕 · 准备躲避'; }
        this.label.setText(names[attack.skill.kind] ?? '蓄力').setColor(palette.text);
        const progress = 1 - Math.max(0, attack.remaining / attack.windupSec);
        g.fillStyle(0x171727, 0.85);
        g.fillRect(x - 55, body.y - 10, 110, 6);
        g.fillStyle(palette.glow, 1);
        g.fillRect(x - 55, body.y - 10, 110 * progress, 6);
        const start = x + dir * (body.w / 2 + 8);
        if (attack.skill.kind === 'charge') {
            const reach = attack.skill.params.distance ?? 240;
            const left = dir === 1 ? start : start - reach;
            g.fillStyle(palette.glow, 0.18);
            g.fillRect(left, body.y, reach, body.h);
            g.lineStyle(3, palette.glow, 0.9);
            g.strokeRect(left, body.y, reach, body.h);
            g.fillStyle(palette.glow, 0.9);
            for (let step = 28; step < reach; step += 48) {
                const ax = start + dir * step;
                g.fillTriangle(ax - dir * 7, y - 9, ax + dir * 7, y, ax - dir * 7, y + 9);
            }
        } else if (attack.skill.kind === 'projectileSpread') {
            const count = Math.floor(attack.skill.params.count ?? 3);
            const spread = attack.skill.params.spreadDeg ?? 30;
            g.lineStyle(3, palette.glow, 0.7);
            for (const deg of bossProjectileAngles(dir, count, spread)) {
                const a = deg * Math.PI / 180;
                g.lineBetween(start, y, start + Math.cos(a) * 300, y + Math.sin(a) * 300);
            }
        } else if (attack.skill.kind === 'summon') {
            const positions = bossSummonPositions(x, boss.sprite.y, attack.skill.params.count ?? 2);
            for (const pos of positions) { this.summonRing(pos.x, pos.y, boss.def.id, progress, false); }
        }
    }

    clear(): void {
        this.bursts = [];
        this.graphics.clear();
        this.label.setVisible(false);
        this.resistance.setVisible(false);
        for (const image of this.echoes) { image.setVisible(false); }
    }

    destroy(): void {
        this.graphics.destroy();
        this.label.destroy();
        this.resistance.destroy();
        for (const image of this.echoes) { image.destroy(); }
        this.bursts = [];
    }
}
