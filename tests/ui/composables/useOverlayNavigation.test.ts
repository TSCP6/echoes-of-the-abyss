import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitEvent } from '../../../src/game/events';
import { audioDirector } from '../../../src/game/systems/presentation/audioDirector';
import { useOverlayNavigation } from '../../../src/ui/composables/useOverlayNavigation';

vi.mock('../../../src/game/events', () => ({ emitEvent: vi.fn() }));
vi.mock('../../../src/game/systems/presentation/audioDirector', () => ({ audioDirector: { playSfx: vi.fn() } }));

beforeEach(() => { vi.clearAllMocks(); });

describe('面板导航', () => {
    it('子面板返回仍暂停，关闭最后一层才恢复玩法', () => {
        const nav = useOverlayNavigation();
        nav.open('paused');
        nav.open('settings');
        nav.close();
        expect(nav.uiState.value).toBe('paused');
        expect(emitEvent).toHaveBeenLastCalledWith('ui:overlay', { name: 'paused', open: true });
        nav.close();
        expect(nav.uiState.value).toBe('none');
        expect(emitEvent).toHaveBeenLastCalledWith('ui:overlay', { name: 'paused', open: false });
        expect(audioDirector.playSfx).toHaveBeenLastCalledWith('ui_close');
    });

    it('直接跳转后关闭不会返回跳转前的暂停面板', () => {
        const nav = useOverlayNavigation();
        nav.open('paused');
        nav.open('help');
        nav.goto('levelSelect');
        expect(emitEvent).toHaveBeenLastCalledWith('ui:overlay', { name: 'levelSelect', open: true });
        nav.close();
        expect(nav.uiState.value).toBe('none');
    });

    it('跳转清空返回栈，进入玩法只关闭当前面板一次', () => {
        const nav = useOverlayNavigation();
        nav.open('paused');
        nav.open('help');
        nav.goto('levelSelect');
        expect(audioDirector.playSfx).toHaveBeenLastCalledWith('ui_click');
        nav.closeForGameplay();
        expect(nav.uiState.value).toBe('none');
        expect(emitEvent).toHaveBeenLastCalledWith('ui:overlay', { name: 'levelSelect', open: false });
        vi.mocked(emitEvent).mockClear();
        nav.closeForGameplay();
        expect(emitEvent).not.toHaveBeenCalled();
        nav.open('inventory');
        nav.close();
        expect(nav.uiState.value).toBe('none');
    });

    it('场景就绪或结算的静默重置不额外发事件或声音，并清空旧返回栈', () => {
        const nav = useOverlayNavigation();
        nav.open('paused');
        nav.open('help');
        vi.clearAllMocks();
        nav.reset('victory');
        expect(emitEvent).not.toHaveBeenCalled();
        expect(audioDirector.playSfx).not.toHaveBeenCalled();
        nav.open('inventory');
        nav.close();
        expect(nav.uiState.value).toBe('victory');
        nav.close();
        expect(nav.uiState.value).toBe('none');
    });
});
