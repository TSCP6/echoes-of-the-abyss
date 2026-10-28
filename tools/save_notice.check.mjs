/** 隔离 Chrome 验证自动保存静默、失败提醒和手动保存确认。 */
export async function checkSaveNotice(chromium, url = 'http://127.0.0.1:8115') {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const cases = [];
    try {
        const p = await browser.newPage();
        const add = (name, passed) => cases.push({ name, passed });
        await p.goto(url, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await p.getByRole('button', { name: '关卡选择', exact: true }).click();
        await p.getByRole('button', { name: '1-1', exact: true }).click();
        await p.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level')?.ready && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await p.evaluate(() => { window.__SEAPP_DOMAIN__.economy.addCoins(1); window.__SEAPP__.game.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
        await p.waitForTimeout(700);
        add('金币自动保存后不弹成功提示', await p.locator('.save-notice').count() === 0);
        add('自动保存仍实际完成', await p.evaluate(() => window.__SEAPP_DOMAIN__.save.getSummary() !== null));
        await p.keyboard.down('k'); await p.waitForTimeout(90); await p.keyboard.up('k'); await p.waitForTimeout(700);
        add('射击消耗弹药仍保存且不弹提示', await p.locator('.save-notice').count() === 0 && await p.evaluate(() => window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow') === 19));
        const fail = () => p.evaluate(() => { window.__originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('test quota', 'QuotaExceededError'); }; window.__SEAPP_DOMAIN__.economy.addCoins(1); });
        const restore = () => p.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
        await fail(); await p.waitForTimeout(700);
        add('保存失败保留醒目提醒及重试入口', await p.locator('.save-notice[role=alert]').count() === 1 && await p.locator('.save-notice button').count() >= 2);
        await restore(); await p.evaluate(() => window.__SEAPP_DOMAIN__.economy.addCoins(1)); await p.waitForTimeout(700);
        add('自动保存恢复后清除失败提醒且不弹成功', await p.locator('.save-notice').count() === 0);
        await fail(); await p.waitForTimeout(700); await restore();
        await p.locator('.save-notice').getByRole('button', { name: '重试保存', exact: true }).click();
        add('手动重试成功显示确认', (await p.locator('.save-notice').innerText()).includes('进度已保存'));
        await p.waitForTimeout(3000); await p.evaluate(() => window.__SEAPP_DOMAIN__.economy.addCoins(1)); await p.waitForTimeout(1300);
        add('自动存档不延长手动成功提示计时', await p.locator('.save-notice').count() === 0);
        await p.keyboard.down('Escape'); await p.waitForTimeout(90); await p.keyboard.up('Escape');
        await p.getByRole('button', { name: '保存并退出', exact: true }).click();
        add('手动保存并退出显示成功确认', (await p.locator('.save-notice').innerText()).includes('进度已保存'));
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases };
    } finally { await browser.close(); }
}
