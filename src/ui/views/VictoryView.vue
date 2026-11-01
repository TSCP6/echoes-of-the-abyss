<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { campaignSummary, claimVictoryLoot } from '../../game/domain/progression/campaignVictory';
import { progressService } from '../../game/domain/progression/progressService';
import { ConfigRegistry } from '../../game/domain/shared/configRegistry';
import { saveSystem } from '../../game/domain/persistence/saveSystem';
import { audioDirector } from '../../game/systems/presentation/audioDirector';
import type { EventPayloads } from '../../game/events';
import { UI_TEXT } from '../i18n';
import VictoryWeapon from '../components/VictoryWeapon.vue';

const props = defineProps<{ data: EventPayloads['level:cleared'] | null; firstClear: boolean; introOnMount: boolean }>();
const emit = defineEmits<{ camp: []; levels: []; menu: []; inventory: [] }>();
const text = UI_TEXT.victory;
const view = campaignSummary();
const pending = ref(progressService.getVictoryLoot());
const intro = ref(true);
const primary = ref<HTMLButtonElement | null>(null);
const skip = ref<HTMLButtonElement | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
const regions = ['forest', 'cavern', 'temple'];
const bossArt = ['guardian', 'spider', 'echo'];
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/art/${path}`;
const duration = (seconds: number) => UI_TEXT.save.duration(seconds);

function finishIntro(): void {
    clearTimeout(timer);
    intro.value = false;
    void nextTick(() => primary.value?.focus());
}
function playIntro(durationMs = 3200): void {
    clearTimeout(timer);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finishIntro(); return; }
    intro.value = true;
    timer = setTimeout(finishIntro, durationMs);
    void nextTick(() => skip.value?.focus());
}
function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') { return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (intro.value) { finishIntro(); } else { primary.value?.focus(); }
}
function claim(): void {
    claimVictoryLoot(); pending.value = progressService.getVictoryLoot();
    saveSystem.markDirty(); saveSystem.queueWrite();
}
onMounted(() => {
    audioDirector.playBgm('menu');
    window.addEventListener('keydown', onKey, true);
    if (props.introOnMount) { playIntro(props.firstClear ? 3200 : 1100); } else { finishIntro(); }
});
onUnmounted(() => { clearTimeout(timer); window.removeEventListener('keydown', onKey, true); });
</script>

<template>
    <section class="victory" :class="{ 'is-intro': intro }" aria-labelledby="victory-title">
        <div class="victory-sheet">
            <header class="ending-art" :style="{ backgroundImage: `url(${asset('victory/dawn.svg')})` }">
                <span class="game-name">{{ text.game }}</span>
                <div class="daylight" aria-hidden="true"></div>
                <div class="hero" aria-hidden="true" :style="{ backgroundImage: `url(${asset('player_idle.png')})` }">
                    <VictoryWeapon v-if="view.activeWeaponId" class="held-weapon" :id="view.activeWeaponId" />
                </div>
                <div class="fireflies" aria-hidden="true"><i v-for="n in 12" :key="n" :style="{ '--n': n }"></i></div>
                <div class="ending-heading">
                    <p class="subtitle">{{ text.subtitle }}</p>
                    <h1 id="victory-title">{{ text.title }}</h1>
                    <p class="story">{{ text.story }}</p>
                </div>
                <button v-if="intro" ref="skip" class="skip" @click="finishIntro">{{ text.skip }} <kbd>Esc</kbd></button>
            </header>

            <main v-show="!intro" class="ending-content">
                <div class="journey-heading">
                    <div><h2>{{ text.journey }}</h2><p>{{ text.completed }}</p></div>
                    <div class="medallion" :class="{ complete: view.completeEcho }">
                        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2 29 11 39 9 37 20 46 24 37 29 39 39 28 37 24 46 19 37 9 39 11 28 2 24 11 19 9 9 20 11z"/><path class="inner" d="m24 12 9 12-9 12-9-12z"/></svg>
                        <span>{{ view.completeEcho ? text.completeEcho : text.badge }}<small v-if="view.completeEcho">{{ text.echoHint }}</small></span>
                    </div>
                </div>
                <div class="chapter-cards">
                    <article v-for="(chapter, index) in view.chapters" :key="chapter.id" class="chapter" :class="regions[index]"
                        :style="{ backgroundImage: `url(${asset(`regions/${regions[index]}_mid.png`)})`, '--order': index }">
                        <div class="chapter-copy">
                            <h3>{{ text.chapterNames[index] }}</h3>
                            <p>{{ text.chapterNotes[index] }}</p>
                            <div class="chapter-progress"><span>{{ text.levels }} {{ chapter.cleared }}/{{ chapter.total }}</span><span>{{ text.shards }} {{ chapter.shards }}/{{ chapter.totalShards }}</span></div>
                            <div class="boss-status">{{ text.bosses[index] }}<span v-if="chapter.bossDefeated"> ✓ {{ text.defeated }}</span></div>
                        </div>
                        <span class="boss-portrait" :class="bossArt[index]" aria-hidden="true"
                            :style="{ backgroundImage: `url(${asset(`enemies/${bossArt[index]}_idle.png`)})` }"></span>
                    </article>
                </div>
                <dl class="milestones">
                    <div><dt>{{ text.levels }}</dt><dd>{{ view.cleared }}<small> / {{ view.total }}</small></dd></div>
                    <div><dt>{{ text.shards }}</dt><dd>{{ view.shards }}<small> / {{ view.totalShards }}</small></dd></div>
                    <div><dt>{{ text.chests }}</dt><dd>{{ view.chests }}</dd></div>
                    <div class="duration"><dt>{{ text.time }}</dt><dd>{{ duration(view.playSec) }}</dd></div>
                </dl>
                <div class="record-bar"><span>{{ text.saveScope }}</span><button class="text-button" @click="playIntro()">{{ text.replay }}</button></div>
                <details class="adventure-records">
                    <summary>{{ text.details }}</summary>
                    <dl>
                        <div><dt>{{ text.kills }}</dt><dd>{{ view.kills }}</dd></div>
                        <div><dt>{{ text.deaths }}</dt><dd>{{ view.deaths }}</dd></div>
                        <div><dt>{{ text.coins }}</dt><dd>{{ view.coins }}</dd></div>
                        <div><dt>{{ text.best }}</dt><dd>{{ view.finalBestSec === null ? text.noBest : `${view.finalBestSec.toFixed(1)} s` }}</dd></div>
                        <div v-if="data"><dt>{{ text.finalTime }}</dt><dd>{{ data.timeSec.toFixed(1) }} s</dd></div>
                    </dl>
                    <p class="equipment">{{ text.equipment }}<span v-for="weapon in view.weapons" :key="weapon.hand">{{ weapon.hand === 'main' ? text.main : text.sub }}：{{ weapon.name ?? text.emptyHand }}<template v-if="weapon.id"> Lv.{{ weapon.level }}</template></span></p>
                </details>
                <aside v-if="pending.length" class="pending-loot" aria-live="polite">
                    <strong>{{ text.pending }}</strong><p>{{ text.pendingHint }}</p>
                    <span v-for="item in pending" :key="item.itemId">{{ ConfigRegistry.items()[item.itemId]?.name }} ×{{ item.count }}</span>
                    <button class="text-button" @click="emit('inventory')">{{ text.inventory }}</button>
                    <button class="text-button" @click="claim">{{ text.claim }}</button>
                </aside>
                <footer>
                    <p>{{ text.thanks }}</p>
                    <nav aria-label="通关后导航">
                        <button ref="primary" class="primary" @click="emit('camp')">{{ text.camp }}</button>
                        <button @click="emit('levels')">{{ text.revisit }}</button>
                        <button @click="emit('menu')">{{ text.menu }}</button>
                    </nav>
                </footer>
            </main>
        </div>
    </section>
</template>

<style scoped>
.victory { --dawn: #edc791; position: absolute; inset: 0; background: #181e30; color: var(--fg); overflow: auto; }
.victory-sheet { width: min(1120px, 100%); margin: auto; background: #1d2537; min-height: 100%; }
.ending-art { height: 290px; position: relative; isolation: isolate; background-size: cover; background-position: 64% 55%; overflow: hidden; }
.ending-art::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, #161f32cc, transparent 80%), linear-gradient(0deg, #1d2537, transparent 24%); }
.game-name { position: absolute; left: 36px; top: 22px; font-size: 15px; letter-spacing: 5px; color: #e7c99e; }
.ending-heading { position: absolute; left: 36px; top: 77px; width: 43%; }
.subtitle { color: var(--dawn); font-size: 15px; margin: 0 0 6px; letter-spacing: 3px; }
h1 { font-family: 'STSong', 'SimSun', serif; font-size: clamp(40px, 5vw, 62px); letter-spacing: 12px; font-weight: 700; color: #fff0cc; margin: 0 0 12px; text-shadow: 0 3px 0 #47394b; }
.story { max-width: 390px; font-size: 15px; line-height: 1.9; color: #e4d9d4; margin: 0; }
.hero { position: absolute; left: 62%; bottom: 71px; width: 128px; height: 128px; background-size: 1408px 128px; image-rendering: pixelated; }
.held-weapon { position: absolute; width: 48px; height: 48px; left: 73px; top: 75px; transform: rotate(27deg); }
.daylight { position: absolute; inset: 0; z-index: -1; background: #edb788; opacity: .08; mix-blend-mode: screen; }
.fireflies i { position: absolute; width: 3px; height: 3px; background: #ffe8b6; left: calc(48% + var(--n) * 3.8%); bottom: calc(35px + mod(var(--n) * 31px, 155px)); opacity: .5; animation: drift 7s calc(var(--n) * -.7s) linear infinite; }
.ending-content { padding: 0 36px 24px; }
.journey-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
h2 { font-size: 21px; margin: 0 0 5px; font-weight: 500; letter-spacing: 3px; }
.journey-heading p { color: var(--muted); font-size: 14px; margin: 0; }
.medallion { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--dawn); }
.medallion svg { width: 42px; height: 42px; fill: #615b52; }
.medallion .inner { fill: #e7c28d; }
.medallion.complete svg { fill: #b89a62; filter: drop-shadow(0 0 6px #e9c79255); }
.medallion small { display: block; margin-top: 4px; font-size: 13px; color: var(--muted); }
.chapter-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.chapter { --region: #8eaa83; position: relative; overflow: hidden; padding: 17px 16px 13px; border: 1px solid #70857a; border-top: 3px solid var(--region); background-size: cover; background-position: center 60%; isolation: isolate; }
.chapter::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #142b2ef5, #142b2e91); z-index: -1; }
.chapter.cavern { --region: #8dc8cd; border-color: #547583; }
.chapter.cavern::before { background: linear-gradient(90deg, #172c40f5, #172c40a6); }
.chapter.temple { --region: #d6b8ef; border-color: #81718e; }
.chapter.temple::before { background: linear-gradient(90deg, #302843f5, #302843b0); }
.chapter-copy { position: relative; z-index: 1; }
h3 { font-size: 18px; letter-spacing: 2px; color: #f4e8d4; margin: 0 0 5px; }
.chapter p { margin: 0 0 18px; font-size: 13px; color: #cbd6d7; }
.chapter-progress { display: flex; gap: 12px; font-size: 13px; color: #ebedef; }
.boss-status { border-top: 1px solid #ffffff26; padding-top: 9px; margin-top: 11px; font-size: 13px; color: #e5e8e8; }
.boss-status span { color: var(--region); margin-left: 5px; }
.boss-portrait { position: absolute; width: 80px; height: 80px; right: 3px; top: 9px; background-size: 320px 80px; image-rendering: pixelated; opacity: .8; }
.milestones { display: grid; grid-template-columns: 1fr 1fr 1fr 1.6fr; margin: 21px 0 0; border-bottom: 1px solid #c6bfa426; padding-bottom: 15px; }
.milestones > div { padding-left: 23px; border-left: 1px solid #c6bfa426; }
.milestones > div:first-child { padding-left: 0; border: 0; }
dt { color: var(--muted); font-size: 14px; }
dd { margin: 7px 0 0; color: #f1dfbc; font-size: 27px; font-variant-numeric: tabular-nums; }
dd small { font-size: 16px; color: #aab1be; }
.duration dd { font-size: 18px; margin-top: 13px; }
.record-bar { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; color: var(--muted); font-size: 13px; }
button { cursor: pointer; font: inherit; color: #ecdfc5; background: transparent; border: 1px solid #817966; padding: 11px 22px; min-height: 44px; }
button:hover { background: #e4c79414; border-color: var(--dawn); }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--dawn); outline-offset: 4px; }
.text-button { padding: 5px 0; min-height: 32px; border: 0; text-decoration: underline; text-underline-offset: 5px; font-size: 14px; }
.adventure-records { font-size: 14px; margin-top: 2px; color: #c4c9d4; }
summary { cursor: pointer; width: fit-content; padding: 8px 0; }
.adventure-records dl { display: flex; flex-wrap: wrap; gap: 16px 32px; padding: 16px; background: #151c2a; margin: 8px 0; }
.adventure-records dd { font-size: 18px; }
.equipment { display: flex; gap: 16px; flex-wrap: wrap; margin: 14px 0; }
.equipment span { color: #eadabd; }
footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 13px; border-top: 1px solid #c6bfa426; padding-top: 20px; }
footer p { color: var(--muted); font-size: 14px; line-height: 1.7; max-width: 230px; margin: 0; }
nav { display: flex; gap: 10px; flex-shrink: 0; }
.primary { color: #2d2a30; background: #e5c18c; border-color: #e5c18c; min-width: 150px; font-weight: 700; }
.primary:hover { background: #f5d9aa; }
.skip { position: absolute; right: 28px; bottom: 25px; z-index: 3; font-size: 14px; background: #1d2537b3; }
kbd { margin-left: 9px; color: var(--muted); }
.pending-loot { padding: 14px; margin-top: 10px; background: #363044; border-left: 2px solid var(--dawn); font-size: 14px; }
.pending-loot p { color: var(--muted); line-height: 1.6; margin: 8px 0; }
.pending-loot > span, .pending-loot button { margin-right: 16px; }
.is-intro .ending-art { height: max(100vh, 520px); background-position: 64% center; background-size: auto 100%; animation: dawn 3.2s ease-out both; }
.is-intro .ending-heading { top: 33%; left: 8%; width: 42%; }
.is-intro .hero { bottom: 28%; left: 63%; }
.is-intro .daylight { animation: sunrise 3.2s ease-out both; }
@keyframes drift { from { transform: translateY(30px); opacity: 0; } 20% { opacity: .7; } to { transform: translateY(-60px); opacity: 0; } }
@keyframes dawn { from { filter: brightness(.3) saturate(.6); } to { filter: brightness(1); } }
@keyframes sunrise { from { opacity: 0; } to { opacity: .13; } }
@media (min-width: 1500px) { .victory { display: flex; } .victory-sheet { min-height: 0; box-shadow: 0 0 100px #0005; } .ending-art { height: 330px; } }
@media (min-width: 801px) and (max-height: 800px) { .ending-art { height: 230px; } .hero { bottom: 37px; } .ending-heading { top: 61px; } .game-name { top: 15px; } }
@media (max-width: 800px) {
    .ending-content { padding: 0 22px 24px; } .ending-heading { left: 22px; width: 49%; }
    h1 { letter-spacing: 5px; } .chapter-cards { gap: 8px; } .chapter { padding: 13px 10px; }
    .boss-portrait { opacity: .35; right: -10px; } .chapter-progress { flex-direction: column; gap: 5px; }
    footer { flex-direction: column; } footer p { max-width: none; } .milestones > div { padding-left: 13px; }
}
@media (max-width: 560px) {
    .ending-art { height: 310px; background-position: 55% 50%; } .ending-heading { top: 65px; width: 65%; }
    .story { font-size: 14px; } .hero { left: 65%; bottom: 36px; } .game-name { left: 22px; }
    .chapter-cards { grid-template-columns: 1fr; } .chapter { padding: 15px 18px; }
    .chapter-progress { flex-direction: row; } .chapter p { margin-bottom: 12px; } .boss-portrait { right: 12px; opacity: .8; }
    .journey-heading { align-items: flex-start; } .medallion > span { max-width: 95px; line-height: 1.6; }
    .milestones { grid-template-columns: 1fr 1fr; gap: 20px; } .milestones > div:nth-child(3) { padding: 0; border: 0; }
    .duration dd { font-size: 16px; } nav { width: 100%; display: grid; grid-template-columns: 1fr 1fr; } nav .primary { grid-column: 1 / -1; }
    .is-intro .ending-heading { left: 7%; width: 80%; top: 27%; } .is-intro .hero { left: 57%; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>
