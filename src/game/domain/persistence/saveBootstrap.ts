/**
 * 存档装配（IF-M16 ParticipantRegistry 的注册点，4.3.8）。
 * 七 key（DR-02 顶层分节）：player（复合：Resource+ Economy + Skill 的 SKP）/
 * progress / inventory / weapons / skills / settings / records。
 * SaveSystem 只遍历注册表，不 import 具体 store 类型（新增持久化域不改 SaveSystem）。
 * 脏标记接线：settings/inventory 变更即 markDirty + queueWrite（FR-13 规则 2/3）。
 */
import { saveSystem, type SaveParticipant } from './saveSystem';
import type { SaveData } from './saveSchema';
import { resourceSystem } from '../player/resourceSystem';
import { economyService } from '../economy/economyService';
import { skillService } from '../player/skillService';
import { progressService } from '../progression/progressService';
import { inventoryStore } from '../player/inventoryStore';
import { weaponService } from '../player/weaponService';
import { settingsStore } from '../player/settingsStore';
import { recordStore } from '../progression/recordStore';
import { shopService } from '../economy/shopService';

interface PlayerSection {
    hp: number; hpMax: number; sp: number; spMax: number;
    coins: number; skillPoints: number; materials: Record<string, number>;
}

const playerParticipant: SaveParticipant<'player'> = {
    key: 'player',
    toSnapshot(): PlayerSection {
        const rs = resourceSystem.toSnapshot();
        const ec = economyService.toSnapshot();
        return {
            hp: rs.hp, hpMax: rs.hpMax, sp: rs.sp, spMax: rs.spMax,
            coins: ec.coins, skillPoints: skillService.skpBalance,
            materials: { ...ec.materials }
        };
    },
    fromSnapshot(d: PlayerSection): void {
        if (d === undefined || d === null) { return; }
        resourceSystem.fromSnapshot(d);
        economyService.fromSnapshot(d);
        // SKP earned 由 progress 推导（syncSkpFromProgress，load 完成后调用）
    }
};

const progressParticipant: SaveParticipant<'progress'> = {
    key: 'progress',
    toSnapshot: () => progressService.toSnapshot(),
    fromSnapshot: (d) => { if (d) { progressService.fromSnapshot(d); } }
};

const inventoryParticipant: SaveParticipant<'inventory'> = {
    key: 'inventory',
    toSnapshot: () => inventoryStore.toSnapshot(),
    fromSnapshot: (d) => { if (d) { inventoryStore.fromSnapshot(d); } }
};

const weaponsParticipant: SaveParticipant<'weapons'> = {
    key: 'weapons',
    toSnapshot: () => weaponService.toSnapshot(),
    fromSnapshot: (d) => { if (d) { weaponService.fromSnapshot(d); } }
};

const skillsParticipant: SaveParticipant<'skills'> = {
    key: 'skills',
    toSnapshot: () => skillService.toSnapshot(),
    fromSnapshot: (d) => { if (d) { skillService.fromSnapshot(d); } }
};

const settingsParticipant: SaveParticipant<'settings'> = {
    key: 'settings',
    toSnapshot: () => settingsStore.toSnapshot(),
    fromSnapshot: (d) => { if (d) { settingsStore.fromSnapshot(d); } }
};

const recordsParticipant: SaveParticipant<'records'> = {
    key: 'records',
    toSnapshot: () => recordStore.toSnapshot(),
    fromSnapshot: (d) => { if (d) { recordStore.fromSnapshot(d); } }
};

let registered = false;

/** Preloader 启动时调用一次（FLOW-R1） */
export function bootstrapSave(): void {
    if (registered) { return; }
    registered = true;
    saveSystem.register(playerParticipant);
    saveSystem.register(progressParticipant);
    saveSystem.register(inventoryParticipant);
    saveSystem.register(weaponsParticipant);
    saveSystem.register(skillsParticipant);
    saveSystem.register(settingsParticipant);
    saveSystem.register(recordsParticipant);

    // 变更即写档（FR-13 规则 3：设置项变更；FR-08：背包变更）
    const mark = (): void => {
        saveSystem.markDirty();
        saveSystem.queueWrite();
    };
    const delayed = (): void => { saveSystem.markDirty(); saveSystem.queueWrite(400); };
    settingsStore.onDirty(mark);
    inventoryStore.onDirty(delayed);
    skillService.onDirty(mark);
    progressService.onDirty(mark);
    economyService.onDirty(delayed);
    weaponService.onDirty(mark);
    shopService.onDirty(mark);
}

/** 读档成功后同步 SKP 累计获得（碎片数 + Boss 首通×2，附录 A） */
export function syncSkpFromProgress(): void {
    const shards = progressService.toSnapshot().collectedShards.length;
    const bosses = progressService.toSnapshot().clearedLevels.filter((id) => id.endsWith('-4')).length;
    skillService.syncEarned(shards + bosses * 2);
}

export type { SaveData };
