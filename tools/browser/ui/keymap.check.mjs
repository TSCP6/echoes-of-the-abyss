/** 按键映射端到端回归；只运行独立无头 Chrome。 */
async function checkKeymap(sourcePage, { url = 'http://127.0.0.1:8086' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const p = await browser.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); } });
        const press = (key) => p.keyboard.press(key, { delay: 80 });
        const cases = [];
        const input = async (key) => {
            await p.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').scene.isActive());
            await p.keyboard.down(key);
            await p.waitForTimeout(100);
            const value = await p.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return { down: s.gateway.isDown('moveLeft'), vx: s.player.body.velocity.x,
                    active: s.scene.isActive(), overlay: s.overlayOpen, ui: window.__SEAPP_UI__.state,
                    bound: s.gateway.keys.get('moveLeft').map(k => ({ code: k.keyCode, down: k.isDown, enabled: k.enabled })) };
            });
            await p.keyboard.up(key);
            await p.waitForTimeout(150);
            return value;
        };
        await p.goto(url);
        await p.locator('.menu').waitFor();
        await p.getByRole('button', { name: '开始游戏', exact: true }).click();
        await p.getByRole('button', { name: '1-1', exact: true }).click();
        await p.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready);
        await press('Escape');
        await p.locator('.pause').getByRole('button', { name: '设置', exact: true }).click();
        const remap = async (key) => {
            p.once('dialog', (dialog) => dialog.accept(key));
            await p.locator('.settings').getByRole('button', { name: /^向左移动：/ }).click();
        };
        await remap('D');
        cases.push({ label: '默认右移键冲突被拒绝并显示反馈', passed: (await p.getByRole('status').innerText()).includes('占用') });
        await remap('notakey');
        cases.push({ label: '未知多字符键名被拒绝并显示反馈', passed: (await p.getByRole('status').innerText()).includes('不支持') });
        await remap(' q ');
        cases.push({ label: '键名规范化并显示新键位', passed: (await p.getByRole('button', { name: /^向左移动：/ }).innerText()).includes('Q') });
        await p.locator('.settings').getByRole('button', { name: '返回', exact: true }).click();
        await p.locator('.pause').getByRole('button', { name: '操作说明', exact: true }).click();
        cases.push({ label: '操作说明显示当前映射', passed: (await p.locator('.help tr').filter({ hasText: '水平移动' }).innerText()).includes('Q') });
        await p.locator('.help').getByRole('button', { name: '返回', exact: true }).click();
        await p.locator('.pause').getByRole('button', { name: '继续', exact: true }).click();
        const q = await input('q');
        const a = await input('a');
        cases.push({ label: '当前关卡立即使用Q，旧A不再左移', passed: q.down && q.vx < 0 && !a.down && a.vx === 0, q, a });
        await p.reload();
        await p.locator('.menu').waitFor();
        await p.getByRole('button', { name: '继续游戏', exact: true }).click();
        await p.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready);
        const restored = await input('q');
        cases.push({ label: '真实刷新与读档后Q仍生效', passed: restored.down && restored.vx < 0 });
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
