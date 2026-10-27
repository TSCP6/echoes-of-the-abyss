/** 跳跃/掉落拾取回归：独立无头 Chrome，长按真实跳跃键测量轨迹。 */
async function checkJumpAndCoin(sourcePage, { url = 'http://127.0.0.1:8086' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); } });
        await page.goto(url);
        await page.locator('.menu').waitFor();
        await page.getByRole('button', { name: '开始游戏', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').player?.isGrounded());
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const probe = { startY: s.player.sprite.y, minY: s.player.sprite.y, start: null, apex: null, airborneMs: null, done: false };
            window.__JUMP_CHECK__ = probe;
            const tick = () => {
                const b = s.player.body;
                if (probe.start === null && b.velocity.y < -10) { probe.start = s.time.now; }
                if (probe.start === null) { return; }
                probe.minY = Math.min(probe.minY, s.player.sprite.y);
                if (probe.apex === null && b.velocity.y >= 0) { probe.apex = s.time.now - probe.start; }
                if (b.blocked.down && b.velocity.y >= 0) {
                    probe.airborneMs = s.time.now - probe.start;
                    probe.done = true;
                    s.events.off('postupdate', tick);
                }
            };
            s.events.on('postupdate', tick);
        });
        await page.keyboard.down('Space');
        await page.waitForFunction(() => window.__JUMP_CHECK__.done);
        await page.keyboard.up('Space');
        const jump = await page.evaluate(() => {
            const p = window.__JUMP_CHECK__;
            return { heightPx: p.startY - p.minY, apexMs: p.apex, airborneMs: p.airborneMs, gravity: window.__SEAPP__.game.scene.getScene('Level').physics.world.gravity.y };
        });
        const contact = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const econ = window.__SEAPP_DOMAIN__.economy;
            const before = econ.getCoins();
            s.pickups.spawnCoinBurst({ x: s.player.sprite.x + 15, y: s.player.sprite.y }, 1);
            s.pickups.update(1 / 60);
            const delta = econ.getCoins() - before;
            s.pickups.update(1 / 60);
            return { firstFrameDelta: delta, afterSecondUpdate: econ.getCoins() - before };
        });
        const nearby = await page.evaluate(async () => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const econ = window.__SEAPP_DOMAIN__.economy;
            const before = econ.getCoins();
            s.pickups.spawnCoinBurst({ x: s.player.sprite.x + 75, y: s.player.sprite.y - 10 }, 1);
            const start = s.time.now;
            return await new Promise(resolve => {
                const tick = () => {
                    const elapsedMs = s.time.now - start;
                    const delta = econ.getCoins() - before;
                    if (delta > 0 || elapsedMs > 1000) {
                        s.events.off('postupdate', tick);
                        resolve({ delta, elapsedMs });
                    }
                };
                s.events.on('postupdate', tick);
            });
        });
        const enemyDrop = await page.evaluate(async () => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const econ = window.__SEAPP_DOMAIN__.economy;
            const enemy = s.enemies.getEntities()[0];
            enemy.body.reset(s.player.sprite.x + 25, s.player.sprite.y);
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            const before = econ.getCoins();
            const start = s.time.now;
            s.combat.setRng(() => 0.5);
            s.combat.areaDamage(enemy.sprite.x, enemy.sprite.y, 1, 10000);
            return await new Promise(resolve => {
                let firstPickupMs = null;
                const tick = () => {
                    const elapsedMs = s.time.now - start;
                    const delta = econ.getCoins() - before;
                    if (delta > 0 && firstPickupMs === null) { firstPickupMs = elapsedMs; }
                    if (delta >= 5 || elapsedMs > 1000) {
                        s.events.off('postupdate', tick);
                        resolve({ killed: enemy.dead, delta, firstPickupMs, elapsedMs });
                    }
                };
                s.events.on('postupdate', tick);
            });
        });
        const routes = [];
        for (const route of [
            { level: '2-1', x: 598, y: 672, minX: 693, landingY: 544 },
            { level: '3-3', x: 1487, y: 800, minX: 1653, landingY: 800 },
            { level: '3-3', x: 2927, y: 800, minX: 3093, landingY: 800 }
        ]) {
            await page.evaluate(id => window.__SEAPP_DIRECTOR__.director.gotoLevel(id), route.level);
            await page.waitForFunction(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.ready && s.levelId === id && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
            }, route.level);
            await page.evaluate(({ x, y }) => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                s.player.body.reset(x, y);
                s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            }, route);
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').player.isGrounded());
            const start = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').time.now);
            await page.keyboard.down('d');
            await page.keyboard.down('Space');
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').player.body.velocity.y < -100);
            await page.waitForFunction(start => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.time.now - start > 400 && s.player.body.blocked.down;
            }, start);
            await page.keyboard.up('Space');
            await page.keyboard.up('d');
            const landed = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return { x: s.player.sprite.x, y: s.player.sprite.y, dead: s.dead };
            });
            routes.push({ route, landed, passed: !landed.dead && landed.x >= route.minX && Math.abs(landed.y - route.landingY) < 2 });
        }
        const passed = jump.heightPx >= 128 && jump.heightPx < 145 && jump.airborneMs < 1050
            && contact.firstFrameDelta === 1 && contact.afterSecondUpdate === 1 && nearby.delta === 1
            && enemyDrop.killed && enemyDrop.delta === 5 && enemyDrop.firstPickupMs < 200
            && routes.every(r => r.passed) && errors.length === 0;
        return { passed, jump, contact, nearby, enemyDrop, routes, errors };
    } finally { await browser.close(); }
}
