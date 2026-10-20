/**
 * DEV-only 领域探针（13.2 测试接缝；生产构建经动态 import + import.meta.env.DEV tree-shake）。
 * 暴露领域单例与 SaveSystem 给浏览器控制台/自动化冒烟，用于 AT 用例验证
 * （存档往返、技能树、记录、经济），不进入生产包（NFR-09 不受影响）。
 */
import { saveSystem } from './saveSystem';
import { progressService } from './progressService';
import { inventoryStore } from './inventoryStore';
import { weaponService } from './weaponService';
import { skillService } from './skillService';
import { recordStore } from './recordStore';
import { settingsStore } from './settingsStore';
import { economyService } from './economyService';
import { resourceSystem } from './resourceSystem';

export function installDevProbe(): void {
    interface DevDomainProbe {
        save: typeof saveSystem;
        progress: typeof progressService;
        inventory: typeof inventoryStore;
        weapons: typeof weaponService;
        skills: typeof skillService;
        records: typeof recordStore;
        settings: typeof settingsStore;
        economy: typeof economyService;
        resources: typeof resourceSystem;
    }
    const devWin = window as unknown as { __SEAPP_DOMAIN__?: DevDomainProbe }; // 调试钩子，形状由本对象字面量保证
    devWin.__SEAPP_DOMAIN__ = {
        save: saveSystem,
        progress: progressService,
        inventory: inventoryStore,
        weapons: weaponService,
        skills: skillService,
        records: recordStore,
        settings: settingsStore,
        economy: economyService,
        resources: resourceSystem
    };
}
