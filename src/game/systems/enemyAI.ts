/**
 * MOD-03 EnemyAI（Phaser 呈现层，管线阶段 6）—— FR-03 行为状态机。
 * 组合式 brain：EnemyEntity 持有 PatrolBrain/ChaserBrain（M2）；Flyer/Boss 于 P3。
 * 巡逻型：生成点 ±128 px 往返、边缘/墙体转向（向下射线，AT-08）；玩家 160 px 水平 + 落差 ≤48 → 追击。
 * 追击型：130 px/s、视线丢失 2.5 s 返回巡逻（AT-09）；v1 不跳跃。
 * 受击 0.15 s 硬直 + 水平 60 px 击退；死亡 0.4 s 消失 + 掉落委托（FR-03 输出）。
 * 同屏预算：>24 时最远敌人 sleep（冻结 AI 保留渲染，FR-03 边界）。
 * 视觉：M2 用程序化占位纹理（Graphics.generateTexture，零许可风险）；P4 换 CC0 图集帧。
 */
import { Physics, type Scene } from 'phaser';
import type { EnemyDef } from '../domain/types';
import { ConfigRegistry } from '../domain/configRegistry';
import type { LevelContext } from './levelLoader';
import type { PlayerController } from './playerController';

const PATROL_SPAN = 128;
const CHASE_LOST_SEC = 2.5;
const HIT_STAGGER_SEC = 0.15;
const KNOCKBACK_PX = 60;
const DEATH_ANIM_SEC = 0.4;
const SCREEN_BUDGET = 24;
const EDGE_PROBE_PX = 8;

export type BrainKind = 'patrol' | 'chaser';

export class EnemyEntity {
    readonly sprite: Physics.Arcade.Sprite;
    hp: number;
    readonly def: EnemyDef;
    readonly spawnPos: { x: number; y: number };
    brain: BrainKind;
    sleeping = false;
    dead = false;
    private stagger = 0;
    private dir: 1 | -1 = 1;
    private chaseLost = 0;
    private deathTimer = 0;

    constructor(scene: Scene, def: EnemyDef, x: number, y: number,
        private groundProbe: (x: number, y: number) => boolean) {
        this.def = def;
        this.hp = def.hp;
        this.spawnPos = { x, y };
        this.brain = def.kind === 'chaser' ? 'chaser' : 'patrol';
        this.sprite = scene.physics.add.sprite(x, y, `enemy_${def.kind}`);
        const body = this.sprite.body as Physics.Arcade.Body;
        body.setSize(def.hurtboxSize.w, def.hurtboxSize.h);
        body.setOffset((48 - def.hurtboxSize.w) / 2, 48 - def.hurtboxSize.h);
        body.setCollideWorldBounds(false);
        this.sprite.setDepth(6);
    }

    get body(): Physics.Arcade.Body { return this.sprite.body as Physics.Arcade.Body; }

    getHurtbox(): { x: number; y: number; w: number; h: number } {
        const b = this.body;
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    }

    /** FR-03：受击硬直 + 击退（水平 60 px，方向 = 攻击来源反方向） */
    applyHit(amount: number, fromX: number): boolean {
        if (this.dead) { return false; }
        this.hp -= amount;
        this.stagger = HIT_STAGGER_SEC;
        const dir = this.sprite.x >= fromX ? 1 : -1;
        this.body.setVelocityX(dir * KNOCKBACK_PX * 4); // 短冲量近似 60px 位移
        if (this.hp <= 0) {
            this.dead = true;
            this.deathTimer = DEATH_ANIM_SEC;
            this.body.setEnable(false);
            this.sprite.setAlpha(0.6);
        }
        return this.dead;
    }

    /** 管线阶段 6（dt 秒）；返回本帧是否刚完成死亡动画（调用方回收 + 掉落） */
    update(dt: number, player: PlayerController): boolean {
        if (this.dead) {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) { this.sprite.setVisible(false); return true; }
            return false;
        }
        if (this.sleeping) { return false; }
        if (this.stagger > 0) { this.stagger -= dt; return false; }

        const px = player.sprite.x;
        const py = player.sprite.y;
        const dx = px - this.sprite.x;
        const dy = py - this.sprite.y;
        const inDetect = Math.abs(dx) <= this.def.detectRange && Math.abs(dy) <= 48;

        const body = this.body;
        if (this.brain === 'chaser' || inDetect) {
            if (this.brain === 'patrol' && inDetect) { this.brain = 'chaser'; }
            if (inDetect) {
                this.chaseLost = 0;
                this.dir = dx >= 0 ? 1 : -1;
                body.setVelocityX(this.dir * this.def.moveSpeed);
            } else {
                this.chaseLost += dt;
                if (this.chaseLost >= CHASE_LOST_SEC) {
                    this.brain = this.def.kind === 'chaser' ? 'chaser' : 'patrol';
                    this.chaseLost = 0;
                    if (this.brain === 'patrol') { body.setVelocityX(this.dir * this.def.moveSpeed * 0.5); }
                } else {
                    body.setVelocityX(this.dir * this.def.moveSpeed);
                }
            }
        } else {
            // 巡逻：±128 往返 + 边缘/墙体转向（AT-08）
            const offset = this.sprite.x - this.spawnPos.x;
            if (offset > PATROL_SPAN) { this.dir = -1; }
            if (offset < -PATROL_SPAN) { this.dir = 1; }
            if (body.blocked.left) { this.dir = 1; }
            if (body.blocked.right) { this.dir = -1; }
            if (!this.hasGroundAhead()) { this.dir = this.dir === 1 ? -1 : 1; }
            body.setVelocityX(this.dir * this.def.moveSpeed);
        }
        this.sprite.setFlipX(this.dir < 0);
        return false;
    }

    /** 向下射线探测前方地面（边缘转向，AT-08） */
    private hasGroundAhead(): boolean {
        const probeX = this.sprite.x + this.dir * (this.def.hurtboxSize.w / 2 + EDGE_PROBE_PX);
        const probeY = this.sprite.y + this.def.hurtboxSize.h / 2 + EDGE_PROBE_PX;
        return this.groundProbe(probeX, probeY);
    }



    reset(): void {
        this.hp = this.def.hp;
        this.dead = false;
        this.sleeping = false;
        this.stagger = 0;
        this.brain = this.def.kind === 'chaser' ? 'chaser' : 'patrol';
        this.sprite.setPosition(this.spawnPos.x, this.spawnPos.y);
        this.sprite.setVisible(true);
        this.sprite.setAlpha(1);
        this.body.setEnable(true);
        this.body.setVelocity(0, 0);
    }
}

export class EnemyAI {
    private enemies: EnemyEntity[] = [];

    constructor(scene: Scene, ctx: LevelContext, private player: PlayerController,
        private groundProbe: (x: number, y: number) => boolean) {
        for (const spawn of ctx.enemySpawns) {
            const def = ConfigRegistry.enemies()[spawn.defId];
            if (def === undefined || def.kind === 'boss' || def.kind === 'flyer') { continue; } // flyer/boss P3
            this.enemies.push(new EnemyEntity(scene, def, spawn.x, spawn.y, this.groundProbe));
        }
    }

    getEntities(): EnemyEntity[] { return this.enemies; }

    /** FR-03 边界：同屏 >24 最远者冻结（sleep 计时挂起不清零） */
    private budgetPass(): void {
        const active = this.enemies.filter((e) => !e.dead);
        if (active.length <= SCREEN_BUDGET) {
            for (const e of active) { e.sleeping = false; }
            return;
        }
        const px = this.player.sprite.x;
        const sorted = [...active].sort((a, b) =>
            Math.abs(a.sprite.x - px) - Math.abs(b.sprite.x - px));
        sorted.forEach((e, i) => { e.sleeping = i >= SCREEN_BUDGET; });
    }

    /** 管线阶段 6；返回本帧死亡完成的实体（调用方发 enemy:killed + 掉落） */
    update(dt: number): EnemyEntity[] {
        this.budgetPass();
        const finished: EnemyEntity[] = [];
        for (const e of this.enemies) {
            if (e.update(dt, this.player)) { finished.push(e); }
        }
        return finished;
    }

    /** FR-11 规则 7：玩家死亡后敌人重置（满 HP + 初始位置） */
    resetAll(): void {
        for (const e of this.enemies) { e.reset(); }
    }

    destroy(): void {
        for (const e of this.enemies) { e.sprite.destroy(); }
        this.enemies = [];
    }
}
