import { ELITE_TAIL } from '../data/eliteTail';

export type EliteTailStage = 'idle' | 'windup' | 'outbound' | 'inbound' | 'recovery' | 'cooldown';
export interface EliteTailPoint { x: number; y: number }
export interface EliteTailSnapshot {
    stage: EliteTailStage;
    direction: 1 | -1;
    progress: number;
    origin: EliteTailPoint;
    blade: EliteTailPoint | null;
    rect: (EliteTailPoint & { width: number; height: number }) | null;
    canHit: boolean;
}

/** 秒制纯领域状态机。碰墙由调用方扫描本帧前方路径后提供。 */
export class EliteTail {
    private stage: EliteTailStage = 'idle';
    private direction: 1 | -1 = 1;
    private origin: EliteTailPoint = { x: 0, y: 0 };
    private elapsed = 0;
    private flightElapsed = 0;
    private distance = 0;
    private returnDistance = 0;
    private hit = false;

    get snapshot(): EliteTailSnapshot {
        const flying = this.stage === 'outbound' || this.stage === 'inbound';
        const blade = flying ? { x: this.origin.x + this.direction * this.distance, y: this.origin.y } : null;
        let progress = 0;
        if (this.stage === 'outbound') { progress = this.distance / ELITE_TAIL.range; }
        else if (this.stage === 'inbound') {
            progress = this.returnDistance > 0 ? 1 - this.distance / this.returnDistance : 1;
        } else if (this.stage !== 'idle') { progress = this.elapsed / this.duration(); }
        return {
            stage: this.stage, direction: this.direction, progress: Math.max(0, Math.min(1, progress)),
            origin: { ...this.origin }, blade,
            rect: blade ? { x: blade.x - ELITE_TAIL.width / 2, y: blade.y - ELITE_TAIL.height / 2,
                width: ELITE_TAIL.width, height: ELITE_TAIL.height } : null,
            canHit: flying && !this.hit
        };
    }

    start(x: number, y: number, direction: 1 | -1): boolean {
        if (this.stage !== 'idle' || !Number.isFinite(x) || !Number.isFinite(y)) { return false; }
        this.origin = { x, y };
        this.direction = direction;
        this.distance = 0;
        this.flightElapsed = 0;
        this.hit = false;
        this.enter('windup');
        return true;
    }

    tick(dt: number, blocked: boolean): void {
        if (!Number.isFinite(dt) || dt <= 0) { return; }
        let remaining = dt;
        const epsilon = 1e-9;
        while (remaining > epsilon && this.stage !== 'idle') {
            if (this.stage === 'outbound' || this.stage === 'inbound') {
                if (blocked) {
                    if (this.stage === 'outbound' && this.distance > epsilon) {
                        this.returnDistance = this.distance;
                        this.enter('inbound');
                        this.flightElapsed += remaining;
                        if (this.flightElapsed >= ELITE_TAIL.maxFlightSec) { this.enter('recovery'); }
                    } else { this.enter('recovery'); }
                    return;
                }
                const outbound = this.stage === 'outbound';
                const travel = outbound ? ELITE_TAIL.range - this.distance : this.distance;
                const untilEnd = Math.min(travel / ELITE_TAIL.speed, ELITE_TAIL.maxFlightSec - this.flightElapsed);
                const used = Math.min(remaining, Math.max(0, untilEnd));
                this.distance += (outbound ? 1 : -1) * ELITE_TAIL.speed * used;
                this.flightElapsed += used;
                remaining -= used;
                if (used + epsilon < untilEnd) { break; }
                if (outbound && this.flightElapsed + epsilon < ELITE_TAIL.maxFlightSec) {
                    this.distance = ELITE_TAIL.range;
                    this.returnDistance = this.distance;
                    this.enter('inbound');
                } else { this.enter('recovery'); }
            } else {
                const untilEnd = this.duration() - this.elapsed;
                const used = Math.min(remaining, untilEnd);
                this.elapsed += used;
                remaining -= used;
                if (used + epsilon < untilEnd) { break; }
                this.enter(this.stage === 'windup' ? 'outbound' : this.stage === 'recovery' ? 'cooldown' : 'idle');
            }
        }
    }

    consumeHit(): void {
        if (this.stage === 'outbound' || this.stage === 'inbound') { this.hit = true; }
    }

    /** 中断重启完整后摇；已有冷却不因重复受击被缩短。 */
    cancel(): void {
        if (this.stage !== 'idle' && this.stage !== 'cooldown') { this.enter('recovery'); }
    }

    private enter(stage: EliteTailStage): void {
        this.stage = stage;
        this.elapsed = 0;
    }

    private duration(): number {
        if (this.stage === 'windup') { return ELITE_TAIL.windupSec; }
        if (this.stage === 'recovery') { return ELITE_TAIL.recoverySec; }
        return ELITE_TAIL.cooldownSec;
    }
}
