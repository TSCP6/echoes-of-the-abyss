<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { EventBus } from './game/EventBus';
import StartGame from './game/main';
import Phaser from 'phaser';

// Save the current scene instance
const scene = ref();
const game = ref();

const emit = defineEmits(['current-active-scene']);

onMounted(() => {

    game.value = StartGame('game-container');
    // 开发期可观测接缝（13.2 测试接缝；生产构建被 tree-shake，NFR-09 不受影响）
    if (import.meta.env.DEV) {
        interface DevWindow { __SEAPP__?: { game: unknown } }
        const devWin = window as DevWindow; // 仅 DEV 分支的调试钩子，运行时形状由本行赋值保证
        devWin.__SEAPP__ = { game: game.value };
    }
    // DEV：领域层探针（冒烟/AT 验证接缝；生产 tree-shake）
    if (import.meta.env.DEV) {
        void import('./game/domain/devProbe').then((mod) => mod.installDevProbe());
    }
    
    EventBus.on('current-scene-ready', (scene_instance: Phaser.Scene) => {
        
        emit('current-active-scene', scene_instance);
    
        scene.value = scene_instance;
    
    });

});

onUnmounted(() => {

    if (game.value)
    {
        game.value.destroy(true);
        game.value = null;
    }

});

defineExpose({ scene, game });

</script>

<template>
    <div id="game-container"></div>
</template>