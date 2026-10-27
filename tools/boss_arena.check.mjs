/** 隔离 Chrome：锁场取景、物理边界、解锁和重试。 */
async function checkBossArena(sourcePage, { url = 'http://127.0.0.1:8095' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    const cases = [];
    const errors = [];
    const add = (name, passed, detail) => cases.push({ name, passed, ...(passed ? {} : { detail }) });
    let page;
    try {
        page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); } });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.evaluate(() => window.__SEAPP_DOMAIN__.progress.completeLevel('1-1'));
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-2', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready);
        const enter = async id => {
            await page.evaluate(id => window.__SEAPP_DIRECTOR__.director.gotoLevel(id), id);
            await page.waitForFunction(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.ready && s.levelId === id && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
            }, id);
            await page.waitForTimeout(450);
        };
        const engage = async () => {
            await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                s.player.teleportTo(1940, 796);
                s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
                window.__arenaFrames = [];
                const sample = () => {
                    const c = s.cameras.main;
                    window.__arenaFrames.push({ x: c.scrollX, y: c.scrollY, zoom: c.zoom, engaged: s.enemies.getBoss()?.bossEngaged });
                };
                s.game.events.on('poststep', sample);
                s.events.once('shutdown', () => s.game.events.off('poststep', sample));
            });
            await page.waitForTimeout(550);
            await page.keyboard.down('d');
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').arena.isActive);
            await page.keyboard.up('d');
            await page.waitForTimeout(1600);
        };
        const coverage = () => page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const c = s.cameras.main;
            const r = s.ctx.bossArena; const v = c.worldView;
            const bg = s.children.getByName('viewport-background');
            return { complete: v.left <= r.left - 24 && v.right >= r.right + 24 && v.top <= r.top && v.bottom >= r.bottom,
                viewport: [c.width, c.height], zoom: c.zoom, view: { x: v.x, y: v.y, w: v.width, h: v.height },
                background: Math.abs(bg.scaleX * c.zoom - 1) < 0.001,
                limits: [s.player.body.collideWorldBounds, s.enemies.getBoss()?.body.collideWorldBounds] };
        });
        await enter('1-4');
        await engage();
        const transition = await page.evaluate(() => {
            const a = window.__arenaFrames; const i = a.findIndex(f => f.engaged);
            return { first: Math.hypot(a[i].x - a[i - 1].x, a[i].y - a[i - 1].y),
                max: Math.max(...a.slice(i, i + 35).map((f, j) => Math.hypot(f.x - a[i + j - 1].x, f.y - a[i + j - 1].y))) };
        });
        add('1-4 开战首帧和后续过渡无大幅跳切', transition.first < 45 && transition.max < 60, transition);
        const wide = await coverage();
        add('宽屏完整显示竞技场并启用双方边界', wide.complete && wide.limits.every(Boolean) && wide.background, wide);
        await page.screenshot({ path: 'output/boss-arena-after-wide.png' });
        for (const [width, height] of [[1024, 768], [720, 960]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(1700);
            const view = await coverage();
            add(`${width}×${height} 自适应后看全竞技场且背景无缩放空边`, view.complete && view.background, view);
        }
        await page.screenshot({ path: 'output/boss-arena-after-portrait.png' });
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(1400);

        // 只在隔离测试中暂停 AI 决策，真实物理与输入照常运行。
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
            b.invincibleUntil = s.time.now + 100000;
            s.player.teleportTo(s.ctx.bossArena.left + 14, 800);
        });
        await page.keyboard.down('a'); await page.waitForTimeout(450); await page.keyboard.up('a');
        const left = await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
            return { x: s.player.body.left, edge: s.ctx.bossArena.left, blocked: s.player.body.blocked.left }; });
        add('玩家持续向左移动被入口边界挡住', left.x >= left.edge - 0.1 && left.blocked, left);

        await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
            s.player.teleportTo(s.ctx.bossArena.right - 14, 700); });
        await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d');
        const right = await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
            return { x: s.player.body.right, edge: s.ctx.bossArena.right, blocked: s.player.body.blocked.right }; });
        add('玩家在空中向右移动也不能越过边界', right.x <= right.edge + 0.1 && right.blocked, right);

        for (const direction of [-1, 1]) {
            await page.evaluate(direction => {
                const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
                b.invincibleUntil = 0;
                b.sprite.body.reset(direction < 0 ? s.ctx.bossArena.left + 42 : s.ctx.bossArena.right - 42, 768);
                b.applyHit(1, b.sprite.x - direction * 100);
            }, direction);
            await page.waitForTimeout(120);
            const knock = await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
                return { left: b.body.left, right: b.body.right, min: s.ctx.bossArena.left, max: s.ctx.bossArena.right }; });
            add(`Boss 向${direction < 0 ? '左' : '右'}受击退不出界`, knock.left >= knock.min - 0.1 && knock.right <= knock.max + 0.1, knock);
        }
        await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
            b.applyHit(b.hp + 1, s.player.sprite.x); });
        await page.waitForFunction(() => !window.__SEAPP__.game.scene.getScene('Level').arena.isActive);
        add('Boss 击败后解除封锁与玩家边界', await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
            return !s.player.body.collideWorldBounds && s.arena.graphics.visible === false; }));
        await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').respawn());
        await page.waitForTimeout(1200);
        add('重试后恢复门外检查点和正常取景', await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return !s.arena.isActive && !s.player.body.collideWorldBounds && !s.enemies.getBoss().body.collideWorldBounds
                && !s.enemies.getBoss().bossEngaged && Math.abs(s.cameras.main.zoom - 1) < 0.01 && s.player.sprite.x < s.ctx.bossArena.left;
        }));
        await engage();
        add('重试后再次开战会重新封锁', await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').arena.isActive));

        for (const id of ['2-4', '3-4']) {
            await enter(id); await engage();
            const view = await coverage();
            add(`${id} 共用场地范围，完整取景及双方边界正常`, view.complete && view.limits.every(Boolean), view);
            await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
                s.enemies.events.onBossSkill(b, 'summon', { count: 2, enemyRef: b.def.id === 'enm_boss_echo' ? 2 : 0 }); });
            await page.waitForTimeout(80);
            add(`${id} 后续召唤物继承场地物理边界`, await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.enemies.getEntities().filter(e => e.def.kind !== 'boss').every(e => e.body.collideWorldBounds
                    && e.body.customBoundsRectangle.left === s.ctx.bossArena.left); }));
        }
        await enter('1-2');
        add('退出 Boss 关后普通关没有残留封锁或缩放', await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.arena === null && !s.player.body.collideWorldBounds && s.cameras.main.zoom === 1; }));
        await enter('1-4'); await engage();
        await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
            b.hp = 1; b.invincibleUntil = 0;
            s.combat.areaDamage(b.sprite.x, b.sprite.y, 120, 12); });
        await page.waitForFunction(() => !window.__SEAPP__.game.scene.getScene('Level').arena.isActive);
        await page.keyboard.down('d');
        await page.waitForFunction(() => window.__SEAPP_UI__.state === 'result', undefined, { timeout: 10000 });
        await page.keyboard.up('d');
        add('真实战斗击败 Boss 后可走到终点并结算', await page.evaluate(() => window.__SEAPP_DOMAIN__.progress.isCleared('1-4')));
        // 通关后先自动退回 Menu；退场完成后再验证结算页的常规重试。
        await page.waitForFunction(() => !window.__SEAPP_DIRECTOR__.director.isTransitioning && window.__SEAPP_UI__.sceneKey === 'Menu');
        await page.getByRole('button', { name: '重试', exact: true }).click();
        await page.waitForFunction(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.ready && !window.__SEAPP_DIRECTOR__.director.isTransitioning && window.__SEAPP_UI__.state === 'none'; });
        add('结算重试重建正常开放的入场路线', await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
            return !s.arena.isActive && !s.player.body.collideWorldBounds && !s.enemies.getBoss().bossEngaged; }));
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors, transition };
    } catch (error) {
        const state = await page?.evaluate(() => {
            const s = window.__SEAPP__?.game.scene.getScene('Level');
            return { ui: window.__SEAPP_UI__?.state, ready: s?.ready, level: s?.levelId,
                scene: s?.sys.settings.status, transitioning: window.__SEAPP_DIRECTOR__?.director.isTransitioning,
                text: document.body.innerText };
        }).catch(() => null);
        return { passed: false, cases, errors, error: String(error), state };
    }
    finally { await browser.close(); }
}
