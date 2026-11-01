/**
 * InputGateway（MOD-01 子件，管线阶段 1）—— 语义动作 → 物理键的只读封装。
 * 默认按键映射 = SRS 3.1 表；FR-18 重映射子项的接缝为 setKeymap()（P4 接 SettingsStore）。
 * EX-07：game blur 时清零全部按键状态（防卡键）。
 * poll() 每帧调用一次，快照 isDown/justPressed/justReleased（JustDown 读后即复位，故必须单点调用）。
 */
import { Input, Scenes, type Scene } from 'phaser';
import { settingsStore } from '../../domain/player/settingsStore';
import { onEvent, offEvent, type SettingsChangedPayload } from '../../events';
import { DEFAULT_BINDINGS, effectiveKeys, keyCode, REMAPPABLE_ACTIONS, type GameAction } from '../../domain/player/keymap';
export type { GameAction } from '../../domain/player/keymap';

/** 默认映射（SRS 3.1）：值为主键 + 备选键 */
export const DEFAULT_KEYMAP = Object.fromEntries(
    Object.entries(DEFAULT_BINDINGS).map(([action, keys]) => [action, keys.map(keyCode)])
) as Record<GameAction, number[]>;

/** 鼠标参与的动作（左键主攻击 / 右键副攻击） */
const MOUSE_ACTION: Partial<Record<GameAction, 'left' | 'right'>> = {
    attackMain: 'left',
    attackSub: 'right'
};

interface ActionState { down: boolean; justPressed: boolean; justReleased: boolean }

export class InputGateway {
    private keys = new Map<GameAction, Input.Keyboard.Key[]>();
    private state = new Map<GameAction, ActionState>();
    private prevMouse: Record<'left' | 'right', boolean> = { left: false, right: false };
    private enabled = true;
    private destroyed = false;
    private onBlur = (): void => this.clearAll();
    private onShutdown = (): void => this.destroy();
    private onSettingsChanged = (s: SettingsChangedPayload): void => {
        for (const action of REMAPPABLE_ACTIONS) {
            const codes = s.keymap?.[action] === undefined
                ? this.baseKeymap[action] : effectiveKeys(action, s.keymap).map(keyCode);
            if (codes.join(',') !== (this.keys.get(action) ?? []).map(k => k.keyCode).join(',')) {
                this.setKeymap(action, codes);
            }
        }
    };
    private baseKeymap: Record<GameAction, number[]>;
    constructor(private scene: Scene, keymap: Record<GameAction, number[]> = DEFAULT_KEYMAP) {
        this.baseKeymap = keymap;
        const kb = scene.input.keyboard;
        if (kb === null) { throw new Error('[InputGateway] 键盘插件不可用'); }
        // 捕获 Tab/Space/Esc 等默认行为（防焦点跳转/页面滚动，FR-15 键盘导航前提）
        kb.addCapture(Object.values(keymap).flat());
        for (const action of Object.keys(keymap) as GameAction[]) {
            this.keys.set(action, keymap[action].map((code) => kb.addKey(code)));
            this.state.set(action, { down: false, justPressed: false, justReleased: false });
        }
        // EX-07：失焦清零
        scene.game.events.on('blur', this.onBlur);
        scene.events.once(Scenes.Events.SHUTDOWN, this.onShutdown);
        this.onSettingsChanged(settingsStore.getSnapshot());
        onEvent('settings:changed', this.onSettingsChanged);
    }

    /** FR-18 重映射接缝（P4）：替换某动作的物理键 */
    setKeymap(action: GameAction, codes: number[]): void {
        const kb = this.scene.input.keyboard;
        if (kb === null || this.destroyed) { return; }
        // Phaser addKey 返回插件共享对象。仅换引用，不能移除或 reset 旧键。
        kb.addCapture(codes);
        this.keys.set(action, codes.map((code) => kb.addKey(code)));
        this.state.set(action, { down: false, justPressed: false, justReleased: false });
    }

    setInputEnabled(b: boolean): void {
        this.enabled = b;
        if (!b) { this.clearAll(); }
    }

    clearAll(): void {
        for (const keys of this.keys.values()) {
            for (const k of keys) { k.reset(); }
        }
        for (const st of this.state.values()) {
            st.down = false;
            st.justPressed = false;
            st.justReleased = false;
        }
        this.prevMouse.left = false;
        this.prevMouse.right = false;
    }

    /** 管线阶段 1：快照本帧输入（每帧恰好一次） */
    poll(): void {
        if (this.destroyed) { return; }
        const pointer = this.scene.input.mousePointer;
        const mouseDown = { left: pointer.leftButtonDown(), right: pointer.rightButtonDown() };
        for (const [action, st] of this.state) {
            if (!st) { continue; }
            const keys = this.keys.get(action) ?? [];
            let down = false;
            let justPressed = false;
            let justReleased = false;
            for (const k of keys) {
                if (k.isDown) { down = true; }
                if (Input.Keyboard.JustDown(k)) { justPressed = true; }
                if (Input.Keyboard.JustUp(k)) { justReleased = true; }
            }
            const mouse = MOUSE_ACTION[action];
            if (mouse !== undefined) {
                const md = mouseDown[mouse];
                if (md) { down = true; }
                if (md && !this.prevMouse[mouse]) { justPressed = true; }
                if (!md && this.prevMouse[mouse]) { justReleased = true; }
            }
            if (!this.enabled) { down = false; justPressed = false; justReleased = false; }
            st.down = down;
            st.justPressed = justPressed;
            st.justReleased = justReleased;
        }
        this.prevMouse.left = mouseDown.left;
        this.prevMouse.right = mouseDown.right;
    }

    isDown(action: GameAction): boolean { return this.state.get(action)?.down ?? false; }
    justPressed(action: GameAction): boolean { return this.state.get(action)?.justPressed ?? false; }
    justReleased(action: GameAction): boolean { return this.state.get(action)?.justReleased ?? false; }

    /** 只移除本实例的外部订阅；按键对象由 Phaser 键盘插件负责销毁。 */
    destroy(): void {
        if (this.destroyed) { return; }
        this.destroyed = true;
        offEvent('settings:changed', this.onSettingsChanged);
        this.scene.game.events.off('blur', this.onBlur);
        this.scene.events.off(Scenes.Events.SHUTDOWN, this.onShutdown);
        this.clearAll();
        this.keys.clear();
        this.state.clear();
        this.enabled = false;
    }
}
