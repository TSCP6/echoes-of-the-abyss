import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { Input, type Scene } from 'phaser';
import { DEFAULT_KEYMAP, InputGateway } from './inputGateway';

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
                    const key = new Input.Keyboard.Key({} as Input.Keyboard.KeyboardPlugin, code);
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
        for (let i = 0; i < 20; i++) {
            const f = fixture(gameEvents);
            expect(gameEvents.listenerCount('blur')).toBe(1);
            f.events.emit('shutdown');
            expect(gameEvents.listenerCount('blur')).toBe(0);
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
