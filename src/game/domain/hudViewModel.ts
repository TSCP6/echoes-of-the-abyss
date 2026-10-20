/**
 * MOD-24 HudViewModel（领域层，IF-M13）—— FR-14 数据聚合与节流。
 * tick(dt) 仅管线阶段 10 调用；累计 ≥100 ms 经 EventBus 发布 hud:update（≤10 Hz）。
 * 高频通道 getPerFrame()：条形/扇形/Boss 血条数据由 HudOverlay 的单一 rAF 直读（4.3.10 双通道）。
 */
import type { HudSnapshot } from './types';
import { resourceSystem } from './resourceSystem';
import { economyService } from './economyService';
import { skillService } from './skillService';
import { weaponService } from './weaponService';
import { ConfigRegistry } from './configRegistry';
import { emitEvent } from '../events';

export interface HudPerFrame {
    hpRatio: number;
    spRatio: number;
    lowHp: boolean;
    cooldowns: [number, number, number, number];
    cooldownRatios: [number, number, number, number];
    weaponIcons: {
        main: string | null; sub: string | null;
        mainLevel: number; subLevel: number;
        activeHand: 'main' | 'sub';
    };
    bossBar: { name: string; ratio: number } | null;
    levelId: string;
    checkpointsActive: number;
}

export class HudViewModel {
    private acc = 0;
    private levelId = '';
    private checkpointsActive = 0;
    private bossBar: { name: string; ratio: number } | null = null;

    /** LevelScene 进关/检查点激活时更新上下文（命令式，非事件） */
    setContext(levelId: string, checkpointsActive: number): void {
        this.levelId = levelId;
        this.checkpointsActive = checkpointsActive;
    }

    /** LevelScene 每帧写入 Boss 血条数据（FR-14 规则 5 高频通道源） */
    setBossBar(bar: { name: string; ratio: number } | null): void { this.bossBar = bar; }

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
        const equipped = weaponService.getEquippedDefs();
        return {
            hpRatio: rs.hpMax > 0 ? rs.hp / rs.hpMax : 0,
            spRatio: rs.spMax > 0 ? rs.sp / rs.spMax : 0,
            lowHp: rs.lowHp,
            cooldowns: this.readCooldowns(),
            cooldownRatios: this.readCooldownRatios(),
            weaponIcons: {
                main: equipped.main?.id ?? null,
                sub: equipped.sub?.id ?? null,
                mainLevel: equipped.main !== null ? weaponService.getLevel(equipped.main.id, 'main') : 1,
                subLevel: equipped.sub !== null ? weaponService.getLevel(equipped.sub.id, 'sub') : 1,
                activeHand: weaponService.getActiveHand()
            },
            bossBar: this.bossBar,
            levelId: this.levelId,
            checkpointsActive: this.checkpointsActive
        };
    }

    /** FR-14 规则 3：loadout 四槽冷却剩余秒（文本数据源） */
    private readCooldowns(): [number, number, number, number] {
        const loadout = skillService.getLoadout();
        const out = [0, 1, 2, 3].map((i) => {
            const id = loadout[i];
            return id === null ? 0 : skillService.getCooldownLeft(id);
        });
        return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0, out[3] ?? 0];
    }

    /** 冷却扇形比例 = 剩余/总冷却（FR-14 规则 3 遮罩数据源） */
    private readCooldownRatios(): [number, number, number, number] {
        const loadout = skillService.getLoadout();
        const defs = ConfigRegistry.skills();
        const out = [0, 1, 2, 3].map((i) => {
            const id = loadout[i];
            if (id === null) { return 0; }
            const total = defs[id]?.cooldown ?? 0;
            return total > 0 ? Math.min(1, skillService.getCooldownLeft(id) / total) : 0;
        });
        return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0, out[3] ?? 0];
    }
}

/** 全局单例：LevelScene 写入上下文/tick，HudOverlay 经 rAF 读 getPerFrame（4.3.10 双通道） */
export const hudViewModel = new HudViewModel();
