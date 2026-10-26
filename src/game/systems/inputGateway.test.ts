import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input, type Scene } from 'phaser';
import { DEFAULT_KEYMAP, InputGateway } from './inputGateway';
import { settingsStore } from '../domain/settingsStore';
import { EventBus } from '../EventBus';

afterEach(() => {
    EventBus.removeAllListeners('settings:changed');
    settingsStore.fromSnapshot({ ...settingsStore.toSnapshot(), keymap: null });
});

// 避开引擎入口的 DOM 设备检测，按键和边沿判定使用安装版本的真实实现。
vi.mock('phaser', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    // 包入口会初始化浏览器设备检测，按文件加载这些不依赖 DOM 的 CommonJS 组件。
    const keyRoot = '../../../node_modules/phaser/src/input/keyboard/keys/';
    return {
        Scenes: { Events: { SHUTDOWN: 'shutdown' } },
        Input: { Keyboard: {
            KeyCodes: require(`${keyRoot}KeyCodes.js`), Key: require(`${keyRoot}Key.js`),
            JustDown: require(`${keyRoot}JustDown.js`), JustUp: require(`${keyRoot}JustUp.js`)
        } }
    };
});

const keyEvent = { altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, location: 0, timeStamp: 1 } as KeyboardEvent;

function fixture(gameEvents = new EventEmitter()) {
    const events = new EventEmitter();
    const keys = new Map<number, Input.Keyboard.Key>();
    const pointer = { left: false, right: false, leftButtonDown() { return this.left; }, rightButtonDown() { return this.right; } };
    const scene = {
        events,
        game: { events: gameEvents },
        input: {
            keyboard: {
                addCapture: () => {},
                addKey(code: number): Input.Keyboard.Key {
                    const key = keys.get(code) ?? new Input.Keyboard.Key({} as Input.Keyboard.KeyboardPlugin, code);
                    keys.set(code, key);
                    return key;
                }
            },
            mousePointer: pointer
        }
    } as unknown as Scene;
    const gateway = new InputGateway(scene);
    return { gateway, gameEvents, events, keys, pointer };
}

describe('InputGateway 生命周期', () => {
    it('读取存档映射、实时应用变更并保留鼠标攻击', () => {
        settingsStore.remap('moveLeft', 'Q');
        const f = fixture();
        expect(f.keys.has(81)).toBe(true);
        f.keys.get(81)!.onDown(keyEvent);
        f.gateway.poll();
        expect(f.gateway.isDown('moveLeft')).toBe(true);
        settingsStore.remap('moveLeft', 'R');
        expect(f.gateway.isDown('moveLeft')).toBe(false);
        expect(f.gateway.justPressed('moveLeft')).toBe(false);
        f.gateway.poll();
        expect(f.gateway.isDown('moveLeft')).toBe(false);
        f.keys.get(82)!.onDown(keyEvent);
        f.pointer.left = true;
        f.gateway.poll();
        expect(f.gateway.justPressed('moveLeft')).toBe(true);
        expect(f.gateway.justPressed('attackMain')).toBe(true);
    });

    it('重映射不移除插件共享键对象，其他设置变更不清除输入，销毁后退订', () => {
        const before = EventBus.listenerCount('settings:changed');
        const f = fixture();
        expect(EventBus.listenerCount('settings:changed')).toBe(before + 1);
        const old = f.keys.get(DEFAULT_KEYMAP.moveLeft[0])!;
        old.onDown(keyEvent);
        f.gateway.poll();
        settingsStore.setVolume('music', 50);
        expect(f.gateway.isDown('moveLeft')).toBe(true);
        settingsStore.remap('moveLeft', 'Q');
        expect(f.keys.get(DEFAULT_KEYMAP.moveLeft[0])).toBe(old);
        expect(old.isDown).toBe(true);
        f.gateway.destroy();
        expect(EventBus.listenerCount('settings:changed')).toBe(before);
        settingsStore.remap('moveLeft', 'R');
        expect(f.keys.has(82)).toBe(false);
    });

    it('读档通知已有网关，主攻击更换键后保留左右鼠标，下一场景读取同一映射', () => {
        const f = fixture();
        const old = f.keys.get(DEFAULT_KEYMAP.attackMain[0])!;
        old.onDown(keyEvent);
        f.gateway.poll();
        expect(f.gateway.justPressed('attackMain')).toBe(true);
        settingsStore.fromSnapshot({ ...settingsStore.toSnapshot(), keymap: { attackMain: ' q ' } });
        expect(f.gateway.justPressed('attackMain')).toBe(false);
        f.gateway.poll();
        expect(f.gateway.isDown('attackMain')).toBe(false);
        f.pointer.left = true;
        f.pointer.right = true;
        f.gateway.poll();
        expect(f.gateway.justPressed('attackMain')).toBe(true);
        expect(f.gateway.justPressed('attackSub')).toBe(true);
        f.gateway.destroy();
        const next = fixture();
        next.keys.get(81)!.onDown(keyEvent);
        next.gateway.poll();
        expect(next.gateway.justPressed('attackMain')).toBe(true);
        expect(next.keys.has(DEFAULT_KEYMAP.attackMain[0])).toBe(true);
        next.gateway.destroy();
    });

    it('失焦立即清空语义输入快照，不必等下一帧 poll', () => {
        const f = fixture();
        const key = f.keys.get(DEFAULT_KEYMAP.moveRight[0])!;
        key.onDown(keyEvent);
        f.gateway.poll();
        expect(f.gateway.isDown('moveRight')).toBe(true);
        expect(f.gateway.justPressed('moveRight')).toBe(true);
        f.gameEvents.emit('blur');
        expect(f.gateway.isDown('moveRight')).toBe(false);
        expect(f.gateway.justPressed('moveRight')).toBe(false);
        expect(f.gateway.justReleased('moveRight')).toBe(false);
    });

    it('场景关闭后释放自己的失焦监听，保留其他模块的监听', () => {
        const f = fixture();
        let unrelatedCalls = 0;
        f.gameEvents.on('blur', () => { unrelatedCalls += 1; });
        f.events.emit('shutdown');
        expect(f.gameEvents.listenerCount('blur')).toBe(1);
        f.gameEvents.emit('blur');
        expect(unrelatedCalls).toBe(1);
    });

    it('反复创建与关闭 20 次后不累积全局失焦监听', () => {
        const gameEvents = new EventEmitter();
        const settingsListeners = EventBus.listenerCount('settings:changed');
        for (let i = 0; i < 20; i++) {
            const f = fixture(gameEvents);
            expect(gameEvents.listenerCount('blur')).toBe(1);
            expect(EventBus.listenerCount('settings:changed')).toBe(settingsListeners + 1);
            f.events.emit('shutdown');
            expect(gameEvents.listenerCount('blur')).toBe(0);
            expect(EventBus.listenerCount('settings:changed')).toBe(settingsListeners);
        }
    });

    it('主动销毁可重复调用，之后关闭场景也不会恢复监听或旧输入', () => {
        const f = fixture();
        f.keys.get(DEFAULT_KEYMAP.moveRight[0])!.onDown(keyEvent);
        f.pointer.left = true;
        f.gateway.poll();
        expect(f.gateway.isDown('moveRight')).toBe(true);
        expect(f.gateway.justPressed('attackMain')).toBe(true);
        // 模拟 Phaser 键盘插件先销毁按键，再调用业务层的关闭回调。
        for (const key of f.keys.values()) { key.destroy(); }
        f.gateway.destroy();
        f.gateway.destroy();
        f.events.emit('shutdown');
        f.gateway.poll();
        expect(f.gameEvents.listenerCount('blur')).toBe(0);
        expect(f.events.listenerCount('shutdown')).toBe(0);
        expect(f.gateway.isDown('moveRight')).toBe(false);
        expect(f.gateway.isDown('attackMain')).toBe(false);
        expect(f.gateway.justPressed('attackMain')).toBe(false);
    });
});
