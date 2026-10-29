/** 独立挂载真实选关页，隔离游戏存档检查悬停提示与选关。 */
export async function checkLevelSelectTooltip(chromium, url = 'http://127.0.0.1:8123') {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const cases = [], errors = [];
    try {
        const p = await browser.newPage({ viewport: { width: 1024, height: 768 } });
        p.setDefaultTimeout(10000);
        p.on('pageerror', e => errors.push(e.message));
        const source = await (await fetch(url + '/src/ui/LevelSelectView.vue')).text();
        const vuePath = source.match(/from ["']([^"']*\/vue\.js[^"']*)/)[1];
        await p.route('**/__level_select_check.html', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="app" class="ui-layer"></div><script type="module">
            import {createApp} from '${vuePath}';
            import View from '/src/ui/LevelSelectView.vue';
            import UiLayer from '/src/ui/UiLayer.vue';
            import {validateAll,markValidated} from '/src/game/domain/configRegistry.ts';
            import {progressService} from '/src/game/domain/progressService.ts';
            import '/src/ui/tokens.css';
            document.querySelector('#app').setAttribute(UiLayer.__scopeId,'');
            if(!validateAll().ok)throw new Error('配置无效');markValidated();
            progressService.reset();progressService.completeLevel('1-1');
            createApp(View,{onEnter:id=>window.entered=id,onCamp:id=>window.camp=id,onBack:()=>window.back=true}).mount('#app');</script>` }));
        await p.goto(url + '/__level_select_check.html'); await p.waitForSelector('.node');
        const add = (name, passed) => cases.push({ name, passed });
        add('十二关均保留可见编号，锁定节点不再只显示大锁', await p.locator('.node .id').allTextContents().then(ids => ids.length === 12 && ids.every(id => /^[1-3]-[1-4]$/.test(id))));
        add('三个 Boss 关有独立小标记', await p.locator('.node.boss .boss-symbol').count() === 3);
        add('已通关节点保留完成徽记', await p.locator('.node.cleared .mark').count() === 1);
        add('通用重玩说明默认隐藏', !await p.locator('#replay-rules').isVisible());
        await p.locator('.rules-trigger').hover();
        add('悬停规则入口显示通用说明', await p.locator('#replay-rules').isVisible());
        await p.locator('h2').hover();
        const first = p.locator('.node').first();
        add('关卡节点保留准确的无障碍名称', await first.getAttribute('aria-label') === '1-1');
        const info = first.locator('.replay-details');
        add('默认隐藏三行关卡信息', !await info.isVisible());
        await first.hover();
        add('悬停显示对应关卡的三行说明', await info.isVisible() && await info.locator(':scope > span').count() === 3);
        await p.locator('h2').hover();
        add('离开按钮后提示隐藏', !await info.isVisible());
        await first.focus();
        add('键盘聚焦也可查看提示', await info.isVisible());
        for (const width of [1280, 1024, 720, 390, 320]) {
            await p.setViewportSize({ width, height: 768 }); await first.hover();
            const fits = await info.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; });
            add(`${width}px 窗口提示不越界`, fits);
            const compact = await p.locator('.node').evaluateAll(nodes => nodes.every(el => { const r = el.getBoundingClientRect(); return r.width >= 44 && r.width <= 64.1 && r.height === 48; }));
            add(`${width}px 窗口保持小节点与至少44px点击区域`, compact);
            add(`${width}px 窗口路线保持四节点同排且无横向溢出`, await p.locator('.nodes').evaluateAll(rows => rows.every(row => {
                const nodes = [...row.querySelectorAll('.node')].map(el => el.getBoundingClientRect());
                return nodes.every(r => r.top === nodes[0].top && r.left >= 0 && r.right <= innerWidth);
            })));
        }
        await p.setViewportSize({ width: 390, height: 768 }); await p.locator('h2').click();
        await p.screenshot({ path: 'output/level-select-compact-mobile.png' });
        await p.setViewportSize({ width: 1280, height: 900 }); await p.locator('h2').click();
        await p.screenshot({ path: 'output/level-select-compact-desktop.png' });
        await p.setViewportSize({ width: 1024, height: 768 }); await first.hover();
        await p.screenshot({ path: 'output/level-select-tooltip.png' });
        await first.click(); add('点击仍发出正确选关命令', await p.evaluate(() => window.entered === '1-1'));
        add('锁定关卡仍不可进入', await p.locator('.node.locked').first().isDisabled());
        await p.getByRole('button', { name: '营地', exact: true }).click();
        add('营地入口保持正确章节命令', await p.evaluate(() => window.camp === 1));
        await p.getByRole('button', { name: '返回主菜单', exact: true }).click();
        add('返回入口保持原有命令', await p.evaluate(() => window.back === true));
        add('无浏览器脚本异常', errors.length === 0);
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
    } finally { await browser.close(); }
}
