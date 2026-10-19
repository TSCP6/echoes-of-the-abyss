<script setup lang="ts">
/**
 * UiLayer（4.5）：覆盖画布之上的 DOM UI 根。activeOverlay 状态机（UiState），
 * 同一时刻至多一个全屏面板，HUD 常驻（仅关卡内）。
 * 迁移驱动：AppBoot.ready → mainMenu；game:requestPause → paused；level:cleared → result；
 * 进入/离开 overlay 发布 ui:overlay（IF-E12，唯一发布方）→ 场景 pause/resume（FR-15 规则 8）。
 * Esc 栈式返回（FR-15）；0.3 s 淡入淡出（UI-C3，Vue Transition）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { EventBus } from '../game/EventBus';
import { AppBoot } from '../game/domain/appBoot';
import { progressService } from '../game/domain/progressService';
import { sceneDirector } from '../game/systems/sceneDirector';
import { emitEvent, onEvent, offEvent, type UiState, type EventPayloads } from '../game/events';
import MainMenuView from './MainMenuView.vue';
import LevelSelectView from './LevelSelectView.vue';
import PauseOverlay from './PauseOverlay.vue';
import ResultView from './ResultView.vue';
import HelpView from './HelpView.vue';
import HudOverlay from './HudOverlay.vue';

const uiState = ref<UiState>('none');
const booted = ref(false);
const hasSave = ref(false);
const sceneKey = ref('');
const resultData = ref<EventPayloads['level:cleared'] | null>(null);
const history: UiState[] = [];

const showHud = computed(() => sceneKey.value === 'Level' && uiState.value === 'none');

function open(next: UiState): void {
    if (uiState.value !== 'none') { history.push(uiState.value); }
    uiState.value = next;
    emitEvent('ui:overlay', { name: next, open: true });
}

function close(): void {
    const prev = uiState.value;
    uiState.value = history.length > 0 ? history.pop() as UiState : 'none';
    emitEvent('ui:overlay', { name: prev, open: false });
}

function goto(state: UiState): void {
    history.length = 0;
    uiState.value = state;
    emitEvent('ui:overlay', { name: state, open: true });
}

/** 供子视图调用：进入关卡（关 overlay + 切场景） */
function enterLevel(levelId: string): void {
    history.length = 0;
    const prev = uiState.value;
    uiState.value = 'none';
    if (prev !== 'none') { emitEvent('ui:overlay', { name: prev, open: false }); }
    sceneDirector.gotoLevel(levelId);
}

function backToMenu(): void {
    history.length = 0;
    uiState.value = 'mainMenu';
    sceneDirector.gotoMenu();
}

const onPauseRequest = (): void => {
    if (uiState.value === 'none' && sceneKey.value === 'Level') { open('paused'); }
};
const onLevelCleared = (p: EventPayloads['level:cleared']): void => {
    resultData.value = p;
    history.length = 0;
    uiState.value = 'result';
    emitEvent('ui:overlay', { name: 'result', open: true });
};
/** Phaser.Scene 无直接 .key 属性（键在 ScenePlugin/sys.settings 上，模板 App.vue 同用法）；命名 const 窄化读取 */
function sceneKeyOf(s: unknown): string {
    if (s === null || typeof s !== 'object') { return ''; }
    const sceneLike = s as { scene?: { key?: string }; sys?: { settings?: { key?: string } }; key?: string };
    return sceneLike.scene?.key ?? sceneLike.sys?.settings?.key ?? sceneLike.key ?? '';
}
const onSceneReady = (scene: unknown): void => {
    sceneKey.value = sceneKeyOf(scene);
    if (sceneKey.value === 'Menu' && booted.value && uiState.value === 'none') {
        uiState.value = 'mainMenu';
    }
};
const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && uiState.value !== 'none' && uiState.value !== 'mainMenu') {
        close();
    }
};

// DEV-only 状态探针（13.2 测试接缝；生产构建 tree-shake）
let mountedFlag = false;
let readyCount = 0;
let lastKey = '';
if (import.meta.env.DEV) {
    interface DevUiProbe {
        state: string; booted: boolean; sceneKey: string;
        mounted: boolean; readyCount: number; lastKey: string;
    }
    const devWin = window as unknown as { __SEAPP_UI__?: DevUiProbe }; // 调试钩子，形状由本 getter 对象保证
    devWin.__SEAPP_UI__ = {
        get state() { return uiState.value; },
        get booted() { return booted.value; },
        get sceneKey() { return sceneKey.value; },
        get lastKey() { return lastKey; },
        get mounted() { return mountedFlag; },
        get readyCount() { return readyCount; },
    };
}

onMounted(() => {
    mountedFlag = true;
    onEvent('game:requestPause', onPauseRequest);
    onEvent('level:cleared', onLevelCleared);
    EventBus.on('current-scene-ready', (s: unknown) => {
        readyCount += 1;
        lastKey = sceneKeyOf(s);
        onSceneReady(s);
    });
    window.addEventListener('keydown', onKeydown);
    AppBoot.ready.then((r) => {
        hasSave.value = r.save !== null;
        booted.value = true;
        if (sceneKey.value === 'Menu') { uiState.value = 'mainMenu'; }
    }).catch(() => {
        booted.value = true; // 配置错误页由 Preloader 画布呈现（EX-03）
    });
});

onUnmounted(() => {
    offEvent('game:requestPause', onPauseRequest);
    offEvent('level:cleared', onLevelCleared);
    window.removeEventListener('keydown', onKeydown);
});

defineExpose({ open, close, enterLevel, backToMenu, goto, hasSave });
</script>

<template>
    <div class="ui-layer">
        <HudOverlay v-if="showHud" />
        <Transition name="fade">
            <div v-if="!booted" class="overlay loading">加载中…</div>
            <MainMenuView v-else-if="uiState === 'mainMenu'" :has-save="hasSave"
                @start="goto('levelSelect')" @continue="enterLevel(progressService.getCurrentLevel() ?? '1-1')"
                @levels="goto('levelSelect')" @help="open('help')" />
            <LevelSelectView v-else-if="uiState === 'levelSelect'" @enter="enterLevel" @back="backToMenu" />
            <PauseOverlay v-else-if="uiState === 'paused'" @resume="close" @help="open('help')"
                @abandon="backToMenu(); goto('levelSelect')" />
            <ResultView v-else-if="uiState === 'result'" :data="resultData"
                @next="enterLevel" @retry="enterLevel" @levels="goto('levelSelect')" />
            <HelpView v-else-if="uiState === 'help'" @back="close" />
        </Transition>
    </div>
</template>

<style scoped>
.ui-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}
.ui-layer :deep(*) { pointer-events: auto; }
.overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(26, 28, 44, 0.92);
    color: var(--fg);
}
.loading { font-size: 24px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
