<script setup lang="ts">
/**
 * UiLayer（4.5）：覆盖画布之上的 DOM UI 根。activeOverlay 状态机（UiState），
 * 同一时刻至多一个全屏面板，HUD 常驻（仅关卡/营地内）。
 * 迁移驱动：AppBoot.ready → mainMenu；game:requestPause → paused；game:requestInventory → inventory；
 * game:requestShop → shop；game:requestLevelSelect → levelSelect；level:cleared → result。
 * 进入/离开 overlay 发布 ui:overlay（IF-E12，唯一发布方）→ 场景 pause/resume（FR-15 规则 8）。
 * Esc 栈式返回（FR-15）；0.3 s 淡入淡出（UI-C3）。离开营地为存档写入点（FR-13 规则 2）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { EventBus } from '../game/EventBus';
import { AppBoot } from '../game/domain/shared/appBoot';
import { progressService } from '../game/domain/progression/progressService';
import { campaignSummary } from '../game/domain/progression/campaignVictory';
import { saveSystem } from '../game/domain/persistence/saveSystem';
import { sceneDirector } from '../game/systems/flow/sceneDirector';
import { emitEvent, onEvent, offEvent, type EventPayloads } from '../game/events';
import { audioDirector } from '../game/systems/presentation/audioDirector';
import { audioAdapter } from '../game/adapters/audioAdapter';
import MainMenuView from './views/MainMenuView.vue';
import LevelSelectView from './views/LevelSelectView.vue';
import PauseOverlay from './panels/PauseOverlay.vue';
import ResultView from './views/ResultView.vue';
import VictoryView from './views/VictoryView.vue';
import HelpView from './views/HelpView.vue';
import HudOverlay from './components/HudOverlay.vue';
import InventoryPanel from './panels/InventoryPanel.vue';
import ShopPanel from './panels/ShopPanel.vue';
import SkillTreePanel from './panels/SkillTreePanel.vue';
import SettingsPanel from './panels/SettingsPanel.vue';
import RecordsView from './views/RecordsView.vue';
import TutorialHints from './components/TutorialHints.vue';
import SaveManagerPanel from './panels/SaveManagerPanel.vue';
import { UI_TEXT } from './i18n';
import { useOverlayNavigation } from './composables/useOverlayNavigation';
import { useSaveActions } from './composables/useSaveActions';

const { uiState, open, close, goto, reset, closeForGameplay } = useOverlayNavigation();
const booted = ref(false);
const sceneKey = ref('');
const resultData = ref<EventPayloads['level:cleared'] | null>(null);
const hasVictory = ref(false);
const victoryFirstClear = ref(false);
const victoryIntro = ref(true);
const shopSceneId = ref<1 | 2 | 3>(1);
let requestedGameplay: 'Level' | 'Camp' | null = null;
const { hasSave, saveManagerOpen, saveSummary, saveFailed, saveNotice,
    initializeSave, showSaveManager, retrySave, exportSave, onSaveImported, saveAndQuit } = useSaveActions({
    onRefresh: () => { hasVictory.value = campaignSummary().completed; },
    onQuit: () => {
        requestedGameplay = null;
        reset('mainMenu');
        sceneDirector.gotoMenu();
    }
});

function continueGame(): void {
    const currentLevel = progressService.getCurrentLevel();
    if (currentLevel !== null) { enterLevel(currentLevel, true); return; }
    if (progressService.isCleared('3-4')) { enterCamp(3); return; }
    const unlocked = progressService.getLevelViews().filter((level) => level.unlocked);
    enterLevel(unlocked[unlocked.length - 1]?.levelId ?? '1-1', true);
}

const showHud = computed(() => sceneKey.value === 'Level' && uiState.value === 'none');
const showTutorial = computed(() => sceneKey.value === 'Level');

/** 供子视图调用：进入关卡（关 overlay + 切场景） */
function enterLevel(levelId: string, resume = false): void {
    requestedGameplay = 'Level';
    closeForGameplay();
    sceneDirector.gotoLevel(levelId, resume);
}

function enterCamp(sceneId: 1 | 2 | 3): void {
    requestedGameplay = 'Camp';
    closeForGameplay();
    sceneDirector.gotoCamp(sceneId);
}

function backToMenu(): void {
    requestedGameplay = null;
    reset('mainMenu');
    // FR-13 规则 2：退出到主菜单 = 写入点
    saveSystem.markDirty();
    saveSystem.queueWrite();
    sceneDirector.gotoMenu();
}

const onPauseRequest = (): void => {
    if (uiState.value === 'none' && (sceneKey.value === 'Level' || sceneKey.value === 'Camp')) { open('paused'); }
};
const onInventoryRequest = (): void => {
    if (uiState.value === 'none' && sceneKey.value === 'Level') { open('inventory'); }
};
const onShopRequest = (p: { sceneId: 1 | 2 | 3 }): void => {
    if (uiState.value === 'none' && sceneKey.value === 'Camp') {
        shopSceneId.value = p.sceneId;
        open('shop');
    }
};
const onSkillTreeRequest = (): void => {
    if (uiState.value === 'none' && sceneKey.value === 'Level') { open('skillTree'); }
};
const onLevelSelectRequest = (): void => {
    // 离开营地 = 写入点（FR-13 规则 2）
    if (sceneKey.value === 'Camp') {
        saveSystem.markDirty();
        saveSystem.queueWrite();
    }
    goto('levelSelect');
};
const onLevelCleared = (p: EventPayloads['level:cleared']): void => {
    resultData.value = p;
    hasVictory.value = campaignSummary().completed;
    victoryFirstClear.value = p.campaignVictory?.firstClear ?? false;
    victoryIntro.value = true;
    reset(p.campaignVictory && hasVictory.value ? 'victory' : 'result');
    emitEvent('ui:overlay', { name: uiState.value, open: true });
};
function replayEnding(): void {
    if (!campaignSummary().completed) { return; }
    resultData.value = null;
    victoryFirstClear.value = true;
    victoryIntro.value = true;
    goto('victory');
}
function victoryInventory(): void {
    victoryIntro.value = false;
    open('inventory');
}
/** Phaser.Scene 无直接 .key 属性（键在 ScenePlugin/sys.settings 上，模板 App.vue 同用法）；命名 const 窄化读取 */
function sceneKeyOf(s: unknown): string {
    if (s === null || typeof s !== 'object') { return ''; }
    const sceneLike = s as { scene?: { key?: string }; sys?: { settings?: { key?: string } }; key?: string };
    return sceneLike.scene?.key ?? sceneLike.sys?.settings?.key ?? sceneLike.key ?? '';
}
const onSceneReady = (scene: unknown): void => {
    sceneKey.value = sceneKeyOf(scene);
    if (sceneKey.value === requestedGameplay) {
        requestedGameplay = null;
        uiState.value = 'none';
    }
    // 菜单与安全营地使用舒缓钢琴；区域探索和 Boss 入场由 LevelScene 切换。
    if (sceneKey.value === 'Menu') { audioDirector.playBgm('menu'); }
    if (sceneKey.value === 'Camp') { audioDirector.playBgm('menu'); }
    if (sceneKey.value === 'Menu' && requestedGameplay === null && booted.value && uiState.value === 'none') {
        uiState.value = 'mainMenu';
    }
};
const consumedKeys = new Set<string>();
const onKeyup = (e: KeyboardEvent): void => {
    if (!consumedKeys.delete(e.code || e.key)) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
};
const onBlur = (): void => { consumedKeys.clear(); };
const onKeydown = (e: KeyboardEvent): void => {
    // 终章的 Esc 只跳过演出/聚焦导航，不能关闭到空菜单。
    if (uiState.value === 'victory') { return; }
    if (saveManagerOpen.value) {
        if (e.key === 'Escape') {
            consumedKeys.add(e.code || e.key);
            e.preventDefault();
            e.stopImmediatePropagation();
            saveManagerOpen.value = false;
        }
        return;
    }
    if (consumedKeys.has(e.code || e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }
    if (e.repeat) { return; }
    const back = e.key === 'Escape'
        || (e.key === 'Tab' && uiState.value === 'inventory')
        || (e.key.toLowerCase() === 'y' && uiState.value === 'skillTree');
    if (back && uiState.value !== 'none' && uiState.value !== 'mainMenu') {
        // DOM 已消费的关闭键不再交给恢复后的 Phaser，直到物理 keyup。
        consumedKeys.add(e.code || e.key);
        e.preventDefault();
        e.stopImmediatePropagation();
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
        get readyCount() { return readyCount; }
    };
}

onMounted(() => {
    mountedFlag = true;
    onEvent('game:requestPause', onPauseRequest);
    onEvent('game:requestInventory', onInventoryRequest);
    onEvent('game:requestShop', onShopRequest);
    onEvent('game:requestLevelSelect', onLevelSelectRequest);
    onEvent('game:requestSkillTree', onSkillTreeRequest);
    onEvent('level:cleared', onLevelCleared);
    EventBus.on('current-scene-ready', (s: unknown) => {
        readyCount += 1;
        lastKey = sceneKeyOf(s);
        onSceneReady(s);
    });
    // FLOW-S1 步骤 1 / NFR-10：首次用户手势内解锁 AudioContext（EX-08 拒绝则静音运行）
    const unlockOnce = (): void => {
        const game = sceneDirector.gameRef;
        if (game !== null) { audioAdapter.unlock(game); }
        window.removeEventListener('pointerdown', unlockOnce);
        window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('keyup', onKeyup, true);
    window.addEventListener('blur', onBlur);
    AppBoot.ready.then((r) => {
        initializeSave(r.save !== null);
        booted.value = true;
        if (sceneKey.value === 'Menu') { uiState.value = 'mainMenu'; }
    }).catch(() => {
        booted.value = true; // 配置错误页由 Preloader 画布呈现（EX-03）
    });
});

onUnmounted(() => {
    offEvent('game:requestPause', onPauseRequest);
    offEvent('game:requestInventory', onInventoryRequest);
    offEvent('game:requestShop', onShopRequest);
    offEvent('game:requestLevelSelect', onLevelSelectRequest);
    offEvent('level:cleared', onLevelCleared);
    offEvent('game:requestSkillTree', onSkillTreeRequest);
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('keyup', onKeyup, true);
    window.removeEventListener('blur', onBlur);
});

defineExpose({ open, close, enterLevel, enterCamp, backToMenu, goto, hasSave });
</script>

<template>
    <div class="ui-layer">
        <HudOverlay v-if="showHud" />
        <TutorialHints v-if="showTutorial" />
        <Transition name="fade">
            <div v-if="!booted" class="overlay loading">加载中…</div>
            <MainMenuView v-else-if="uiState === 'mainMenu'" :has-save="hasSave" :has-victory="hasVictory"
                @start="goto('levelSelect')" @continue="continueGame"
                @levels="goto('levelSelect')" @settings="open('settings')" @help="open('help')"
                @records="open('records')" @saves="showSaveManager" @ending="replayEnding" />
            <LevelSelectView v-else-if="uiState === 'levelSelect'" @enter="enterLevel" @back="backToMenu"
                @camp="enterCamp" />
            <PauseOverlay v-else-if="uiState === 'paused'" @resume="close" @help="open('help')"
                @settings="open('settings')" @abandon="goto('levelSelect')"
                @save-quit="saveAndQuit" @saves="showSaveManager" />
            <ResultView v-else-if="uiState === 'result'" :data="resultData"
                @next="enterLevel" @retry="enterLevel" @levels="goto('levelSelect')" />
            <VictoryView v-else-if="uiState === 'victory'" :data="resultData" :first-clear="victoryFirstClear"
                :intro-on-mount="victoryIntro" @camp="enterCamp(3)" @levels="goto('levelSelect')"
                @menu="backToMenu" @inventory="victoryInventory" />
            <InventoryPanel v-else-if="uiState === 'inventory'" @close="close" />
            <ShopPanel v-else-if="uiState === 'shop'" :scene-id="shopSceneId" @close="close" />
            <SkillTreePanel v-else-if="uiState === 'skillTree'" @close="close" />
            <SettingsPanel v-else-if="uiState === 'settings'" @close="close" />
            <RecordsView v-else-if="uiState === 'records'" @close="close" />
            <HelpView v-else-if="uiState === 'help'" @back="close" />
        </Transition>
        <div v-if="saveNotice && !saveManagerOpen" class="save-notice" :role="saveFailed ? 'alert' : 'status'">
            <span>{{ saveNotice }}</span>
            <template v-if="saveFailed">
                <button @click="retrySave">{{ UI_TEXT.save.retry }}</button>
                <button @click="exportSave">{{ UI_TEXT.save.export }}</button>
            </template>
            <button v-else @click="saveNotice = ''">{{ UI_TEXT.save.dismiss }}</button>
        </div>
        <SaveManagerPanel v-if="saveManagerOpen" :allow-import="uiState === 'mainMenu'" :summary="saveSummary"
            :failed="saveFailed" :notice="saveNotice" @close="saveManagerOpen = false"
            @retry="retrySave" @export="exportSave" @imported="onSaveImported" />
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
/* 交互面板接收鼠标；HUD 和教学提示须穿透到游戏画布。 */
.ui-layer > :deep(:not(.hud):not(.hint)) { pointer-events: auto; }
/* 内容超过小窗口时从顶部滚动，避免居中布局把标题或返回按钮裁到屏幕外。 */
.ui-layer > :deep(:not(.hud):not(.hint):not(.victory)) {
    box-sizing: border-box;
    padding: 16px;
    overflow: auto;
    overscroll-behavior: contain;
    align-items: safe center;
    justify-content: safe center;
}
.ui-layer > :deep(.menu) { justify-content: flex-start; }
.ui-layer > :deep(.victory) { padding: 0; }
.ui-layer > :deep(.select) { justify-content: flex-start; }
.ui-layer > :deep(.select > *) { flex-shrink: 0; }
.ui-layer :deep(.panel) {
    box-sizing: border-box;
    max-width: 100%;
    flex-shrink: 0;
    margin: auto;
}
@media (max-width: 640px) {
    .ui-layer :deep(.panel) { padding: 16px; }
    .ui-layer :deep(.tree .cols) { flex-wrap: wrap; gap: 16px; }
    .ui-layer :deep(.shop .row) { flex-wrap: wrap; }
    .ui-layer :deep(.help td) { padding: 5px 8px; }
    .ui-layer :deep(.inv .grid) { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
    .ui-layer :deep(.inv .cell) { width: clamp(38px, 10vw, 56px); height: clamp(38px, 10vw, 56px); }
    .ui-layer :deep(.pause .col) { width: min(240px, 100%); }
}
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
.ui-layer > .save-notice {
    position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    width: min(720px, calc(100% - 32px)); padding: 12px 16px;
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
    background: var(--surface-2); color: var(--fg); border: 2px solid var(--border); border-radius: 6px;
}
.save-notice span { flex: 1 1 240px; font-size: 15px; }
.save-notice button { font-size: 15px; padding: 8px 12px; color: var(--fg); background: var(--surface); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
.save-notice button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
