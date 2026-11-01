import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../../../src/game/domain/player/settingsStore';

describe('SettingsStore 重映射', () => {
    it('规范化空白、大小写和空格键别名', () => {
        const s = new SettingsStore();
        expect(s.remap('moveLeft', ' q ').ok).toBe(true);
        expect(s.getSnapshot().keymap?.moveLeft).toBe('Q');
        expect(s.remap('jump', ' ').ok).toBe(true);
        expect(s.getSnapshot().keymap?.jump).toBe('SPACE');
    });

    it.each(['D', 'ArrowRight', 'K', '1', 'Tab', 'Y', 'Escape', 'F', 'Enter', 'F11'])('拒绝其他动作和固定快捷键 %s', (key) => {
        const s = new SettingsStore();
        expect(s.remap('moveLeft', key)).toMatchObject({ ok: false, code: 'KEY_CONFLICT' });
        expect(s.getSnapshot().keymap).toBeNull();
    });

    it.each(['', 'UnknownKey', 'hello', 'Ctrl+Q'])('拒绝无效键 %s，且不触发写档', (key) => {
        const s = new SettingsStore();
        let dirty = 0;
        s.onDirty(() => dirty++);
        expect(s.remap('moveLeft', key)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
        expect(dirty).toBe(0);
    });

    it('检查自定义键冲突，允许使用已释放的默认键并能恢复存档', () => {
        const s = new SettingsStore();
        s.remap('moveLeft', 'Q');
        expect(s.remap('jump', 'q')).toMatchObject({ ok: false, code: 'KEY_CONFLICT' });
        expect(s.remap('moveRight', 'A').ok).toBe(true);
        const loaded = new SettingsStore();
        loaded.fromSnapshot(s.toSnapshot());
        expect(loaded.getSnapshot().keymap).toEqual({ moveLeft: 'Q', moveRight: 'A' });
    });

    it('读档规范化且丢弃无效或冲突的旧映射', () => {
        const s = new SettingsStore();
        s.fromSnapshot({ ...s.toSnapshot(), keymap: { moveLeft: ' q ', jump: 'K', interact: 'nonsense' } });
        expect(s.getSnapshot().keymap).toEqual({ moveLeft: 'Q' });
    });
});
