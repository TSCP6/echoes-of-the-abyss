/** 通过 Playwright MCP browser_run_code_unsafe(filename) 运行；只启动独立无头 Chrome。 */
async function checkOverlayPause(sourcePage, { url = 'http://127.0.0.1:8086' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error' || message.text().includes('Cannot pause non-running Scene')) {
                errors.push(message.text());
            }
        });
        const frames = (count = 4) => page.evaluate((n) => new Promise((resolve) => {
            const tick = () => { if (--n <= 0) { resolve(); } else { requestAnimationFrame(tick); } };
            requestAnimationFrame(tick);
        }), count);
        const state = (value) => page.waitForFunction((s) => window.__SEAPP_UI__.state === s, value, { timeout: 3000 });
        const press = (key) => page.keyboard.press(key, { delay: 80 });
        const world = () => page.evaluate(() => {
            const level = window.__SEAPP__.game.scene.getScene('Level');
            return {
                elapsed: level.elapsedSec,
                player: [level.player.sprite.x, level.player.sprite.y],
                enemies: level.enemies.getEntities().map((e) => [e.sprite.x, e.sprite.y]),
                projectiles: level.projectiles.getActive().length
            };
        });
        const cases = [];
        const frozen = async (label, expectedState) => {
            await state(expectedState);
            await frames(); // Phaser 在下一次主循环处理 pause/resume 请求。
            const before = await world();
            await page.keyboard.down('d');
            await press('j');
            await press('k');
            await frames(12);
            await page.keyboard.up('d');
            const after = await world();
            const paused = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').scene.isPaused());
            const passed = paused && JSON.stringify(before) === JSON.stringify(after);
            cases.push({ label, passed, paused, ...(passed ? {} : { before, after }) });
        };
        try {
            await page.goto(url);
            await page.locator('.menu').waitFor();
            for (const [button, panel, exit] of [['设置', '.settings', 'button'], ['设置', '.settings', 'escape'], ['操作说明', '.help', 'button']]) {
                await page.locator('.menu').getByRole('button', { name: button, exact: true }).click();
                await page.locator(panel).waitFor();
                if (exit === 'button') { await page.locator(panel).getByRole('button', { name: '返回', exact: true }).click(); }
                else { await press('Escape'); }
                await state('mainMenu');
                cases.push({ label: `主菜单→${button}→${exit}`, passed: await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Menu').scene.isActive()) });
            }
            await page.getByRole('button', { name: '开始游戏', exact: true }).click();
            await page.getByRole('button', { name: '1-1', exact: true }).click();
            await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready);
            for (const [button, panel, ui, exit] of [
                ['设置', '.settings', 'settings', 'button'], ['设置', '.settings', 'settings', 'escape'],
                ['操作说明', '.help', 'help', 'button'], ['操作说明', '.help', 'help', 'escape']
            ]) {
                await press('Escape');
                await frozen(`打开暂停（${button}/${exit}）`, 'paused');
                await page.locator('.pause').getByRole('button', { name: button, exact: true }).click();
                await frozen(`暂停→${button}`, ui);
                if (exit === 'button') { await page.locator(panel).getByRole('button', { name: '返回', exact: true }).click(); }
                else { await press('Escape'); }
                await frozen(`${button}→暂停（${exit}）`, 'paused');
                if (exit === 'button') { await page.locator('.pause').getByRole('button', { name: '继续', exact: true }).click(); }
                else { await press('Escape'); }
                await state('none');
                await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').scene.isActive());
                const before = await world();
                await page.keyboard.down('d');
                await frames(12);
                await page.keyboard.up('d');
                const after = await world();
                cases.push({ label: `关闭最后一层恢复游戏（${button}/${exit}）`, passed: after.elapsed > before.elapsed && after.player[0] > before.player[0] });
            }
            for (const [key, ui] of [['Tab', 'inventory'], ['y', 'skillTree']]) {
                await press(key);
                await frozen(`直接打开${ui}`, ui);
                await press('Escape');
                await state('none');
                await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').scene.isActive());
            }
            await press('Escape');
            await state('paused');
            await page.locator('.pause').getByRole('button', { name: '放弃本关' }).click();
            await state('levelSelect');
            await page.getByRole('button', { name: '营地', exact: true }).first().click();
            await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Camp' && window.__SEAPP__.game.scene.getScene('Camp').scene.isActive());
            await press('e');
            await state('shop');
            await frames();
            const campPaused = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').scene.isPaused());
            await press('Escape');
            await state('none');
            await frames();
            cases.push({ label: '营地商店关闭后恢复营地', passed: campPaused && await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').scene.isActive()) });
            return { passed: cases.every((c) => c.passed) && errors.length === 0, cases, errors };
        } catch (error) {
            return { passed: false, cases, errors, failure: { message: error.message, ui: await page.evaluate(() => ({ state: window.__SEAPP_UI__?.state, scene: window.__SEAPP_UI__?.sceneKey })) } };
        }
    } finally {
        await browser.close();
    }
}
