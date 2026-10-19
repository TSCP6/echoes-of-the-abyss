<script setup lang="ts">
/**
 * App.vue（4.5 组件树根）：保留模板既有的 PhaserGame 集成（唯一 Vue→Phaser 依赖例外），
 * 移除示例 UI；挂载 UiLayer（DOM UI 根，覆盖画布）。
 */
import PhaserGame from './PhaserGame.vue';
import UiLayer from './ui/UiLayer.vue';
import './ui/tokens.css';
</script>

<template>
    <PhaserGame />
    <UiLayer />
</template>
