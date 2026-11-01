/** Playwright MCP filename 脚本：独立无头 Chrome，测试浏览器内使用开发探针构造战斗状态。 */
async function checkBossGoal(sourcePage, { url = 'http://127.0.0.1:8086' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); } });
        await page.goto(url);
        await page.locator('.menu').waitFor();
        await page.getByRole('button', { name: '开始游戏', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready);
        const cases = [];
        const enter = async (id) => {
            await page.evaluate((levelId) => window.__SEAPP_DIRECTOR__.director.gotoLevel(levelId), id);
            await page.waitForFunction((id) => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.ready && s.levelId === id && s.scene.isActive() && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
            }, id);
            await page.evaluate(() => { window.__SEAPP__.game.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
        };
        const standAtGoal = () => page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.player.teleportTo(s.ctx.goal.centerX, s.ctx.goal.centerY);
        });
        for (const id of ['1-4', '2-4', '3-4']) {
            await enter(id);
            const before = await page.evaluate(() => ({ progress: window.__SEAPP_DOMAIN__.progress.toSnapshot(), skp: window.__SEAPP_DOMAIN__.skills.skpBalance }));
            await standAtGoal();
            await page.waitForTimeout(300);
            const blocked = await page.evaluate((id) => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return { ui: window.__SEAPP_UI__.state, reached: s.pickups.goalReached, cleared: window.__SEAPP_DOMAIN__.progress.isCleared(id), alive: s.enemies.getBoss() !== null,
                    progress: window.__SEAPP_DOMAIN__.progress.toSnapshot(), skp: window.__SEAPP_DOMAIN__.skills.skpBalance };
            }, id);
            const passed = blocked.alive && !blocked.reached && !blocked.cleared && blocked.ui === 'none'
                && JSON.stringify(blocked.progress.clearedLevels) === JSON.stringify(before.progress.clearedLevels)
                && JSON.stringify(blocked.progress.unlockedLevels) === JSON.stringify(before.progress.unlockedLevels) && blocked.skp === before.skp;
            cases.push({ label: `${id} Boss存活不能通关/解锁/领首通奖励`, passed, ...(passed ? {} : { blocked }) });
            if (!passed) { return { passed: false, cases, errors }; }
            await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const boss = s.enemies.getBoss();
                boss.invincibleUntil = 0;
                s.combat.setRng(() => 0.5);
                s.combat.areaDamage(boss.sprite.x, boss.sprite.y, 1, 10000);
            });
            await page.waitForFunction(() => window.__SEAPP_UI__.state === 'result' && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
            const cleared = await page.evaluate((id) => ({ cleared: window.__SEAPP_DOMAIN__.progress.isCleared(id), skp: window.__SEAPP_DOMAIN__.skills.skpBalance }), id);
            cases.push({ label: `${id} 击败Boss后仍站终点即可通关且首通奖励+2`, passed: cleared.cleared && cleared.skp === before.skp + 2 });
            // 使用结算页重试验证新尝试不会继承上次Boss死亡或终点熔断状态。
            await page.getByRole('button', { name: '重试', exact: true }).click();
            await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
            await standAtGoal();
            await page.waitForTimeout(200);
            cases.push({ label: `${id} 重试后Boss复活，终点重新锁定`, passed: await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.enemies.getBoss() !== null && !s.pickups.goalReached && window.__SEAPP_UI__.state === 'none';
            }) });
        }
        await enter('1-1');
        await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').onPlayerDeath());
        await standAtGoal();
        await page.waitForTimeout(200);
        cases.push({ label: '死亡等待重生期间触碰终点不能获胜，也不消耗终点', passed: await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.dead && !s.pickups.goalReached && !window.__SEAPP_DOMAIN__.progress.isCleared('1-1');
        }) });
        await page.waitForFunction(() => !window.__SEAPP__.game.scene.getScene('Level').dead);
        await standAtGoal();
        await page.waitForFunction(() => window.__SEAPP_UI__.state === 'result');
        cases.push({ label: '普通关不要求清空全部敌人即可到终点通关', passed: await page.evaluate(() => window.__SEAPP_DOMAIN__.progress.isCleared('1-1')) });
        return { passed: cases.every((c) => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
