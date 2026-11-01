/** 隔离 Chrome：真实 Arcade 接触伤害、无敌帧和无输入击退位移。 */
async function checkContactDamage(sourcePage, { url = 'http://localhost:8097' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    const errors = [], cases = [];
    try {
        const page = await browser.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready
            && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        // 先在出生点落地，保证两侧对比使用相同地面与无输入条件。
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').player.body.blocked.down);
        for (const side of [-1, 1]) {
            const hit = await page.evaluate(side => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const resources = window.__SEAPP_DOMAIN__.resources;
                resources.refill();
                s.player.teleportTo(s.ctx.spawn.x, s.player.sprite.y);
                s.player.iFrameUntil = 0;
                const enemies = s.enemies.getEntities();
                for (const e of enemies) { e.body.reset(-1000, 0); }
                const e = enemies[0];
                e.sleeping = false;
                e.body.reset(s.player.sprite.x + side * 8, s.player.sprite.y);
                // 美术帧原点与碰撞盒有偏移；直接对齐真实碰撞盒，保证测试确实重叠。
                e.body.position.set(s.player.body.x + side * 4, s.player.body.y + 4);
                e.body.updateCenter();
                s.combat.update(1 / 60);
                const result = { hp: resources.getSnapshot().hp, velocity: s.player.body.velocity.x,
                    x: s.player.sprite.x, iframe: s.player.iFrameUntil - s.time.now };
                s.combat.update(1 / 60);
                result.hpAfterOverlap = resources.getSnapshot().hp;
                e.body.reset(-1000, 0);
                return result;
            }, side);
            // 跨真实渲染帧观察减速后的位移，避免固定等待时隐藏页帧暂停。
            const after = await page.evaluate(() => new Promise(resolve => {
                let frames = 0;
                const sample = () => {
                    if (++frames < 20) { requestAnimationFrame(sample); return; }
                    const s = window.__SEAPP__.game.scene.getScene('Level');
                    resolve({ x: s.player.sprite.x, velocity: s.player.body.velocity.x });
                };
                requestAnimationFrame(sample);
            }));
            const displacement = after.x - hit.x;
            cases.push({ side, hit, after, displacement, passed: hit.hp === 95 && hit.hpAfterOverlap === 95
                && hit.velocity === -side * 180 && Math.abs(hit.iframe - 800) < 0.01
                && Math.sign(displacement) === -side && Math.abs(displacement) < 20 && after.velocity === 0 });
        }
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
