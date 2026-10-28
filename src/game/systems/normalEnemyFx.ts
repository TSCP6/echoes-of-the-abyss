import type { GameObjects, Scene } from 'phaser';
import type { EnemyEntity } from './enemyAI';

const WARNING = 0xffd47a;
const ACTIVE = 0xff6946;
const RECOVERY = 0x91d6ed;

/** 共用 AI 的目标和攻击盒；一个 Graphics，每帧重绘，切场景时由 LevelScene 销毁。 */
export class NormalEnemyFx {
    private graphics: GameObjects.Graphics;

    constructor(scene: Scene) {
        this.graphics = scene.add.graphics().setDepth(7).setName('normal-enemy-attack-warnings');
    }

    render(enemies: readonly EnemyEntity[]): void {
        const g = this.graphics;
        g.clear();
        for (const enemy of enemies) {
            const state = enemy.getNormalCombatState();
            if (state === null) { continue; }
            const body = enemy.body;
            const { x, y } = body.center;
            if (state.stage === 'windup') {
                g.fillStyle(WARNING, 0.95).fillRect(x - 18, body.y - 10, 36 * state.progress, 3);
                g.lineStyle(state.locked ? 2 : 1, WARNING, state.locked ? 0.9 : 0.55);
                if (state.warning !== null) {
                    const r = state.warning;
                    g.fillStyle(WARNING, 0.08).fillRect(r.x, r.y, r.width, r.height);
                    g.strokeRect(r.x, r.y, r.width, r.height);
                } else {
                    g.lineBetween(x, y, state.target.x, state.target.y);
                    if (state.kind === 'dive') {
                        g.strokeEllipse(state.target.x, state.target.y, 38, 20);
                        g.lineBetween(state.target.x - 6, state.target.y, state.target.x + 6, state.target.y);
                        g.lineBetween(state.target.x, state.target.y - 6, state.target.x, state.target.y + 6);
                    } else {
                        g.strokeCircle(x + state.facing * (body.width / 2 + 10), y, 7);
                    }
                }
            } else if (state.stage === 'active' && state.attack !== null) {
                const r = state.attack.rect;
                g.fillStyle(ACTIVE, 0.16).fillRect(r.x, r.y, r.width, r.height);
                g.lineStyle(2, ACTIVE, 0.9).strokeRect(r.x, r.y, r.width, r.height);
                if (state.kind === 'melee') {
                    for (let i = 1; i <= 3; i++) {
                        const sx = r.x + r.width * i / 4;
                        g.lineBetween(sx - 4, r.y + r.height * 0.2, sx + 4, r.y + r.height * 0.8);
                    }
                }
            } else if (state.stage === 'recovery') {
                g.lineStyle(2, RECOVERY, 0.85).strokeEllipse(x, body.bottom, body.width + 16, 9);
                for (let i = -1; i <= 1; i++) { g.fillStyle(RECOVERY, 0.9).fillCircle(x + i * 10, body.y - 8 - (i === 0 ? 3 : 0), 2); }
            }
        }
    }

    destroy(): void { this.graphics.destroy(); }
}
