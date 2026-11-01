/** 隔离 Chrome：未到检查点、检查点激活、连续死亡、切关与掉图救援。 */
async function checkRespawn(sourcePage, { url = 'http://127.0.0.1:8095' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    const cases = [], errors = [];
    const add = (name, passed, detail) => cases.push({ name, passed, ...(passed ? {} : { detail }) });
    try {
        const page = await browser.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        const ready = () => page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await ready();
        const state = () => page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return { x: s.player.sprite.x, spawn: s.ctx.spawn.x, checkpoints: s.pickups.checkpointsActive,
                active: s.activeCheckpoint, hp: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp };
        });
        const die = async () => {
            await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                s.player.iFrameUntil = 0;
                s.combat.damagePlayer(10000, 'respawn-test', s.player.sprite.x + 100);
            });
            await page.waitForFunction(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); return !s.dead && window.__SEAPP_DOMAIN__.resources.getSnapshot().hp > 0; });
            await page.waitForTimeout(100);
        };
        const enter = async id => {
            await page.evaluate(id => window.__SEAPP_DIRECTOR__.director.gotoLevel(id), id);
            await ready();
        };
        await die();
        let s = await state();
        add('未激活检查点死亡回出生点，检查点数量仍为零', Math.abs(s.x - s.spawn) < 1 && s.checkpoints === 0, s);
        await die();
        s = await state();
        add('开局连续死亡仍回出生点并恢复生命', Math.abs(s.x - s.spawn) < 1 && s.hp > 0 && s.checkpoints === 0, s);
        for (const i of [0, 1]) {
            const cp = await page.evaluate(i => {
                const s = window.__SEAPP__.game.scene.getScene('Level'); const cp = s.ctx.checkpoints[i];
                s.player.teleportTo(cp.x, cp.y); return cp;
            }, i);
            await page.waitForFunction(id => window.__SEAPP__.game.scene.getScene('Level').activeCheckpoint === id, cp.id);
            // 离开已激活检查点再死亡，避免只验证原地复活。
            await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); s.player.teleportTo(s.ctx.spawn.x, s.ctx.spawn.y); });
            await die();
            s = await state();
            add(`激活 ${cp.id} 后死亡回到该点`, Math.abs(s.x - cp.x) < 1 && s.active === cp.id, s);
        }
        await enter('1-1');
        await die();
        s = await state();
        add('重新进入同关清除旧检查点', Math.abs(s.x - s.spawn) < 1 && s.checkpoints === 0, s);
        await enter('1-2');
        await die();
        s = await state();
        add('切入下一关后死亡使用新关出生点', Math.abs(s.x - s.spawn) < 1 && s.checkpoints === 0, s);
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.player.body.setCollideWorldBounds(false);
            s.player.teleportTo(s.ctx.spawn.x, s.ctx.mapHeight + 600);
        });
        await page.waitForTimeout(250);
        s = await state();
        add('未激活检查点掉图救援也回出生点', Math.abs(s.x - s.spawn) < 1 && s.checkpoints === 0, s);
        const cp = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const cp = s.ctx.checkpoints[0]; s.player.teleportTo(cp.x, cp.y); return cp;
        });
        await page.waitForFunction(id => window.__SEAPP__.game.scene.getScene('Level').activeCheckpoint === id, cp.id);
        await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); s.player.teleportTo(s.ctx.spawn.x, s.ctx.mapHeight + 600); });
        await page.waitForTimeout(250);
        s = await state();
        add('激活后掉图救援回到检查点', Math.abs(s.x - cp.x) < 1 && s.active === cp.id, s);
        add('浏览器无脚本或控制台错误', errors.length === 0, errors);
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
    } finally { await browser.close(); }
}
