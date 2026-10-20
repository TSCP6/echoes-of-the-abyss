<script setup lang="ts">
/**
 * MOD-25 HudOverlay（UI-03）：DOM HUD。双通道（4.3.10 / FR-14 规则 8）：
 * ① 文本类（金币/材料/关卡/检查点/技能秒数）订阅 hud:update（≤10 Hz）；
 * ② 条形类（HP/SP 比例、低血闪烁、冷却扇形、Boss 血条）经单一 rAF 直写 CSS
 *    （scaleX/conic-gradient 合成器路径，不触发布局），卸载时注销（NF-04）。
 * 布局（FR-14 规则 1~6）：左上 HP/SP+金币/残片+关卡；右下技能栏 4 格+武器栏；顶中 Boss 血条。
 * 不遮挡中央 512×384（FR-14 边界）。
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { hudViewModel } from '../game/domain/hudViewModel';
import { skillService } from '../game/domain/skillService';
import { onEvent, offEvent, type EventPayloads } from '../game/events';
import { UI_TEXT } from './i18n';

const hpText = ref('100/100');
const spText = ref('50/50');
const coins = ref(0);
const shards = ref(0);
const levelId = ref('');
const checkpoints = ref(0);
const lowHp = ref(false);
const cooldownTexts = ref(['', '', '', '']);
const bossName = ref('');
const bossVisible = ref(false);
const hpBar = ref<HTMLElement | null>(null);
const spBar = ref<HTMLElement | null>(null);
const bossBar = ref<HTMLElement | null>(null);
const cdMasks = ref<(HTMLElement | null)[]>([null, null, null, null]);
const loadout = ref<(string | null)[]>([null, null, null, null]);

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
    // 冷却扇形（conic-gradient）+ 剩余秒 1 位小数（FR-14 规则 3 / AT-49）
    pf.cooldowns.forEach((cd, i) => {
        const el = cdMasks.value[i];
        const ratio = pf.cooldownRatios[i] ?? 0;
        if (el !== null && el !== undefined) {
            el.style.background = ratio > 0
                ? `conic-gradient(rgba(0,0,0,0.65) ${ratio * 360}deg, transparent 0deg)`
                : 'none';
        }
        cooldownTexts.value[i] = cd > 0 ? cd.toFixed(1) : '';
    });
    loadout.value = [...skillService.getLoadout()];
    // Boss 血条（FR-14 规则 5 / AT-50）
    if (pf.bossBar !== null) {
        bossVisible.value = true;
        bossName.value = pf.bossBar.name;
        if (bossBar.value !== null) { bossBar.value.style.transform = `scaleX(${pf.bossBar.ratio})`; }
    } else {
        bossVisible.value = false;
    }
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
        <div v-if="bossVisible" class="bossbar">
            <span class="bossname">{{ bossName }}</span>
            <div class="bar boss">
                <div ref="bossBar" class="fill"></div>
            </div>
        </div>
        <div class="bottomright">
            <div class="weapons">
                <span class="wslot main">主</span>
                <span class="wslot sub">副</span>
            </div>
            <div class="skills">
                <div v-for="i in 4" :key="i" class="skill">
                    <span class="key">{{ i }}</span>
                    <span class="icon">{{ loadout[i - 1] ? '✦' : '' }}</span>
                    <div :ref="(el) => { cdMasks[i - 1] = el as HTMLElement | null; }" class="cdmask"></div>
                    <span class="cd">{{ cooldownTexts[i - 1] }}</span>
                </div>
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
.bar.boss { width: 600px; height: 12px; }
.fill {
    position: absolute; inset: 0; transform-origin: left center;
    background: var(--hp); will-change: transform;
}
.bar.sp .fill { background: var(--sp); }
.bar.boss .fill { background: var(--error); }
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
.bossbar {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.bossname { font-size: 14px; color: var(--error); text-shadow: 0 1px 2px #000; }
.bottomright { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.weapons { display: flex; gap: 6px; }
.wslot {
    width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 4px; font-size: 13px;
}
.wslot.main { border-color: var(--gold); }
.skills { display: flex; gap: 6px; }
.skill {
    position: relative; width: 48px; height: 48px;
    background: rgba(0,0,0,0.55); border: 1px solid var(--border); border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
}
.key { position: absolute; top: 2px; left: 4px; font-size: 11px; color: var(--muted); }
.icon { font-size: 20px; color: var(--accent); }
.cdmask { position: absolute; inset: 0; border-radius: 6px; }
.cd { position: absolute; bottom: 2px; right: 4px; font-size: 11px; color: var(--warning); }
</style>
