<script setup lang="ts">
/** UI-13 操作说明：完整按键表（SRS 3.1），FR-15/FR-18 边界（重映射裁剪时仍完整可见）。 */
import { UI_TEXT } from './i18n';
import { computed } from 'vue';
import { settingsStore } from '../game/domain/settingsStore';
import { onEvent, offEvent } from '../game/events';
import { effectiveKeys, type GameAction } from '../game/domain/keymap';
import { useDomainStore } from './useDomainStore';
import { ConfigRegistry } from '../game/domain/configRegistry';

const settings = useDomainStore(() => settingsStore.getSnapshot(), onChange => {
    onEvent('settings:changed', onChange);
    return () => offEvent('settings:changed', onChange);
});
const rows = computed(() => {
    const keys = (action: GameAction): string => effectiveKeys(action, settings.value.keymap).join(' / ');
    return [
        ['水平移动', `${keys('moveLeft')} / ${keys('moveRight')}`],
        ['跳跃', `${keys('jump')}（短按截断跳高）`],
        ['平台下跳', `${keys('moveDown')} + ${keys('jump')}（仅单向平台）`],
        ['主手攻击', `${keys('attackMain')} 或 鼠标左键`],
        ['副手攻击', `${keys('attackSub')} 或 鼠标右键`],
        ['技能 1~4', ['skill1', 'skill2', 'skill3', 'skill4'].map(a => keys(a as GameAction)).join(' / ')],
        ['交互', keys('interact')], ['背包', keys('inventory')],
        ['技能树', keys('skillTree')], ['暂停 / 菜单', keys('pause')], ['全屏', keys('fullscreen')]
    ];
});

const supplies = computed(() => ConfigRegistry.goods()
    .filter(g => g.refId === 'itm_arrow' || g.refId === 'itm_dart')
    .map(g => `${g.price} 金币 → ${g.count} ${ConfigRegistry.items()[g.refId]?.name ?? g.refId}`).join('；'));
const interactKey = computed(() => effectiveKeys('interact', settings.value.keymap).join('/'));

defineEmits<{ back: [] }>();
</script>

<template>
    <div class="help">
        <div class="panel">
            <h2>{{ UI_TEXT.help.title }}</h2>
            <div class="content">
                <section class="guide" aria-label="玩法与资源说明">
                    <h3>{{ UI_TEXT.help.flowTitle }}</h3>
                    <p>{{ UI_TEXT.help.flow }}</p>
                    <p class="resource coin"><span class="symbol">◉</span>{{ UI_TEXT.help.coin }}</p>
                    <p class="resource shard"><span class="symbol">◆</span>{{ UI_TEXT.help.shard }}</p>
                    <p class="resource material"><span class="symbol">◈</span>{{ UI_TEXT.help.material }}</p>
                    <p class="resource ranged"><span class="symbol">➶</span>{{ UI_TEXT.help.ranged }}</p>
                    <p>{{ UI_TEXT.help.ammo }}</p>
                    <p>{{ UI_TEXT.inventory.ammoRule }}</p>
                    <p class="supply">{{ UI_TEXT.help.supplies }}：{{ supplies }}<br>营地交互键：{{ interactKey }}</p>
                </section>
                <table>
                    <tbody>
                        <tr v-for="[action, keys] in rows" :key="action">
                            <td class="action">{{ action }}</td>
                            <td class="keys">{{ keys }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <button class="btn" autofocus @click="$emit('back')">{{ UI_TEXT.help.back }}</button>
        </div>
    </div>
</template>

<style scoped>
.help {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(26, 28, 44, 0.9);
}
.panel {
    background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px;
    padding: 24px 28px; color: var(--fg); text-align: center;
    box-sizing: border-box; width: min(1040px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow-y: auto;
}
h2 { margin: 0 0 16px; }
.content { display: grid; grid-template-columns: 1.25fr 1fr; gap: 24px; margin-bottom: 20px; text-align: left; }
.guide { font-size: 14px; line-height: 1.6; }
h3 { font-size: 16px; margin: 0 0 8px; }
.guide p { margin: 8px 0; }
.resource { padding-left: 28px; position: relative; }
.symbol { position: absolute; left: 0; top: 0; font-size: 20px; }
.coin .symbol { color: var(--gold); }
.shard .symbol { color: #9fe8ff; }
.material .symbol { color: #c5a4ff; }
.ranged .symbol { color: #e4f6ff; }
.supply { color: var(--warning); padding: 8px 12px; background: var(--surface); border-radius: 6px; }
table { margin: 0 auto; border-collapse: collapse; align-self: start; }
td { padding: 8px 10px; font-size: 15px; }
.action { color: var(--muted); text-align: right; }
.keys { font-family: Consolas, monospace; color: var(--accent); }
.btn {
    padding: 10px 32px; font-size: 16px; cursor: pointer;
    background: var(--surface); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 800px) {
    .content { grid-template-columns: 1fr; }
    .panel { padding: 20px; }
    td { padding: 5px 10px; }
}
</style>
