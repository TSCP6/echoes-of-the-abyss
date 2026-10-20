import App from './App.vue';
import { createApp } from 'vue';
import { appLifecycle } from './game/adapters/appLifecycle';

// EXD-4：Vue 组件树异常统一经 AppLifecycle 兜底（console + 横幅 + 回主菜单）
const app = createApp(App);
app.config.errorHandler = (err) => { appLifecycle.reportError(err); };
app.mount('#app');
