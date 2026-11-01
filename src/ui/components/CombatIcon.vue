<script setup lang="ts">
import { computed } from 'vue';
import { combatIconUrl } from '../presentation/combatIcons';

const props = withDefaults(defineProps<{ id: string | null | undefined; label: string; size?: number }>(), { size: 32 });
const source = computed(() => combatIconUrl(props.id));
</script>

<template>
    <img v-if="source" class="combat-icon" :src="source" :alt="label" :width="size" :height="size" draggable="false">
</template>

<style scoped>
.combat-icon { display: inline-block; flex-shrink: 0; object-fit: contain; vertical-align: middle; user-select: none; }
</style>
