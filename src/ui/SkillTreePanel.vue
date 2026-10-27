<script setup lang="ts">
import { computed, ref } from 'vue';
import { skillService } from '../game/domain/skillService';
import { ConfigRegistry } from '../game/domain/configRegistry';
import { useDomainStore } from './useDomainStore';
import { onEvent, offEvent } from '../game/events';
import { describeSkill } from './skillPresentation';
import { UI_TEXT } from './i18n';

const emit = defineEmits<{ close: [] }>();
let refresh = (): void => {};
const tree = useDomainStore(() => skillService.getTreeSnapshot(), onChange => {
    refresh = onChange;
    onEvent('skill:unlocked', onChange);
    return () => offEvent('skill:unlocked', onChange);
});
const defs = ConfigRegistry.skills();
const selectedId = ref('sk_dash');
const selectedSlot = ref<0 | 1 | 2 | 3>(0);
const feedback = ref('');
const selected = computed(() => defs[selectedId.value]);
const branches = computed(() => (['blade', 'bolt', 'ruin'] as const).map(branch => ({
    branch, label: UI_TEXT.skillTree.branches[branch], nodes: Object.values(defs).filter(d => d.branch === branch)
})));
const stateOf = (id: string) => tree.value.nodes.find(n => n.id === id)?.state ?? 'locked';
const canLearn = computed(() => stateOf(selectedId.value) === 'available' && tree.value.skpBalance >= selected.value.skpCost);
const requirement = computed(() => {
    const d = selected.value;
    if (stateOf(d.id) === 'unlocked') { return d.kind === 'passive' ? UI_TEXT.skillTree.passiveReady : UI_TEXT.skillTree.activeReady; }
    if (stateOf(d.id) === 'locked') { return '需先学习「' + (defs[d.prerequisiteId ?? '']?.name ?? '') + '」'; }
    return tree.value.skpBalance < d.skpCost ? '还需 ' + (d.skpCost - tree.value.skpBalance) + ' 技能点' : UI_TEXT.skillTree.canLearn;
});
function learn(): void {
    const d = selected.value;
    if (!skillService.unlock(d.id).ok) { return; }
    const free = skillService.getLoadout().indexOf(null);
    if (d.kind === 'active' && free >= 0) {
        skillService.equip(d.id, free as 0 | 1 | 2 | 3);
        feedback.value = '已学习「' + d.name + '」并绑定到 ' + (free + 1) + ' 键';
    } else { feedback.value = d.kind === 'passive' ? '「' + d.name + '」已生效' : UI_TEXT.skillTree.full; }
    refresh();
}
function equip(): void {
    const d = selected.value;
    if (skillService.equip(d.id, selectedSlot.value).ok) {
        feedback.value = '「' + d.name + '」已绑定到 ' + (selectedSlot.value + 1) + ' 键'; refresh();
    }
}
function unequip(): void {
    skillService.unequip(selectedSlot.value); feedback.value = '已清空 ' + (selectedSlot.value + 1) + ' 键'; refresh();
}
</script>

<template>
    <div class="tree"><div class="panel">
        <h2>{{ UI_TEXT.skillTree.title }} <span class="skp">技能点 SKP {{ tree.skpBalance }} ｜ 剩余可获 {{ tree.skpObtainableLeft }}</span></h2>
        <p class="hint">{{ UI_TEXT.skillTree.intro }}</p>
        <div class="loadout" aria-label="技能快捷栏">
            <button v-for="(id, i) in tree.loadout" :key="i" class="slot" :class="{ selected: selectedSlot === i }"
                :aria-pressed="selectedSlot === i" @click="selectedSlot = i as 0 | 1 | 2 | 3">
                <b>{{ i + 1 }}</b> {{ id ? defs[id]?.name : UI_TEXT.skillTree.empty }}
            </button>
        </div>
        <div class="cols">
            <section v-for="br in branches" :key="br.branch" class="col">
                <h3>{{ br.label }}</h3>
                <button v-for="n in br.nodes" :key="n.id" class="node" :class="[stateOf(n.id), { selected: selectedId === n.id }]"
                    :data-skill="n.id" :title="n.name + '：' + describeSkill(n)" aria-describedby="skill-details"
                    @mouseenter="selectedId = n.id" @focus="selectedId = n.id" @click="selectedId = n.id">
                    <b>{{ n.name }}</b><span>{{ n.kind === 'active' ? '主动' : '被动' }} · {{ n.skpCost }} 点</span>
                </button>
            </section>
        </div>
        <section id="skill-details" class="details" aria-label="技能介绍">
            <h3>{{ selected.name }} · {{ selected.kind === 'active' ? '主动技能' : '被动技能' }}</h3>
            <p>{{ describeSkill(selected) }}</p><p class="requirement">{{ requirement }}</p>
            <div class="actions">
                <button class="btn" :disabled="!canLearn" @click="learn">学习 {{ selected.skpCost }} 技能点</button>
                <button v-if="selected.kind === 'active'" class="btn" :disabled="stateOf(selected.id) !== 'unlocked'" @click="equip">绑定到 {{ selectedSlot + 1 }} 键</button>
                <button class="btn" :disabled="tree.loadout[selectedSlot] === null" @click="unequip">清空 {{ selectedSlot + 1 }} 键</button>
            </div>
        </section>
        <footer class="footer">
            <p class="feedback" role="status">{{ feedback }}</p>
            <button class="btn" @click="emit('close')">关闭（Y）</button>
        </footer>
    </div></div>
</template>

<style scoped>
.tree { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(26,28,44,.9); }
.panel { box-sizing: border-box; width: min(840px, calc(100% - 32px)); max-height: calc(100% - 24px); overflow-y: auto; background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px; padding: 20px 28px; color: var(--fg); text-align: center; }
h2 { margin: 0 0 10px; font-size: 22px; }
.skp { color: var(--accent); font-size: 15px; }
.hint { color: var(--muted); font-size: 14px; line-height: 1.5; }
.loadout { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
.slot, .node, .btn { background: var(--surface); color: var(--fg); border: 2px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 14px; padding: 8px; }
.slot b { color: var(--accent); margin-right: 6px; }
.cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.col { display: flex; flex-direction: column; gap: 6px; }
h3 { margin: 0 0 6px; font-size: 16px; }
.node { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; text-align: left; }
.node span { color: var(--muted); }
.node.available { border-color: var(--accent); }
.node.unlocked { border-color: var(--gold); }
.node.locked { background: #1a1c2c; }
.selected { outline: 2px solid #9fe8ff; outline-offset: 1px; }
.details { margin-top: 16px; padding: 12px; background: var(--surface); border-radius: 6px; text-align: left; font-size: 14px; line-height: 1.5; }
.details p { margin: 6px 0; }
.requirement { color: var(--warning); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { padding: 8px 16px; }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.feedback { min-height: 21px; color: var(--gold); font-size: 14px; margin: 8px 0; }
.footer { position: sticky; bottom: -20px; background: var(--surface-2); padding: 2px 0 10px; }
@media (max-width: 700px) { .panel { padding: 16px; } .cols { gap: 8px; } .loadout { grid-template-columns: repeat(2, 1fr); } }
</style>
