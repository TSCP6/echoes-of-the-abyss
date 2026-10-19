/**
 * InputGateway（MOD-01 子件，管线阶段 1）—— 语义动作 → 物理键的只读封装。
 * 默认按键映射 = SRS 3.1 表；FR-18 重映射子项的接缝为 setKeymap()（P4 接 SettingsStore）。
 * EX-07：game blur 时清零全部按键状态（防卡键）。
 * poll() 每帧调用一次，快照 isDown/justPressed/justReleased（JustDown 读后即复位，故必须单点调用）。
 */
import { Input, type Scene } from 'phaser';

export type GameAction =
    | 'moveLeft' | 'moveRight' | 'jump'
    | 'attackMain' | 'attackSub'
    | 'skill1' | 'skill2' | 'skill3' | 'skill4'
    | 'interact' | 'inventory' | 'skillTree' | 'pause' | 'fullscreen';

const KEY = Input.Keyboard.KeyCodes;

/** 默认映射（SRS 3.1）：值为主键 + 备选键 */
export const DEFAULT_KEYMAP: Record<GameAction, number[]> = {
    moveLeft: [KEY.A, KEY.LEFT],
    moveRight: [KEY.D, KEY.RIGHT],
    jump: [KEY.SPACE],
    attackMain: [KEY.J],
    attackSub: [KEY.K],
    skill1: [KEY.ONE],
    skill2: [KEY.TWO],
    skill3: [KEY.THREE],
    skill4: [KEY.FOUR],
    interact: [KEY.E],
    inventory: [KEY.TAB],
    skillTree: [KEY.Y],
    pause: [KEY.ESC],
    fullscreen: [KEY.F]
};

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
    constructor(private scene: Scene, keymap: Record<GameAction, number[]> = DEFAULT_KEYMAP) {
        const kb = scene.input.keyboard;
        if (kb === null) { throw new Error('[InputGateway] 键盘插件不可用'); }
        // 捕获 Tab/Space/Esc 等默认行为（防焦点跳转/页面滚动，FR-15 键盘导航前提）
        kb.addCapture(Object.values(keymap).flat());
        for (const action of Object.keys(keymap) as GameAction[]) {
            this.keys.set(action, keymap[action].map((code) => kb.addKey(code)));
            this.state.set(action, { down: false, justPressed: false, justReleased: false });
        }
        // EX-07：失焦清零
        scene.game.events.on('blur', () => this.clearAll());
    }

    /** FR-18 重映射接缝（P4）：替换某动作的物理键 */
    setKeymap(action: GameAction, codes: number[]): void {
        const kb = this.scene.input.keyboard;
        if (kb === null) { return; }
        for (const old of this.keys.get(action) ?? []) { kb.removeKey(old); }
        this.keys.set(action, codes.map((code) => kb.addKey(code)));
    }

    setInputEnabled(b: boolean): void {
        this.enabled = b;
        if (!b) { this.clearAll(); }
    }

    clearAll(): void {
        for (const keys of this.keys.values()) {
            for (const k of keys) { k.reset(); }
        }
        this.prevMouse.left = false;
        this.prevMouse.right = false;
    }

    /** 管线阶段 1：快照本帧输入（每帧恰好一次） */
    poll(): void {
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
}
