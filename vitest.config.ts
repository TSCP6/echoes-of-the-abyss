import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// 测试边界 = 领域层 + 适配器（TT-01~05，设计文档 13 章）。
// environment: node —— 领域层引擎无关（ARCH-7），无需 DOM；适配器测试各自 mock。
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/game/domain/**', 'src/game/adapters/**'],
            reporter: ['text', 'html']
        }
    }
});
