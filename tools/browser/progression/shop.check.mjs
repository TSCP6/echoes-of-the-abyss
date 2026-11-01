/** 商店事务与界面刷新回归；独立无头 Chrome。 */
async function checkShop(sourcePage, { url = 'http://127.0.0.1:8086' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const p = await browser.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); } });
        await p.goto(url);
        await p.locator('.menu').waitFor();
        await p.evaluate(() => { window.__SEAPP_DOMAIN__.economy.addCoins(180); window.__SEAPP_DOMAIN__.economy.addMaterial('itm_relic_shard', 10); });
        await p.getByRole('button', { name: '关卡选择', exact: true }).click();
        await p.getByRole('button', { name: '营地', exact: true }).first().click();
        await p.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Camp' && window.__SEAPP__.game.scene.getScene('Camp').scene.isActive());
        await p.keyboard.press('e', { delay: 80 });
        await p.locator('.shop').waitFor();
        const cases = [];
        const daggers = p.locator('.shop .row').filter({ hasText: '双匕首' }).first();
        await daggers.getByRole('button', { name: '购买', exact: true }).click();
        await p.waitForTimeout(100);
        const bought = await daggers.innerText();
        const balance = await p.locator('.shop .coins').innerText();
        cases.push({ label: '购买后余额和已拥有状态立即刷新', passed: bought.includes('已拥有') && balance.includes('60'), bought, balance });
        const crossbow = p.locator('.shop .row').filter({ hasText: /wpn_crossbow|轻弩/ }).last();
        await crossbow.getByRole('button', { name: /升级/ }).click();
        await p.waitForTimeout(100);
        const upgraded = await crossbow.innerText();
        const after = await p.locator('.shop .coins').innerText();
        const level = await p.evaluate(() => window.__SEAPP_DOMAIN__.weapons.getLevel('wpn_crossbow', 'sub'));
        cases.push({ label: '副手升级扣款后显示Lv2且升级真实副手实例', passed: upgraded.includes('Lv2') && /◉\s*0\b/.test(after) && level === 2, upgraded, after, level });
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
