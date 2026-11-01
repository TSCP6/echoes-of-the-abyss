<script setup lang="ts">
/** UI-09 设置（MOD-33）：三音量滑块（0~100 步进 5 实时生效）/震屏开关/全屏（FR-18）。
 *  重映射子项（FR-18 规则 2）：四组按键自定义，冲突拒绝并提示。 */
import { settingsStore } from '../../game/domain/player/settingsStore';
import { useDomainStore } from '../composables/useDomainStore';
import { onEvent, offEvent } from '../../game/events';
import { fullscreenAdapter } from '../../game/adapters/fullscreenAdapter';
import { ref } from 'vue';
import { effectiveKeys, REMAPPABLE_ACTIONS, type RemappableAction } from '../../game/domain/player/keymap';

const emit = defineEmits<{ close: [] }>();

const s = useDomainStore(
    () => settingsStore.getSnapshot(),
    (onChange) => {
        onEvent('settings:changed', onChange);
        return () => offEvent('settings:changed', onChange);
    }
);

const remapMsg = ref('');
const actionLabels: Record<RemappableAction, string> = {
    moveLeft: '向左移动', moveRight: '向右移动', jump: '跳跃', attackMain: '主手攻击', interact: '交互'
};

function setVol(ch: 'master' | 'music' | 'sfx', v: number): void {
    settingsStore.setVolume(ch, Math.round(v / 5) * 5);
}

function remap(action: RemappableAction): void {
    const key = window.prompt(`输入「${actionLabels[action]}」的新键名（字母、数字、Space、ArrowLeft 等；取消则保留）`, effectiveKeys(action, s.value.keymap)[0]);
    if (key === null) { return; }
    const r = settingsStore.remap(action, key);
    remapMsg.value = r.ok ? `已将${actionLabels[action]}设为 ${effectiveKeys(action, settingsStore.getSnapshot().keymap).join(' / ')}` : r.message;
}

/** FR-18 全屏：用户手势内调用 FullscreenAdapter；拒绝 → 提示 + 状态回滚（IF-X03） */
function toggleFullscreen(): void {
    fullscreenAdapter.toggle();
}
fullscreenAdapter.onRejected((r) => {
    remapMsg.value = r.message; // 复用提示行："请按 F11 手动全屏"
});
</script>

<template>
    <div class="settings">
        <div class="panel">
            <h2>设置</h2>
            <label class="row">主音量 <input type="range" min="0" max="100" step="5" :value="s.masterVolume"
                @input="setVol('master', Number(($event.target as HTMLInputElement).value))"> {{ s.masterVolume }}</label>
            <label class="row">音乐音量 <input type="range" min="0" max="100" step="5" :value="s.musicVolume"
                @input="setVol('music', Number(($event.target as HTMLInputElement).value))"> {{ s.musicVolume }}</label>
            <label class="row">音效音量 <input type="range" min="0" max="100" step="5" :value="s.sfxVolume"
                @input="setVol('sfx', Number(($event.target as HTMLInputElement).value))"> {{ s.sfxVolume }}</label>
            <label class="row">屏幕震动
                <input type="checkbox" :checked="s.screenShake" @change="settingsStore.setScreenShake(($event.target as HTMLInputElement).checked)">
            </label>
            <label class="row">全屏
                <input type="checkbox" :checked="s.fullscreen" @change="toggleFullscreen">
            </label>
            <div class="remap">
                <h3>按键重映射</h3>
                <button v-for="a in REMAPPABLE_ACTIONS"
                    :key="a" class="btn small" @click="remap(a)">{{ actionLabels[a] }}：{{ effectiveKeys(a, s.keymap).join(' / ') }}</button>
                <p v-if="remapMsg" class="warn" role="status">{{ remapMsg }}</p>
            </div>
            <button class="btn close" @click="emit('close')">返回</button>
        </div>
    </div>
</template>

<style scoped>
.settings { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(26,28,44,0.9); }
.panel { background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px; padding: 22px 36px; color: var(--fg); width: 380px; }
h2 { margin: 0 0 14px; font-size: 22px; }
h3 { margin: 10px 0 6px; font-size: 15px; color: var(--muted); }
.row { display: flex; align-items: center; gap: 10px; margin: 8px 0; font-size: 15px; }
.row input[type="range"] { flex: 1; accent-color: var(--accent); }
.remap { margin-top: 10px; }
.btn { padding: 6px 12px; margin: 2px; font-size: 14px; cursor: pointer; background: var(--surface); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.close { margin-top: 14px; width: 100%; padding: 9px 0; font-size: 15px; }
.warn { color: var(--error); font-size: 14px; }
</style>
