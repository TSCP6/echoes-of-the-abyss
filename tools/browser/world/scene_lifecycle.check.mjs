/** 供 Playwright MCP 的 browser_run_code_unsafe(filename) 载入；始终另开独立无头 Chrome。 */
async function checkSceneLifecycle(sourcePage, { url = 'http://127.0.0.1:8086', transitions = 20 } = {}) {
    const browserType = sourcePage.context().browser().browserType();
    const browser = await browserType.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
        const errors = [];
        const pauseWarnings = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') { errors.push(message.text()); }
            if (message.text().includes('Cannot pause non-running Scene')) { pauseWarnings.push(message.text()); }
        });
        await page.goto(url);
        await page.locator('.menu').waitFor();
        await page.getByRole('button', { name: '开始游戏', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready);
        const sample = () => page.evaluate(async () => {
            const game = window.__SEAPP__.game;
            const { EventBus } = await import('/src/game/EventBus.ts');
            const key = window.__SEAPP_UI__.sceneKey;
            const level = game.scene.getScene('Level');
            return {
                key,
                blur: game.events.listenerCount('blur'),
                overlay: EventBus.listenerCount('ui:overlay'),
                killed: EventBus.listenerCount('enemy:killed'),
                damaged: EventBus.listenerCount('player:damaged'),
                stoppedLevelClean: key === 'Level' || (!level.ready && level.enemies.getEntities().length === 0
                    && level.projectiles.getActive().length === 0 && level.fx.pool.length === 0
                    && level.pickups.coins.length === 0 && level.combat.swings.length === 0),
                checkpoint: key === 'Level' ? level.activeCheckpoint : null
            };
        });
        const samples = [await sample()];
        const targets = ['Level', 'Camp', 'Level', 'Menu'];
        for (let i = 0; i < transitions; i++) {
            const key = targets[i % targets.length];
            const before = await page.evaluate(() => window.__SEAPP_UI__.readyCount);
            if (await page.evaluate(() => window.__SEAPP_UI__.sceneKey === 'Level')) {
                await page.evaluate(() => { window.__SEAPP__.game.scene.getScene('Level').activeCheckpoint = 'cp_2'; });
            }
            if (await page.evaluate(() => window.__SEAPP_UI__.state === 'mainMenu')) {
                await page.getByRole('button', { name: '开始游戏', exact: true }).click();
                await page.getByRole('button', { name: '1-1', exact: true }).click();
            } else {
                await page.evaluate((target) => {
                    const director = window.__SEAPP_DIRECTOR__.director;
                    if (target === 'Camp') { director.gotoCamp(1); }
                    else if (target === 'Menu') { director.gotoMenu(); }
                    else { director.gotoLevel('1-1'); }
                }, key);
            }
            await page.waitForFunction(({ key, before }) => {
                const ui = window.__SEAPP_UI__;
                const game = window.__SEAPP__.game;
                return ui.readyCount > before && ui.sceneKey === key && !window.__SEAPP_DIRECTOR__.director.isTransitioning
                    && game.scene.getScene(key).scene.isActive();
            }, { key, before });
            samples.push(await sample());
        }
        if (await page.evaluate(() => window.__SEAPP_UI__.state === 'mainMenu')) {
            await page.getByRole('button', { name: '开始游戏', exact: true }).click();
            await page.getByRole('button', { name: '1-1', exact: true }).click();
        } else if (await page.evaluate(() => window.__SEAPP_UI__.sceneKey !== 'Level')) {
            await page.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoLevel('1-1'));
        }
        await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready);
        const kill = await page.evaluate(() => {
            const scene = window.__SEAPP__.game.scene.getScene('Level');
            const domain = window.__SEAPP_DOMAIN__;
            const enemy = scene.enemies.getEntities()[0];
            scene.combat.setRng(() => 0.5);
            const before = { kills: scene.kills, total: domain.records.toSnapshot().totalKills, coins: scene.pickups.coins.filter((c) => c.active).length };
            const expectedCoins = enemy.def.coinsDrop[0] + Math.floor(0.5 * (enemy.def.coinsDrop[1] - enemy.def.coinsDrop[0] + 1));
            scene.combat.areaDamage(enemy.sprite.x, enemy.sprite.y, 8, 1000);
            return {
                killed: enemy.dead,
                killDelta: scene.kills - before.kills,
                totalDelta: domain.records.toSnapshot().totalKills - before.total,
                coinDelta: scene.pickups.coins.filter((c) => c.active).length - before.coins,
                expectedCoins
            };
        });
        const expectedCounts = { Level: [1, 1, 1], Camp: [1, 0, 0], Menu: [0, 0, 0] };
        const blurBaselines = new Map();
        const checks = samples.map((s) => {
            if (!blurBaselines.has(s.key)) { blurBaselines.set(s.key, s.blur); }
            const expected = expectedCounts[s.key];
            return s.blur === blurBaselines.get(s.key) && s.overlay === expected[0] && s.killed === expected[1]
                && s.damaged === expected[2] && s.stoppedLevelClean && (s.key !== 'Level' || s.checkpoint === 'cp_1');
        });
        const passed = checks.every(Boolean) && kill.killed && kill.killDelta === 1 && kill.totalDelta === 1
            && kill.coinDelta === kill.expectedCoins && errors.length === 0 && pauseWarnings.length === 0;
        return { passed, transitions, samples, kill, errors, pauseWarnings };
    } finally {
        await browser.close();
    }
}
