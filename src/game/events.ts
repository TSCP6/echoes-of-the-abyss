/**
 * IF-E01~E12：DR-04 十二事件的载荷类型化（设计文档 6.2，事件名与 DR-04 逐字一致）。
 * ARCH-10：EventBus 只传这 12 个通知事件，载荷只读；禁止用事件发起命令。
 * 事件名字面量的单一出处（TT-05 门禁 ④）。
 */
import type { HudSnapshot, SlotEntry } from './domain/types';
import type { KeymapData } from './domain/saveSchema';

export type UiState =
    | 'none' | 'mainMenu' | 'levelSelect' | 'paused' | 'result'
    | 'inventory' | 'shop' | 'skillTree' | 'settings' | 'records' | 'help';

/** DR-04 事件名 → 载荷类型映射（唯一权威表） */
export interface EventPayloads {
    'hud:update': HudSnapshot;                                              // IF-E02
    'player:damaged': { amount: number; sourceId: string; hp: number };     // IF-E03
    'player:died': { levelId: string; checkpointId: string; lostCoins: number }; // IF-E04
    'enemy:killed': { enemyId: string; coins: number; position: { x: number; y: number }; rewardKey?: string | null }; // IF-E05
    'level:cleared': { levelId: string; timeSec: number; kills: number; shards: number; coins: number;
        earnedCoins?: number; firstClearCoins?: number; lostCoins?: number }; // IF-E06
    'inventory:changed': { slots: (SlotEntry | null)[]; equipped: { main: string | null; sub: string | null } }; // IF-E07
    'skill:unlocked': { skillId: string; remainingSkp: number };            // IF-E08
    'settings:changed': SettingsChangedPayload;                             // IF-E09
    'save:written': { slot: 0; at: string };                                // IF-E10
    'save:failed': { slot: 0; reason: 'QUOTA' | 'UNAVAILABLE' };            // IF-E11
    // IF-E12：open 表示切换后是否仍有面板；返回上一层面板时保持 true，最后一层关闭才为 false。
    'ui:overlay': { name: UiState; open: boolean };
    // 设计文档 6.2 契约外、4.3.10/8.3 UI-11 所需的桥接通知（TutorialDirector → TutorialHints，
    // DR-04 未列——按"不新增 DR-04 事件"原则走同一 EventBus 但以独立前缀标注非契约事件）：
    'tutorial:hint': { hintId: string; text: string } | { hintId: string; done: true };
    'load:progress': { percent: number };
    'game:requestPause': { reason: 'esc' | 'blur' };
    'game:requestInventory': { open: true };
    'game:requestShop': { sceneId: 1 | 2 | 3 };
    'game:requestLevelSelect': { from: 'camp' };
    'game:requestSkillTree': { open: true };
}

/** IF-E09 载荷 = Settings 全量（IF-M11） */
export interface SettingsChangedPayload {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    screenShake: boolean;
    fullscreen: boolean;
    keymap: KeymapData | null;
}

/**
 * 类型安全的事件收发门面。EventBus 本体是 Phaser.Events.EventEmitter（无泛型），
 * 此包装保证：事件名字面量与载荷类型在编译期一一对应（DR-04 契约的 TS 落实）。
 * 全部模块经此收发，不直接触碰 EventBus 字符串 API（TT-05 门禁 ④）。
 */
import { EventBus } from './EventBus';

export function emitEvent<K extends keyof EventPayloads>(name: K, payload: EventPayloads[K]): void {
    EventBus.emit(name, payload);
}

export function onEvent<K extends keyof EventPayloads>(name: K, handler: (payload: EventPayloads[K]) => void): void {
    EventBus.on(name, handler);
}

export function offEvent<K extends keyof EventPayloads>(name: K, handler: (payload: EventPayloads[K]) => void): void {
    EventBus.off(name, handler);
}

/** IF-E01（模板既有例外：载荷为 Phaser.Scene，保留原名与行为） */
export const CURRENT_SCENE_READY = 'current-scene-ready';
