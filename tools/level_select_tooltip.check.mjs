/** 独立挂载真实选关页，隔离游戏存档检查悬停提示与选关。 */
export async function checkLevelSelectTooltip(chromium, url = 'http://127.0.0.1:8123') {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const cases = [], errors = [];
    try {
        const p = await browser.newPage({ viewport: { width: 1024, height: 768 } });
        p.on('pageerror', e => errors.push(e.message));
        const source = await (await fetch(url + '/src/ui/LevelSelectView.vue')).text();
        const vuePath = source.match(/from ["']([^"']*\/vue\.js[^"']*)/)[1];
        await p.route('**/__level_select_check.html', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="app"></div><script type="module">
            import {createApp} from '${vuePath}';
            import View from '/src/ui/LevelSelectView.vue';
            import {validateAll,markValidated} from '/src/game/domain/configRegistry.ts';
            import {progressService} from '/src/game/domain/progressService.ts';
            import '/src/ui/tokens.css';
            if(!validateAll().ok)throw new Error('配置无效');markValidated();
            progressService.reset();progressService.completeLevel('1-1');
            createApp(View,{onEnter:id=>window.entered=id}).mount('#app');</script>` }));
        await p.goto(url + '/__level_select_check.html'); await p.waitForSelector('.node');
        const add = (name, passed) => cases.push({ name, passed });
        add('通用重玩说明默认隐藏', !await p.locator('#replay-rules').isVisible());
        await p.locator('.rules-trigger').hover();
        add('悬停规则入口显示通用说明', await p.locator('#replay-rules').isVisible());
        await p.locator('h2').hover();
        const first = p.getByRole('button', { name: '1-1', exact: true });
        const info = first.locator('.replay-details');
        add('默认隐藏三行关卡信息', !await info.isVisible());
        await first.hover();
        add('悬停显示对应关卡的三行说明', await info.isVisible() && await info.locator(':scope > span').count() === 3);
        await p.locator('h2').hover();
        add('离开按钮后提示隐藏', !await info.isVisible());
        await first.focus();
        add('键盘聚焦也可查看提示', await info.isVisible());
        for (const width of [1024, 720, 390]) {
            await p.setViewportSize({ width, height: 768 }); await first.hover();
            const fits = await info.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; });
            add(`${width}px 窗口提示不越界`, fits);
        }
        await p.setViewportSize({ width: 1024, height: 768 }); await first.hover();
        await p.screenshot({ path: 'output/level-select-tooltip.png' });
        await first.click(); add('点击仍发出正确选关命令', await p.evaluate(() => window.entered === '1-1'));
        add('锁定关卡仍不可进入', await p.locator('.node.locked').first().isDisabled());
        add('无浏览器脚本异常', errors.length === 0);
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
    } finally { await browser.close(); }
}
