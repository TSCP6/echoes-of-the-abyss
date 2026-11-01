/**
 * MOD-01 PlayerController（Phaser 呈现层，管线阶段 2）—— FR-01 全部容错机制 + FR-05 攻击硬直。
 * 状态机（4.3.1 实现级）：idle/run/jump/fall/attack（M2）+ hurt/dash/dead（扩展点）。
 * 运动参数全部读自 ConfigRegistry（MotionModel，ARCH-8）：
 * 行走 210、加速 0.12s、减速 0.10s、空中 0.85、跳 480、截断 -180、土狼 100ms、缓冲 120ms。
 * 碰撞体 22×44 AABB（FR-01 规则 8）。攻击硬直 0.12 s（FR-05 规则 1，短剑基线）。
 * 发布 player:died（IF-E04）。
 */
import { Physics, type Scene } from 'phaser';
import type { InputGateway } from './inputGateway';
import type { PlayerAnimState, WeaponDef } from '../../domain/shared/types';
import { ConfigRegistry } from '../../domain/shared/configRegistry';
import { economyService } from '../../domain/economy/economyService';
import { emitEvent } from '../../events';

export interface MotionState {
    x: number; y: number; vx: number; vy: number;
    grounded: boolean; facing: 1 | -1; state: PlayerAnimState;
}

const ATTACK_LOCK_MS = 120; // FR-05 规则 1：短剑硬直 0.12 s（武器级配置 P3 细化）

export class PlayerController {
    readonly sprite: Physics.Arcade.Sprite;
    private state: PlayerAnimState = 'idle';
    private facing: 1 | -1 = 1;
    private coyoteMs = 0;
    private bufferMs = 0;
    private grounded = false;
    private wasGrounded = false;
    private inputEnabled = true;
    private attackLockMs = 0;
    private attackType: WeaponDef['type'] = 'melee';
    private dashLeftMs = 0;
    private dashVelocity = 0;
    private onewaySupport: { top: number; bottom: number } | null = null;
    private ignoredPlatform: { top: number; bottom: number; until: number } | null = null;

    noteOnewaySupport(top: number, height: number): void { this.onewaySupport = { top, bottom: top + height }; }
    canCollideOneway(top: number): boolean {
        const ignored = this.ignoredPlatform;
        if (ignored === null) { return true; }
        if (this.scene.time.now >= ignored.until || this.body.top > ignored.bottom) {
            this.ignoredPlatform = null; return true;
        }
        return top !== ignored.top;
    }
    startDash(distance: number, durationMs: number): void {
        this.dashLeftMs = durationMs;
        this.dashVelocity = this.facing * distance / (durationMs / 1000);
        this.body.setVelocityX(this.dashVelocity);
    }
    /** P2 接入：i-frame 截止时间戳（游戏时钟 ms） */
    iFrameUntil = 0;
    onLanded: (() => void) | null = null; // CameraRig 沉降 / 落地音效（场景内直调，6.2.3）
    onJumped: (() => void) | null = null; // TutorialDirector / 跳跃音效（场景内直调，6.2.3）
    constructor(private scene: Scene, private input: InputGateway) {
        const d = ConfigRegistry.playerDefaults();
        this.sprite = scene.physics.add.sprite(0, 0, 'player_idle');
        const body = this.body;
        // 碰撞体 22×44，居中于 64×64 帧
        body.setSize(d.collider.w, d.collider.h);
        body.setOffset((64 - d.collider.w) / 2, 64 - d.collider.h);
        this.sprite.setCollideWorldBounds(false);
        body.setBounce(0, 0);
        this.sprite.setDepth(10);
    }

    get body(): Physics.Arcade.Body { return this.sprite.body as Physics.Arcade.Body; }

    setInputEnabled(b: boolean): void { this.inputEnabled = b; }
    private moveSpeedFactor = 1;
    setMoveSpeedFactor(factor: number): void { this.moveSpeedFactor = Math.max(0.5, Math.min(1, factor)); }
    getState(): PlayerAnimState { return this.state; }
    getFacing(): 1 | -1 { return this.facing; }
    isGrounded(): boolean { return this.grounded; }

    getMotionState(): MotionState {
        return {
            x: this.sprite.x, y: this.sprite.y,
            vx: this.body.velocity.x, vy: this.body.velocity.y,
            grounded: this.grounded, facing: this.facing, state: this.state
        };
    }

    teleportTo(x: number, y: number): void {
        this.sprite.setPosition(x, y);
        this.body.setVelocity(0, 0);
        this.coyoteMs = 0;
        this.bufferMs = 0;
        this.attackLockMs = 0;
        this.dashLeftMs = 0;
        this.onewaySupport = null;
        this.ignoredPlatform = null;
        this.setState('idle');
    }

    canAttack(): boolean { return this.state !== 'dead' && this.attackLockMs <= 0; }

    /** FR-05 规则 1：进入攻击态（0.12 s 硬直）；dead/硬直中拒绝。返回是否成功发起 */
    beginAttack(type: WeaponDef['type'] = 'melee'): boolean {
        if (!this.canAttack()) { return false; }
        this.attackType = type;
        this.attackLockMs = ATTACK_LOCK_MS;
        this.setState('attack');
        return true;
    }

    /** FR-04/FR-11：死亡（HP≤0 或即死区）。lostCoins 由 EconomyService 结算（附录 A）。 */
    die(checkpointId: string, levelId: string): void {
        if (this.state === 'dead') { return; }
        this.setState('dead');
        this.dashLeftMs = 0;
        this.body.setVelocity(0, 0);
        const { lostCoins } = economyService.applyDeathPenalty();
        emitEvent('player:died', { levelId, checkpointId, lostCoins });
    }

    private setState(next: PlayerAnimState): void {
        if (this.state === next) { return; }
        this.state = next;
        const animMap: Partial<Record<PlayerAnimState, string>> = {
            idle: 'player-idle', run: 'player-run', jump: 'player-jump',
            fall: 'player-fall', hurt: 'player-hit', dead: 'player-dead',
            attack: this.attackType === 'ranged' ? 'player-shoot' : 'player-swing'
        };
        const key = animMap[next];
        if (key !== undefined) { this.sprite.play(key, true); }
    }

    /** 管线阶段 2：状态机迁移与运动（每帧一次，dt 单位 ms） */
    update(dtMs: number): void {
        // 场景切换同帧残留 update（sprite 已销毁/场景非活动）：直接返回（EXD-4 防未捕获）
        if (!this.scene.sys.isActive() || this.sprite.body === undefined || this.sprite.body === null) { return; }
        const d = ConfigRegistry.playerDefaults();
        const dt = dtMs / 1000;
        const body = this.body;

        // 落地检测（blocked.down = 与瓦片分离结果）
        this.grounded = body.blocked.down || body.touching.down;
        if (this.grounded && !this.wasGrounded && this.onLanded !== null) { this.onLanded(); }
        this.wasGrounded = this.grounded;

        if (this.state === 'dead') { return; }
        if (this.dashLeftMs > 0) {
            this.dashLeftMs = Math.max(0, this.dashLeftMs - dtMs);
            this.body.setVelocityX(this.dashLeftMs > 0 ? this.dashVelocity : 0);
            return;
        }

        // 攻击硬直：期间不响应移动/跳跃（FR-05 规则 1）
        if (this.attackLockMs > 0) {
            this.attackLockMs -= dtMs;
            if (this.attackLockMs <= 0) {
                this.attackLockMs = 0;
                this.setState(this.grounded ? (body.velocity.x !== 0 ? 'run' : 'idle') : 'fall');
            }
            return;
        }

        // 土狼 / 缓冲计时（帧内递减，暂停自动停止，EX-05）
        if (this.grounded) { this.coyoteMs = d.coyoteMs; } else { this.coyoteMs = Math.max(0, this.coyoteMs - dtMs); }
        this.bufferMs = Math.max(0, this.bufferMs - dtMs);

        // 水平输入（左右同按 = 静止，FR-01 边界）
        let dir = 0;
        if (this.inputEnabled) {
            const left = this.input.isDown('moveLeft');
            const right = this.input.isDown('moveRight');
            if (left && !right) { dir = -1; } else if (right && !left) { dir = 1; }
        }
        if (dir !== 0) { this.facing = dir as 1 | -1; this.sprite.setFlipX(dir < 0); }

        // 加减速模型：线性逼近目标速度（加速 0.12s / 减速 0.10s / 空中 0.85）
        const target = dir * d.walkSpeed * this.moveSpeedFactor;
        const rate = this.grounded
            ? (dir !== 0 ? d.walkSpeed / d.accelTimeSec : d.walkSpeed / d.decelTimeSec)
            : (d.walkSpeed / d.accelTimeSec) * d.airControlFactor;
        const dv = target - body.velocity.x;
        const step = rate * dt;
        body.setVelocityX(Math.abs(dv) <= step ? target : body.velocity.x + Math.sign(dv) * step);

        // 跳跃缓冲：按下即记录 120ms
        if (this.inputEnabled && this.input.justPressed('jump')) {
            const support = this.onewaySupport;
            if (this.input.isDown('moveDown') && this.grounded && support !== null && Math.abs(body.bottom - support.top) <= 4) {
                this.ignoredPlatform = { ...support, until: this.scene.time.now + 450 };
                this.onewaySupport = null;
                this.bufferMs = 0; this.coyoteMs = 0; this.grounded = false;
                body.setVelocityY(80);
                this.setState('fall');
                return;
            }
            this.bufferMs = d.jumpBufferMs;
        }

        // 起跳：地面或土狼窗口内 + 缓冲命中
        const canJump = this.grounded || this.coyoteMs > 0;
        if (this.bufferMs > 0 && canJump) {
            body.setVelocityY(-d.jumpVelocity);
            this.onJumped?.();
            this.bufferMs = 0;
            this.coyoteMs = 0;
            this.setState('jump');
        } else if (this.grounded) {
            this.setState(dir !== 0 ? 'run' : 'idle');
        } else {
            // 可变跳高截断（FR-01 规则 6）：松手且上升快于 -180 → 截断
            if (this.inputEnabled && this.input.justReleased('jump') && body.velocity.y < d.jumpCutVelocity) {
                body.setVelocityY(d.jumpCutVelocity);
            }
            this.setState(body.velocity.y < 0 ? 'jump' : 'fall');
        }
    }
}
