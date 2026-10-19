<script setup lang="ts">
/**
 * MOD-25 HudOverlay（UI-03）：DOM HUD。双通道（4.3.10 / FR-14 规则 8）：
 * ① 文本类（金币/材料/关卡/检查点）订阅 hud:update（≤10 Hz）；
 * ② 条形类（HP/SP 比例、低血闪烁）经单一 rAF 直写 CSS 变量（scaleX 合成器路径，不触发布局），
 *    组件卸载时注销 rAF（NF-04 清理清单）。
 * 布局：左上 HP/SP 条 + 金币/残片 + 关卡信息；不遮挡中央 512×384（FR-14 边界）。
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { hudViewModel } from '../game/domain/hudViewModel';
import { onEvent, offEvent, type EventPayloads } from '../game/events';
import { UI_TEXT } from './i18n';

const hpText = ref('100/100');
const spText = ref('50/50');
const coins = ref(0);
const shards = ref(0);
const levelId = ref('');
const checkpoints = ref(0);
const lowHp = ref(false);
const hpBar = ref<HTMLElement | null>(null);
const spBar = ref<HTMLElement | null>(null);

let rafId = 0;

const onUpdate = (p: EventPayloads['hud:update']): void => {
    hpText.value = `${Math.round(p.hp)}/${p.hpMax}`;
    spText.value = `${Math.round(p.sp)}/${p.spMax}`;
    coins.value = p.coins;
    shards.value = p.materials['itm_relic_shard'] ?? 0;
};

// 高频通道：条形逐帧（FR-14 规则 8）
const loop = (): void => {
    const pf = hudViewModel.getPerFrame();
    if (hpBar.value !== null) { hpBar.value.style.transform = `scaleX(${pf.hpRatio})`; }
    if (spBar.value !== null) { spBar.value.style.transform = `scaleX(${pf.spRatio})`; }
    lowHp.value = pf.lowHp;
    levelId.value = pf.levelId;
    checkpoints.value = pf.checkpointsActive;
    rafId = requestAnimationFrame(loop);
};

onMounted(() => {
    onEvent('hud:update', onUpdate);
    rafId = requestAnimationFrame(loop);
});
onUnmounted(() => {
    offEvent('hud:update', onUpdate);
    cancelAnimationFrame(rafId);
});
</script>

<template>
    <div class="hud">
        <div class="topleft">
            <div class="bar hp" :class="{ low: lowHp }">
                <div ref="hpBar" class="fill"></div>
                <span class="txt">{{ hpText }}</span>
            </div>
            <div class="bar sp">
                <div ref="spBar" class="fill"></div>
                <span class="txt">{{ spText }}</span>
            </div>
            <div class="row">
                <span class="coin">◉ {{ coins }}</span>
                <span class="shard">◆ {{ shards }}</span>
            </div>
            <div class="row muted">
                {{ UI_TEXT.hud.level }} {{ levelId }} ｜ {{ UI_TEXT.hud.checkpoints }} {{ checkpoints }}
            </div>
        </div>
    </div>
</template>

<style scoped>
.hud { position: absolute; inset: 0; pointer-events: none; color: var(--fg); }
.topleft { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 6px; }
.bar {
    position: relative; width: 180px; height: 14px;
    background: rgba(0, 0, 0, 0.55); border: 1px solid var(--border); border-radius: 3px;
    overflow: hidden;
}
.bar.sp { height: 10px; }
.fill {
    position: absolute; inset: 0; transform-origin: left center;
    background: var(--hp); will-change: transform;
}
.bar.sp .fill { background: var(--sp); }
.bar.low .fill { animation: blink 0.5s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0.35; } }
.txt {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 10px; line-height: 1; color: #fff; text-shadow: 0 1px 2px #000;
}
.row { display: flex; gap: 14px; font-size: 15px; }
.coin { color: var(--gold); }
.shard { color: #9fe8ff; }
.muted { color: var(--muted); font-size: 13px; }
</style>
