/** 独立浏览器调用：奖励倍率、重试防重领、实际存档与通关档位。 */
async function checkReplay(page, { url = 'http://localhost:8098' } = {}) {
    const cases = [], errors = [];
    const add = (name, passed, detail) => cases.push({ name, passed, detail });
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    page.on('console', m => { if (m.type() === 'error') {errors.push(m.text()); console.log('CONSOLE',m.text());} });
    const boot = async () => { await page.goto(url); await page.waitForFunction(() => window.__SEAPP_UI__?.booted); };
    await boot();
    await page.getByRole('button', { name: '关卡选择', exact: true }).click();
    await page.getByRole('button', { name: '1-1', exact: true }).click();
    const ready = () => page.waitForFunction(() => {
        const s = window.__SEAPP__.game.scene.getScene('Level');
        return s.ready && s.levelId === '1-1' && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
    });
    const enter = async () => {
        await page.evaluate(() => document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel('1-1'));
        await ready();
    };
    await ready();
    for (const [count, hp, coins] of [[0, 30, 20], [1, 33, 13], [2, 36, 8], [3, 39, 5], [4, 39, 5]]) {
        const result = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const d = window.__SEAPP_DOMAIN__;
            const enemy = s.enemies.getEntities()[0];
            // 清空显示池只为隔离本断言，不改变领域账本或存档。
            for (const c of s.pickups.coins) { c.active = false; c.sprite.setVisible(false); }
            const before = d.economy.getCoins();
            s.pickups.spawnCoinBurst(s.ctx.spawn, 20);
            for (const c of s.pickups.coins.filter(c => c.active)) {
                s.player.teleportTo(c.sprite.x, c.sprite.y); s.pickups.update(0);
            }
            return { count: d.progress.getClearCount('1-1'), hp: enemy.hp, contact: enemy.def.contactDamage,
                coins: d.economy.getCoins() - before };
        });
        console.log('TIER',count,JSON.stringify(result));
        add(`通关${count}次后的实际敌人与金币`, result.count === count && result.hp === hp && result.coins === coins && result.contact === 5, result);
        if (count === 0) {
            await ready();
            const guard = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const d = window.__SEAPP_DOMAIN__;
                const enemy = s.enemies.getEntities()[0];
                s.combat.setRng(() => 0.5);
                s.combat.areaDamage(enemy.sprite.x, enemy.sprite.y, 1, 10000);
                const claimed = d.progress.toSnapshot().runRewards['1-1'].includes(enemy.rewardKey);
                s.respawn();
                const active = s.pickups.coins.filter(c => c.active).length;
                s.combat.areaDamage(enemy.sprite.x, enemy.sprite.y, 1, 10000);
                const noRepeat = s.pickups.coins.filter(c => c.active).length === active;
                s.enemies.summonAt(s.ctx.spawn.x + 100, s.ctx.spawn.y, 'enm_patrol');
                const summon = s.enemies.getSummons()[0];
                const beforeSummon = s.pickups.coins.filter(c => c.active).length;
                s.combat.areaDamage(summon.sprite.x, summon.sprite.y, 1, 10000);
                const summonNoReward = s.pickups.coins.filter(c => c.active).length === beforeSummon;
                d.save.markDirty(); d.save.write(0);
                return { claimed, noRepeat, summonNoReward, key: enemy.rewardKey, count: d.progress.getClearCount('1-1') };
            });
            add('死亡重试不加档、不重复掉落，召唤物无金币', guard.claimed && guard.noRepeat && guard.summonNoReward && guard.count === 0, guard);
            await boot();
            const restored = await page.evaluate(key => {
                const d = window.__SEAPP_DOMAIN__;
                return { count: d.progress.getClearCount('1-1'), duplicate: d.progress.claimRunReward('1-1', key) };
            }, guard.key);
            add('刷新读档保持同轮奖励账本', restored.count === 0 && !restored.duplicate, restored);
            await enter();
        }
        await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').onGoalReached());
        await page.waitForFunction(() => !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        if (count < 4) { await enter(); }
    }
    return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
}
