<script setup lang="ts">
/** UI-08 技能树（MOD-32）：三分支节点三态 + SKP 余额 + 剩余可获点数（AT-26）+ 解锁/装备。 */
import { computed } from 'vue';
import { skillService } from '../game/domain/skillService';
import { ConfigRegistry } from '../game/domain/configRegistry';
import { useDomainStore } from './useDomainStore';
import { onEvent, offEvent } from '../game/events';

const emit = defineEmits<{ close: [] }>();

const tree = useDomainStore(
    () => skillService.getTreeSnapshot(),
    (onChange) => {
        onEvent('skill:unlocked', onChange);
        return () => offEvent('skill:unlocked', onChange);
    }
);

const branches = computed(() => (['blade', 'bolt', 'ruin'] as const).map((b) => ({
    branch: b,
    label: b === 'blade' ? '刃影' : b === 'bolt' ? '弩矢' : '遗迹',
    nodes: Object.values(ConfigRegistry.skills()).filter((d) => d.branch === b)
})));

function stateOf(id: string): string {
    return tree.value.nodes.find((n) => n.id === id)?.state ?? 'locked';
}

function unlock(id: string): void {
    skillService.unlock(id); // 失败码经树状态呈现（前置锁/余额不足 → 节点保持 locked/available）
}

function equip(id: string): void {
    const free = tree.value.loadout.indexOf(null);
    skillService.equip(id, (free >= 0 ? free : 0) as 0 | 1 | 2 | 3);
}
</script>

<template>
    <div class="tree">
        <div class="panel">
            <h2>技能树 <span class="skp">SKP {{ tree.skpBalance }} ｜ 剩余可获 {{ tree.skpObtainableLeft }}</span></h2>
            <div class="cols">
                <div v-for="br in branches" :key="br.branch" class="col">
                    <h3>{{ br.label }}</h3>
                    <button v-for="n in br.nodes" :key="n.id" class="node"
                        :class="stateOf(n.id)"
                        :title="`${n.id}（${n.skpCost} SKP）${n.kind === 'active' ? ' 主动' : ' 被动'}`"
                        @click="stateOf(n.id) === 'unlocked' ? equip(n.id) : unlock(n.id)">
                        <span class="nid">{{ n.id.replace('sk_', '') }}</span>
                        <span class="cost">{{ n.skpCost }}</span>
                    </button>
                </div>
            </div>
            <p class="hint">点击解锁（需 SKP 与前置）；已解锁主动技能点击入栏（替换不退 SKP）</p>
            <button class="btn close" @click="emit('close')">关闭（Y）</button>
        </div>
    </div>
</template>

<style scoped>
.tree { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(26,28,44,0.9); }
.panel { background: var(--surface-2); border: 2px solid var(--border); border-radius: 10px; padding: 20px 32px; color: var(--fg); text-align: center; }
h2 { margin: 0 0 14px; font-size: 22px; }
.skp { color: var(--accent); font-size: 15px; margin-left: 10px; }
.cols { display: flex; gap: 24px; justify-content: center; }
.col { display: flex; flex-direction: column; gap: 6px; }
h3 { margin: 0 0 4px; font-size: 16px; color: var(--muted); }
.node {
    display: flex; justify-content: space-between; align-items: center;
    width: 150px; padding: 7px 10px; font-size: 14px; cursor: pointer;
    background: var(--surface); color: var(--fg);
    border: 2px solid var(--border); border-radius: 6px;
}
.node.available { border-color: var(--accent); }
.node.unlocked { border-color: var(--gold); background: #2c2f45; }
.node.locked { opacity: 0.45; cursor: not-allowed; }
.node:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cost { color: var(--accent); }
.hint { color: var(--muted); font-size: 14px; margin: 12px 0 8px; }
.btn { padding: 8px 28px; font-size: 14px; cursor: pointer; background: var(--surface); color: var(--fg); border: 2px solid var(--border); border-radius: 6px; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
