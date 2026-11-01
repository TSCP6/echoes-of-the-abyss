/** 隔离 Chrome；用真实 CombatResolver 结算最后一击，夹具只缩短前置流程与 Boss 血量。 */
export async function checkVictory(browser, { url, output = 'output' }) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const cases = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); } });
    page.on('response', response => { if (response.status() >= 400) { errors.push(`${response.status()} ${response.url()}`); } });
    const check = (name, passed, detail) => cases.push({ name, passed: Boolean(passed), ...(passed ? {} : { detail }) });
    const ui = () => page.evaluate(() => window.__SEAPP_UI__.state);
    const ready = async () => {
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted && window.__SEAPP_DOMAIN__);
    };
    const enter = async () => {
        await page.evaluate(() => document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel('3-4'));
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready
            && window.__SEAPP_UI__.state === 'none' && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
    };
    const lastHit = () => page.evaluate(() => {
        const d = window.__SEAPP_DOMAIN__, raw = window.__SEAPP__.game;
        const game = raw.__v_raw ?? raw, scene = game.scene.getScene('Level'), boss = scene.enemies.getBoss();
        game.loop.stop();
        scene.player.teleportTo(boss.sprite.x - 40, boss.sprite.y);
        scene.player.iFrameUntil = game.loop.lastTime + 100000;
        boss.hp = 1; boss.phaseIndex = 2; boss.invincibleUntil = 0; boss.bossEngaged = true;
        const before = { coins: d.economy.getCoins(), deaths: d.records.getGlobalStats().totalDeaths,
            materials: d.economy.getMaterials().itm_relic_shard ?? 0 };
        // 强制抽中强化材料，仍经现有权重与 CombatResolver 命中流程。
        const random = Math.random; Math.random = () => 0;
        scene.combat.queueAreaDamage(boss.sprite.x, boss.sprite.y, 150, 99999);
        let clock = game.loop.lastTime;
        for (let n = 0; n < 3; n++) { clock += 1000 / 60; game.step(clock, 1000 / 60); }
        Math.random = random;
        const after = { coins: d.economy.getCoins(), deaths: d.records.getGlobalStats().totalDeaths,
            materials: d.economy.getMaterials().itm_relic_shard ?? 0 };
        scene.onPlayerDeath(); scene.combat.damagePlayer(99999, 'late-projectile', scene.player.sprite.x);
        scene.onGoalReached();
        const unchanged = after.coins === d.economy.getCoins() && after.deaths === d.records.getGlobalStats().totalDeaths;
        const result = { before, after, unchanged, bossDead: boss.dead, finished: scene.finished,
            state: window.__SEAPP_UI__.state, levelCleared: d.progress.isCleared('3-4'),
            clearCount: d.progress.getClearCount?.('3-4'), hazards: scene.hazards.length,
            projectiles: scene.projectiles.pool.filter(p => p.active).length };
        d.save.write(); game.loop.start(game.step.bind(game)); return result;
    });
    try {
        await page.goto(url); await ready();
        check('新档没有重看结局入口', await page.getByRole('button', { name: '重看结局', exact: true }).count() === 0);
        await page.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__;
            for (const id of ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '3-1', '3-2', '3-3']) {
                d.progress.completeLevel(id);
                for (const key of ['a', 'b']) { d.progress.collectShard(id, key); d.skills.grantShardSkp(); }
            }
            d.skills.grantBossSkp(4);
            d.records.addPlayTime(3267); d.records.addDeath(); d.records.addKill();
        });
        await enter();
        const blocked = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').onGoalReached());
        check('最终 Boss 存活时不能通过终点结算', !blocked && await ui() === 'none');
        const result = await lastHit();
        check('真实最后一击自动进入终章，无需走到出口', result.bossDead && result.finished && result.levelCleared && result.state === 'victory', result);
        check('最终金币与材料先入账', result.after.coins > result.before.coins && result.after.materials - result.before.materials === 17, result);
        check('重复结算/迟到攻击不再发奖或杀死玩家', result.unchanged && result.after.deaths === result.before.deaths, result);
        check('危险区域和弹丸已清理', result.hazards === 0 && result.projectiles === 0, result);
        await page.locator('.is-intro').waitFor();
        await page.waitForTimeout(900); // 等待 Vue 淡入及晨光变化，截图覆盖实际演出画面。
        await page.screenshot({ path: `${output}/victory-intro.png` });
        await page.keyboard.press('Escape');
        await page.locator('.ending-content:visible').waitFor();
        check('Esc 跳过演出后保持胜利界面', await ui() === 'victory');
        check('三章卡片与真实非满收集进度', await page.locator('.chapter').count() === 3
            && await page.locator('.milestones').innerText().then(t => t.includes('12') && t.includes('22')));
        check('没有误点亮完整回响', await page.locator('.medallion.complete').count() === 0);
        await page.locator('summary').click();
        check('展开统计显示存档累计和最终关用时', await page.locator('.adventure-records').innerText().then(t => t.includes('本次最终关用时') && t.includes('累计死亡')));
        await page.locator('summary').click();
        const layouts = [];
        for (const [width, height] of [[1280, 900], [1024, 768], [1600, 900], [390, 844]]) {
            await page.setViewportSize({ width, height });
            const layout = await page.locator('.victory').evaluate(el => {
                const buttons = [...el.querySelectorAll('footer button')];
                return { noHorizontalOverflow: el.scrollWidth <= el.clientWidth + 1,
                    buttonsFit: buttons.every(b => b.getBoundingClientRect().width > 40 && b.getBoundingClientRect().right <= innerWidth),
                    desktopNavigationVisible: innerWidth < 800 || buttons.every(b => b.getBoundingClientRect().bottom <= innerHeight) };
            });
            layouts.push({ width, height, ...layout });
            await page.screenshot({ path: `${output}/victory-${width}.png`, fullPage: false });
        }
        check('四种窗口尺寸布局无横向溢出，桌面导航完整可见', layouts.every(l => l.noHorizontalOverflow && l.buttonsFit && l.desktopNavigationVisible), layouts);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.getByRole('button', { name: '返回营地', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP_UI__.sceneKey === 'Camp' && window.__SEAPP_UI__.state === 'none');
        check('主按钮进入第三章营地', await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').sceneId === 3));
        await page.evaluate(() => document.querySelector('.ui-layer').__vueParentComponent.exposed.backToMenu());
        await page.getByRole('button', { name: '重看结局', exact: true }).waitFor();
        const balance = await page.evaluate(() => window.__SEAPP_DOMAIN__.economy.getCoins());
        await page.getByRole('button', { name: '重看结局', exact: true }).click();
        await page.keyboard.press('Escape'); await page.locator('.ending-content:visible').waitFor();
        check('主菜单可重看且不发放奖励', balance === await page.evaluate(() => window.__SEAPP_DOMAIN__.economy.getCoins()));
        await page.getByRole('button', { name: '重访关卡', exact: true }).click();
        check('重访关卡进入关卡选择', await ui() === 'levelSelect');
        await page.evaluate(() => document.querySelector('.ui-layer').__vueParentComponent.exposed.backToMenu());
        await page.reload(); await ready();
        check('刷新读档后保留通关与重看入口', await page.getByRole('button', { name: '重看结局', exact: true }).count() === 1);
        await page.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__;
            for (const level of d.progress.getLevelViews()) {
                for (const key of ['a', 'b', 'c']) {
                    if (!d.progress.isShardCollected(level.levelId, key)) { d.progress.collectShard(level.levelId, key); d.skills.grantShardSkp(); }
                }
            }
            d.progress.setVictoryLoot([{ itemId: 'itm_potion_hp_l', count: 2 }]);
            d.inventory.fromSnapshot({ capacity: 20, slots: Array.from({ length: 20 }, (_, slot) => ({ slot, itemId: 'wpn_daggers', count: 1 })), equipped: { main: null, sub: null } });
            d.save.write();
        });
        await page.getByRole('button', { name: '重看结局', exact: true }).click(); await page.keyboard.press('Escape');
        await page.locator('.ending-content:visible').waitFor();
        check('36 枚有效碎片点亮完整回响', await page.locator('.medallion.complete').count() === 1);
        await page.getByRole('button', { name: '领取', exact: true }).click();
        check('满包奖励留在存档且显示待领取', await page.locator('.pending-loot').isVisible()
            && await page.evaluate(() => window.__SEAPP_DOMAIN__.progress.getVictoryLoot().length === 1));
        await page.getByRole('button', { name: '整理背包', exact: true }).click();
        check('终章可打开背包', await ui() === 'inventory');
        await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.fromSnapshot({ capacity: 20, slots: [], equipped: { main: null, sub: null } }));
        await page.keyboard.press('Escape'); await page.locator('.ending-content:visible').waitFor();
        check('关闭背包回到结算且不重播演出', await ui() === 'victory' && await page.locator('.is-intro').count() === 0);
        await page.getByRole('button', { name: '领取', exact: true }).click();
        check('腾出空间后领取一次并清空待领取', await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.countItem('itm_potion_hp_l') === 2
            && window.__SEAPP_DOMAIN__.progress.getVictoryLoot().length === 0));
        await page.getByRole('button', { name: '返回标题', exact: true }).click();
        await page.waitForFunction(() => !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await enter(); const replay = await lastHit();
        check('再次打败最终 Boss 仍进入终章', replay.state === 'victory' && replay.unchanged, replay);
        await page.locator('.ending-content:visible').waitFor({ timeout: 2500 });
        check('重玩使用简短演出', await page.locator('.is-intro').count() === 0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.getByRole('button', { name: '重看结局', exact: true }).click();
        check('减少动态效果时直接显示结算', await page.locator('.is-intro').count() === 0);
        check('浏览器控制台及资源请求无错误', errors.length === 0, errors);
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
    } catch (error) {
        await page.screenshot({ path: `${output}/victory-failure.png` }).catch(() => {});
        return { passed: cases.filter(c => c.passed).length, total: cases.length + 1, cases, errors: [...errors, String(error)] };
    } finally { await page.close(); }
}
