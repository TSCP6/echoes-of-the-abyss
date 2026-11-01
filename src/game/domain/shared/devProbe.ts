/**
 * DEV-only 领域探针（13.2 测试接缝；生产构建经动态 import + import.meta.env.DEV tree-shake）。
 * 暴露领域单例与 SaveSystem 给浏览器控制台/自动化冒烟，用于 AT 用例验证
 * （存档往返、技能树、记录、经济），不进入生产包（NFR-09 不受影响）。
 */
import { saveSystem } from '../persistence/saveSystem';
import { progressService } from '../progression/progressService';
import { inventoryStore } from '../player/inventoryStore';
import { weaponService } from '../player/weaponService';
import { skillService } from '../player/skillService';
import { recordStore } from '../progression/recordStore';
import { settingsStore } from '../player/settingsStore';
import { economyService } from '../economy/economyService';
import { resourceSystem } from '../player/resourceSystem';
import { emitEvent, type EventPayloads } from '../../events';

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
        /** AT 验证接缝：经类型化门面发射 DR-04 事件（仅 DEV） */
        emit: <K extends keyof EventPayloads>(name: K, payload: EventPayloads[K]) => void;
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
        resources: resourceSystem,
        emit: (name, payload) => { emitEvent(name, payload); }
    };
}
