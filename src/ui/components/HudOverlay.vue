<script setup lang="ts">
/**
 * MOD-25 HudOverlay（UI-03）：DOM HUD。双通道（4.3.10 / FR-14 规则 8）：
 * ① 文本类（金币/材料/关卡/检查点/技能秒数）订阅 hud:update（≤10 Hz）；
 * ② 条形类（HP/SP 比例、低血闪烁、冷却扇形、Boss 血条）经单一 rAF 直写 CSS
 *    （scaleX/conic-gradient 合成器路径，不触发布局），卸载时注销（NF-04）。
 * 布局（FR-14 规则 1~6）：左上 HP/SP+金币/残片+关卡；右下技能栏 4 格+武器栏；顶中 Boss 血条。
 * 不遮挡中央 512×384（FR-14 边界）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { hudViewModel, type HudPerFrame } from '../../game/domain/player/hudViewModel';
import { skillService } from '../../game/domain/player/skillService';
import { onEvent, offEvent, type EventPayloads } from '../../game/events';
import { UI_TEXT } from '../i18n';
import { settingsStore } from '../../game/domain/player/settingsStore';
import { effectiveKeys } from '../../game/domain/player/keymap';
import { useDomainStore } from '../composables/useDomainStore';
import { ConfigRegistry } from '../../game/domain/shared/configRegistry';
import CombatIcon from './CombatIcon.vue';

const hpText = ref('100/100');
const spText = ref('50/50');
const coins = ref(0);
const shards = ref(0);
const skillPoints = ref(0);
const weapons = ref<HudPerFrame['weaponIcons'] | null>(null);
const settings = useDomainStore(() => settingsStore.getSnapshot(), onChange => {
    onEvent('settings:changed', onChange);
    return () => offEvent('settings:changed', onChange);
});
const weaponSlots = computed(() => (['main', 'sub'] as const).map(hand => ({
    hand, id: weapons.value?.[hand], name: weapons.value?.[hand === 'main' ? 'mainName' : 'subName'] || UI_TEXT.hud.emptyHand,
    ammo: weapons.value?.[hand === 'main' ? 'mainAmmo' : 'subAmmo'] ?? null,
    keys: effectiveKeys(hand === 'main' ? 'attackMain' : 'attackSub', settings.value.keymap).join('/'),
    mouse: hand === 'main' ? '左键' : '右键',
    equipped: weapons.value?.[hand] != null
})));
const lowAmmo = computed(() => weaponSlots.value.some(w => w.ammo !== null && w.ammo.count <= 5));
const emptyAmmo = computed(() => weaponSlots.value.some(w => w.ammo?.count === 0));
const interactKey = computed(() => effectiveKeys('interact', settings.value.keymap).join('/'));
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
const hudRoot = ref<HTMLElement | null>(null);

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
    // EX-06/FR-14：HUD 跟随自适应画布矩形，每帧重算锚点
    const canvas = document.querySelector('canvas');
    if (canvas !== null && hudRoot.value !== null) {
        const r = canvas.getBoundingClientRect();
        const el = hudRoot.value;
        el.style.left = `${r.left}px`;
        el.style.top = `${r.top}px`;
        el.style.width = `${r.width}px`;
        el.style.height = `${r.height}px`;
    }
    if (hpBar.value !== null) { hpBar.value.style.transform = `scaleX(${pf.hpRatio})`; }
    if (spBar.value !== null) { spBar.value.style.transform = `scaleX(${pf.spRatio})`; }
    lowHp.value = pf.lowHp;
    skillPoints.value = pf.skillPoints;
    weapons.value = pf.weaponIcons;
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
    <div ref="hudRoot" class="hud">
        <div class="topleft">
            <div class="bar hp" :class="{ low: lowHp }">
                <div ref="hpBar" class="fill"></div>
                <span class="txt">{{ UI_TEXT.hud.hp }} {{ hpText }}</span>
            </div>
            <div class="bar sp">
                <div ref="spBar" class="fill"></div>
                <span class="txt">{{ UI_TEXT.hud.sp }} SP {{ spText }}</span>
            </div>
            <div class="row">
                <span class="coin">◉ {{ UI_TEXT.hud.coins }} {{ coins }}</span>
                <span class="shard">◆ {{ UI_TEXT.hud.skillPoints }} SKP {{ skillPoints }} · Y</span>
            </div>
            <div class="row material">
                ◈ {{ UI_TEXT.hud.materials }} {{ shards }}
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
            <div v-if="lowAmmo" class="ammo-warning" role="status">
                <b>{{ emptyAmmo ? UI_TEXT.hud.ammoEmpty : UI_TEXT.hud.ammoLow }}</b>
                <span>{{ UI_TEXT.hud.resupply }} {{ interactKey }} {{ UI_TEXT.hud.shop }}</span>
            </div>
            <div class="weapons">
                <div v-for="w in weaponSlots" :key="w.hand" class="wslot" :class="w.hand">
                    <span class="weapon-key">{{ w.keys }} / {{ w.mouse }} · {{ w.hand === 'main' ? UI_TEXT.hud.main : UI_TEXT.hud.sub }}</span>
                    <b class="weapon-name"><CombatIcon :id="w.id" :label="w.name" :size="28" />{{ w.name }}</b>
                    <span v-if="w.ammo" class="ammo" :class="{ low: w.ammo.count <= 5 }">➶ {{ w.ammo.name }} {{ w.ammo.count }}</span>
                    <span v-else-if="w.equipped" class="muted">{{ UI_TEXT.hud.melee }}</span>
                </div>
            </div>
            <div class="skills">
                <div v-for="i in 4" :key="i" class="skill">
                    <span class="key">{{ i }}</span>
                    <CombatIcon :id="loadout[i - 1]" :label="ConfigRegistry.skills()[loadout[i - 1] ?? '']?.name ?? ''" :size="28" />
                    <span class="skill-name">{{ loadout[i - 1] ? ConfigRegistry.skills()[loadout[i - 1] ?? '']?.name : UI_TEXT.skillTree.empty }}</span>
                    <div :ref="(el) => { cdMasks[i - 1] = el as HTMLElement | null; }" class="cdmask"></div>
                    <span class="cd">{{ cooldownTexts[i - 1] }}</span>
                </div>
            </div>
            <span class="muted">Y：学习 / 绑定技能</span>
        </div>
    </div>
</template>

<style scoped>
.hud { position: absolute; pointer-events: none; color: var(--fg); overflow: hidden; }
.topleft { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 6px; }
.bar {
    position: relative; width: 180px; height: 18px;
    background: rgba(0, 0, 0, 0.55); border: 1px solid var(--border); border-radius: 3px;
    overflow: hidden;
}
.bar.sp { height: 18px; }
.bar.boss { width: 100%; height: 16px; box-sizing: border-box; }
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
    font-size: 14px; line-height: 1; color: #fff; text-shadow: 0 1px 2px #000;
}
.row { display: flex; flex-wrap: wrap; gap: 6px 14px; max-width: 330px; font-size: 15px; text-shadow: 0 1px 3px #000; }
.coin { color: var(--gold); }
.shard { color: #9fe8ff; }
.material { color: #c5a4ff; }
.muted { color: var(--muted); font-size: 14px; }
.bossbar {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    width: min(600px, calc(100% - 24px));
    display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.bossname { font-size: 14px; color: var(--error); text-shadow: 0 1px 2px #000; }
.bottomright { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.weapons { display: flex; gap: 6px; }
.wslot {
    min-width: 125px; padding: 7px 10px; display: flex; flex-direction: column; gap: 3px;
    background: rgba(12,20,32,0.9); border: 1px solid var(--border); border-radius: 4px; font-size: 14px;
}
.wslot.main { border-color: var(--gold); }
.wslot.sub { border-color: #8bcdf3; }
.weapon-key { color: var(--muted); }
.weapon-name { display: flex; align-items: center; gap: 6px; }
.ammo { color: #e4f6ff; }
.ammo.low, .ammo-warning { color: var(--warning); }
.ammo-warning { display: flex; flex-direction: column; gap: 3px; font-size: 14px; padding: 7px 10px; background: rgba(12,20,32,0.9); border-radius: 4px; }
.skills { display: flex; gap: 6px; }
.skill {
    position: relative; width: 78px; height: 72px;
    background: rgba(0,0,0,0.55); border: 1px solid var(--border); border-radius: 6px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
}
.key { position: absolute; top: 2px; left: 4px; font-size: 14px; color: var(--muted); }
.icon { font-size: 20px; color: var(--accent); }
.skill-name { font-size: 14px; color: var(--accent); }
.cdmask { position: absolute; inset: 0; border-radius: 6px; }
.cd { position: absolute; bottom: 2px; right: 4px; font-size: 14px; color: var(--warning); }
@media (max-width: 1040px) {
    .bossbar { top: 160px; }
}
</style>
