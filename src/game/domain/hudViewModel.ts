/**
 * MOD-24 HudViewModel（领域层，IF-M13）—— FR-14 数据聚合与节流。
 * tick(dt) 仅管线阶段 10 调用；累计 ≥100 ms 经 EventBus 发布 hud:update（≤10 Hz）。
 * 高频通道 getPerFrame()：条形/扇形数据由 HudOverlay 的单一 rAF 直读（4.3.10 双通道）。
 */
import type { HudSnapshot } from './types';
import { resourceSystem } from './resourceSystem';
import { economyService } from './economyService';
import { emitEvent } from '../events';

export interface HudPerFrame {
    hpRatio: number;
    spRatio: number;
    lowHp: boolean;
    cooldowns: [number, number, number, number]; // 剩余秒（P2 技能接入后填充）
    weaponIcons: {
        main: string | null; sub: string | null;
        mainLevel: number; subLevel: number;
        activeHand: 'main' | 'sub';
    };
    bossBar: { name: string; ratio: number } | null; // P3 Boss 接入
    levelId: string;
    checkpointsActive: number;
}

export class HudViewModel {
    private acc = 0;
    private levelId = '';
    private checkpointsActive = 0;

    /** LevelScene 进关/检查点激活时更新上下文（命令式，非事件） */
    setContext(levelId: string, checkpointsActive: number): void {
        this.levelId = levelId;
        this.checkpointsActive = checkpointsActive;
    }

    tick(dt: number): void {
        this.acc += dt;
        if (this.acc < 0.1) { return; } // 100 ms 节流（FR-14 规则 8）
        this.acc = 0;
        const rs = resourceSystem.getSnapshot();
        const snapshot: HudSnapshot = {
            hp: rs.hp, hpMax: rs.hpMax, sp: rs.sp, spMax: rs.spMax,
            coins: economyService.getCoins(),
            materials: { ...economyService.getMaterials() }
        };
        emitEvent('hud:update', snapshot);
    }

    getPerFrame(): Readonly<HudPerFrame> {
        const rs = resourceSystem.getSnapshot();
        return {
            hpRatio: rs.hpMax > 0 ? rs.hp / rs.hpMax : 0,
            spRatio: rs.spMax > 0 ? rs.sp / rs.spMax : 0,
            lowHp: rs.lowHp,
            cooldowns: [0, 0, 0, 0],
            weaponIcons: { main: null, sub: null, mainLevel: 1, subLevel: 1, activeHand: 'main' },
            bossBar: null,
            levelId: this.levelId,
            checkpointsActive: this.checkpointsActive
        };
    }
}

/** 全局单例：LevelScene 写入上下文/tick，HudOverlay 经 rAF 读 getPerFrame（4.3.10 双通道） */
export const hudViewModel = new HudViewModel();
