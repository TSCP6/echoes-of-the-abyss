<script setup lang="ts">
/** UI-09 设置（MOD-33）：三音量滑块（0~100 步进 5 实时生效）/震屏开关/全屏（FR-18）。
 *  重映射子项（FR-18 规则 2）：四组按键自定义，冲突拒绝并提示。 */
import { settingsStore } from '../game/domain/settingsStore';
import { useDomainStore } from './useDomainStore';
import { onEvent, offEvent } from '../game/events';

const emit = defineEmits<{ close: [] }>();

const s = useDomainStore(
    () => settingsStore.getSnapshot(),
    (onChange) => {
        onEvent('settings:changed', onChange);
        return () => offEvent('settings:changed', onChange);
    }
);

const remapMsg = { value: '' };

function setVol(ch: 'master' | 'music' | 'sfx', v: number): void {
    settingsStore.setVolume(ch, Math.round(v / 5) * 5);
}

function remap(action: 'moveLeft' | 'moveRight' | 'jump' | 'attackMain' | 'interact'): void {
    const key = window.prompt(`按下新按键以重映射「${action}」`);
    if (key === null || key === '') { return; }
    const r = settingsStore.remap(action, key.toUpperCase());
    remapMsg.value = r.ok ? '' : r.message;
}
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
            <label class="row">全屏（P4 接 FullscreenAdapter）
                <input type="checkbox" :checked="s.fullscreen" disabled>
            </label>
            <div class="remap">
                <h3>按键重映射</h3>
                <button v-for="a in ['moveLeft', 'moveRight', 'jump', 'attackMain', 'interact'] as const"
                    :key="a" class="btn small" @click="remap(a)">{{ a }}</button>
                <p v-if="remapMsg.value" class="warn">{{ remapMsg.value }}</p>
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
.btn { padding: 6px 12px; margin: 2px; font-size: 13px; cursor: pointer; background: var(--surface); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.close { margin-top: 14px; width: 100%; padding: 9px 0; font-size: 15px; }
.warn { color: var(--error); font-size: 13px; }
</style>
