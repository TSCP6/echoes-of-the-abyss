import { ref } from 'vue';
import { emitEvent, type UiState } from '../../game/events';
import { audioDirector } from '../../game/systems/presentation/audioDirector';

/** 单面板导航与返回栈；场景/胜利时序仍由 UiLayer 组装。 */
export function useOverlayNavigation() {
    const uiState = ref<UiState>('none');
    const history: UiState[] = [];

    function reset(state: UiState): void {
        history.length = 0;
        uiState.value = state;
    }

    function open(next: UiState): void {
        if (uiState.value !== 'none') { history.push(uiState.value); }
        uiState.value = next;
        emitEvent('ui:overlay', { name: next, open: true });
        audioDirector.playSfx('ui_open');
    }

    function close(): void {
        const prev = uiState.value;
        uiState.value = history.length > 0 ? history.pop() as UiState : 'none';
        // 返回上一层面板时仍应暂停；只有最后一层关闭才恢复玩法。
        const next = uiState.value;
        emitEvent('ui:overlay', { name: next === 'none' ? prev : next, open: next !== 'none' });
        audioDirector.playSfx('ui_close');
    }

    function goto(state: UiState): void {
        reset(state);
        emitEvent('ui:overlay', { name: state, open: true });
        audioDirector.playSfx('ui_click');
    }

    function closeForGameplay(): void {
        const prev = uiState.value;
        reset('none');
        if (prev !== 'none') { emitEvent('ui:overlay', { name: prev, open: false }); }
    }

    return { uiState, open, close, goto, reset, closeForGameplay };
}
