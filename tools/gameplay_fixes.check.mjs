/** 剩余玩法回归：独立无头 Chrome，不接管前台浏览器。 */
async function checkGameplayFixes(sourcePage, { url = 'http://127.0.0.1:8086' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const p = await browser.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); } });
        const press = (key) => p.keyboard.press(key, { delay: 80 });
        const cases = [];
        await p.goto(url);
        await p.locator('.menu').waitFor();
        await p.getByRole('button', { name: '开始游戏', exact: true }).click();
        await p.getByRole('button', { name: '1-1', exact: true }).click();
        await p.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Level' && window.__SEAPP__.game.scene.getScene('Level').ready);
        for (const [key, facing, ammo] of [['a', -1, 19], ['d', 1, 18]]) {
            await press(key);
            await p.waitForTimeout(150);
            await press('k');
            const shot = await p.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const proj = s.projectiles.getActive().filter((v) => v.spec?.side === 'player').at(-1);
                return { vx: proj?.sprite.body.velocity.x, ammo: window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow') };
            });
            cases.push({ label: `真实按键朝${facing === 1 ? '右' : '左'}射击`, passed: Math.sign(shot.vx) === facing && shot.ammo === ammo, shot });
        }
        const fatal = await p.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const d = window.__SEAPP_DOMAIN__;
            const enemy = s.enemies.getEntities()[0];
            const before = d.records.toSnapshot();
            s.player.body.reset(600, 800);
            enemy.body.reset(610, 800);
            enemy.hp = 1;
            enemy.sleeping = false;
            s.player.iFrameUntil = 0;
            d.resources.applyDamage(d.resources.getSnapshot().hp - 1);
            s.combat.setRng(() => 0.5);
            s.combat.beginMelee(d.weapons.getEquippedDefs().main);
            const bounds = { player: { x: s.player.body.x, y: s.player.body.y, w: s.player.body.width, h: s.player.body.height }, enemy: enemy.getHurtbox() };
            s.combat.update(1 / 60);
            const after = d.records.toSnapshot();
            return { dead: s.dead, enemyAlive: !enemy.dead, deaths: after.totalDeaths - before.totalDeaths, kills: after.totalKills - before.totalKills, bounds };
        });
        cases.push({ label: '真实战斗同帧致死优先，不额外计击杀', passed: fatal.dead && fatal.enemyAlive && fatal.deaths === 1 && fatal.kills === 0, fatal });
        await p.waitForFunction(() => !window.__SEAPP__.game.scene.getScene('Level').dead);
        await press('Tab');
        await p.waitForFunction(() => window.__SEAPP_UI__.state === 'inventory');
        await press('Tab');
        await p.waitForTimeout(150);
        const tabClosed = await p.evaluate(() => window.__SEAPP_UI__.state === 'none');
        cases.push({ label: 'Tab再次按下能关闭背包', passed: tabClosed });
        if (!tabClosed) { await press('Escape'); }
        await p.waitForFunction(() => window.__SEAPP_UI__.state === 'none');
        for (const [key, ui] of [['Tab', 'inventory'], ['y', 'skillTree']]) {
            await p.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').scene.isActive());
            await press(key);
            await p.waitForFunction((state) => window.__SEAPP_UI__.state === state, ui);
            await p.keyboard.down(key);
            await p.waitForTimeout(80);
            await p.keyboard.down(key); // 自动重复事件：关闭面板后继续保持按住。
            await p.waitForTimeout(150);
            cases.push({ label: `${key}关闭后保持按住不重开`, passed: await p.evaluate(() => window.__SEAPP_UI__.state === 'none') });
            await p.keyboard.up(key);
        }
        await p.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const ch = s.ctx.chests[0];
            s.player.teleportTo(ch.x, ch.y);
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
        });
        await p.waitForTimeout(200);
        const unopened = await p.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').pickups.openedChests.size === 0);
        cases.push({ label: '靠近宝箱不会自动开箱', passed: unopened });
        await press('e');
        cases.push({ label: '按交互键打开宝箱一次', passed: await p.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').pickups.openedChests.size === 1) });
        await press('Escape');
        await p.locator('.pause').waitFor();
        await p.getByRole('button', { name: '放弃本关' }).click();
        await p.locator('.select').waitFor();
        await p.getByRole('button', { name: '返回主菜单', exact: true }).click();
        await p.waitForTimeout(650);
        cases.push({ label: '暂停后放弃并返回主菜单真正停止旧关卡', passed: await p.evaluate(() => {
            const game = window.__SEAPP__.game;
            return window.__SEAPP_UI__.sceneKey === 'Menu' && game.scene.getScene('Menu').scene.isActive() && !game.scene.getScene('Level').ready;
        }) });
        await p.getByRole('button', { name: '关卡选择', exact: true }).click();
        await p.getByRole('button', { name: '营地', exact: true }).first().click();
        await p.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Camp');
        await press('Escape');
        await p.waitForTimeout(150);
        const campPaused = await p.evaluate(() => window.__SEAPP_UI__.state === 'paused' && window.__SEAPP__.game.scene.getScene('Camp').scene.isPaused());
        cases.push({ label: '营地Esc可打开暂停页', passed: campPaused });
        if (campPaused) {
            await p.locator('.pause').getByRole('button', { name: '设置', exact: true }).click();
            await p.locator('.settings').getByRole('button', { name: '返回', exact: true }).click();
            await p.waitForTimeout(100);
            cases.push({ label: '营地设置返回后继续暂停', passed: await p.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').scene.isPaused()) });
            await press('Escape');
            await p.waitForTimeout(100);
            cases.push({ label: '营地最后一层关闭后正常恢复', passed: await p.evaluate(() => window.__SEAPP_UI__.state === 'none' && window.__SEAPP__.game.scene.getScene('Camp').scene.isActive()) });
        }
        return { passed: cases.every((c) => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
