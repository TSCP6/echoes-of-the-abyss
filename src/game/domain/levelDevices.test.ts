import { describe, expect, it } from 'vitest';
import { DeviceState, advanceCrumble, type LevelDevice } from './levelDevices';

const lever = (id: string, order = 0): LevelDevice => ({
    id, kind: 'switch', x: 100, y: 100, width: 32, height: 32,
    group: 'door', order, label: id
});
const gate: LevelDevice = { ...lever('gate'), kind: 'gate' };

describe('关卡机关', () => {
    it('只能在附近交互，全部符文按序激活才开门', () => {
        const state = new DeviceState([lever('a', 1), lever('b', 2), gate]);
        expect(state.activate('a', 400, 100)).toBe('far');
        expect(state.activate('b', 100, 100)).toBe('wrong-order');
        expect(state.isGateOpen(gate)).toBe(false);
        expect(state.activate('a', 100, 100)).toBe('activated');
        expect(state.isGateOpen(gate)).toBe(false);
        expect(state.activate('a', 100, 100)).toBe('already');
        expect(state.activate('b', 100, 100)).toBe('activated');
        expect(state.isGateOpen(gate)).toBe(true);
    });

    it('错误顺序重置本组，其他机关互不影响；死亡重试清空激活状态', () => {
        const extra = { ...lever('other'), group: 'other' };
        const state = new DeviceState([lever('a', 1), lever('b', 2), lever('c', 3), extra]);
        state.activate('other', 100, 100);
        state.activate('a', 100, 100);
        expect(state.activate('c', 100, 100)).toBe('wrong-order');
        expect(state.isActive('a')).toBe(false);
        expect(state.isActive('other')).toBe(true);
        state.reset();
        expect(state.isActive('other')).toBe(false);
        expect(state.isGateOpen(gate)).toBe(false);
    });

    it('没有关联开关的门不会被错误打开', () => {
        expect(new DeviceState([gate]).isGateOpen(gate)).toBe(false);
    });

    it('崩塌平台踩踏一秒后消失，三秒后复原；离开平台仍继续预警', () => {
        let state = advanceCrumble({ phase: 'stable', elapsed: 0 }, true, 0.4);
        expect(state.phase).toBe('warning');
        state = advanceCrumble(state, false, 0.61);
        expect(state.phase).toBe('missing');
        state = advanceCrumble(state, false, 2.9);
        expect(state.phase).toBe('missing');
        expect(advanceCrumble(state, false, 0.11).phase).toBe('stable');
    });
});
