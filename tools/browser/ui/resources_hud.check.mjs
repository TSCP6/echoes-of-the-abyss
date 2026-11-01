/** 使用隔离 Chrome 验证资源说明、真实库存、弹药误耗和补给闭环。 */
async function checkResourcesHud(sourcePage, { url = 'http://127.0.0.1:8095' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    const cases = [], errors = [];
    const add = (name, passed, detail) => cases.push({ name, passed, ...(passed ? {} : { detail }) });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        const key = async value => { await page.keyboard.down(value); await page.waitForTimeout(100); await page.keyboard.up(value); await page.waitForTimeout(100); };
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.locator('.loading').waitFor({ state: 'detached' });
        await page.waitForTimeout(350);
        await page.getByRole('button', { name: '操作说明', exact: true }).click();
        await page.waitForTimeout(350);
        const help = await page.locator('.help').innerText();
        add('帮助说明流程、SKP/SP、强化材料、箭矢补给和真实商品价格', ['每区第 4 关', '技能点（SKP）', '技能能量（SP）', '遗迹残片', '18 金币 → 10 箭矢', '初始副手轻弩'].every(t => help.includes(t)), help);
        await page.screenshot({ path: 'output/resources-help-wide.png' });
        await page.setViewportSize({ width: 720, height: 960 });
        const layout = await page.locator('.help .panel').evaluate(el => {
            const r = el.getBoundingClientRect(); return { fits: r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth, scrollable: el.scrollHeight > el.clientHeight };
        });
        add('窄屏帮助不横向溢出且可滚动查看', layout.fits, layout);
        await page.getByRole('button', { name: '返回', exact: true }).scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: '返回', exact: true }).click();
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await page.evaluate(() => { window.__SEAPP__.game.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
        await page.waitForTimeout(300);
        let hud = await page.locator('.hud').innerText();
        add('HUD 明确三种资源和两手武器及弹药数', ['金币 0', '技能点 SKP 0', '强化残片 0', '遗迹短剑', '轻弩', '箭矢 20', '技能能量 SP'].every(t => hud.includes(t)), hud);
        const textures = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const shard = s.children.getByName('shard_shard_a');
            return { coin: s.pickups.coins[0].sprite.texture.key, shard: shard?.texture.key,
                arrow: [s.textures.get('projectile_player').source[0].width, s.textures.get('projectile_player').source[0].height] };
        });
        add('金币、碎片采用独立纹理；远程弹丸是横向箭形', textures.coin === 'pickup_coin' && textures.shard === 'pickup_skill_shard' && textures.arrow[0] === 34 && textures.arrow[1] === 12, textures);
        await key('k');
        const shot = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return { count: window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow'), active: s.projectiles.getActive().map(p => ({ texture: p.sprite.texture.key, size: [p.sprite.body.width, p.sprite.body.height] })) };
        });
        add('副手射击只消耗一支箭且保持原碰撞尺寸', shot.count === 19 && shot.active.some(p => p.texture === 'projectile_player' && p.size.every(n => n === 12)), shot);
        await key('j');
        add('主手近战不消耗弹药', await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow')) === 19);
        await key('Tab');
        await page.waitForSelector('.inv');
        await page.locator('.inv .cell').nth(1).click();
        add('正常点击背包箭矢不再误耗，提供实际射击指引', await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow')) === 19 && (await page.locator('.inv [role=status]').innerText()).includes('K / 鼠标右键'));
        await page.screenshot({ path: 'output/resources-inventory.png' });
        await page.getByRole('button', { name: '关闭（Tab）', exact: true }).click();
        await page.locator('.inv').waitFor({ state: 'detached' });
        await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.consumeItem('itm_arrow', 14));
        await page.waitForTimeout(150);
        hud = await page.locator('.hud').innerText();
        add('剩五发时显示数量与营地补给路径', hud.includes('箭矢 5') && hud.includes('弹药不足') && hud.includes('关卡选择 → 营地'), hud);
        await page.evaluate(() => { const s = window.__SEAPP_DOMAIN__.settings; s.remap('attackMain', 'L'); s.remap('interact', 'G'); });
        await page.waitForTimeout(100);
        hud = await page.locator('.hud').innerText();
        add('武器键位与补给提示跟随玩家重映射', hud.includes('L / 左键') && hud.includes('G 商店'), hud);
        await page.evaluate(() => { const s = window.__SEAPP_DOMAIN__.settings; s.remap('attackMain', 'J'); s.remap('interact', 'E'); });
        await page.waitForTimeout(100);
        await page.screenshot({ path: 'output/resources-hud-low-ammo.png' });
        await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.consumeItem('itm_arrow', 5));
        await page.waitForTimeout(800);
        await key('k');
        hud = await page.locator('.hud').innerText();
        add('空弹药提示明确，攻击不产生弹丸或负库存', hud.includes('弹药耗尽') && hud.includes('箭矢 0') && await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow') === 0 && window.__SEAPP__.game.scene.getScene('Level').projectiles.getActive().length === 0), hud);
        await page.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__; d.economy.addCoins(36); d.economy.addMaterial('itm_relic_shard', 3); d.skills.grantShardSkp();
        });
        await page.waitForTimeout(250);
        hud = await page.locator('.hud').innerText();
        add('金币、强化材料与技能点独立计数', ['金币 36', '强化残片 3', '技能点 SKP 1'].every(t => hud.includes(t)), hud);
        for (const [width, height] of [[1024, 768], [720, 960]]) {
            await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
            const fits = await page.locator('.bottomright').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
            add(`${width}×${height} 武器与补给提示完整显示`, fits);
        }
        await page.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoCamp(1));
        await page.waitForFunction(() => window.__SEAPP__.game.scene.isActive('Camp') && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await key('e');
        await page.waitForSelector('.shop');
        const row = page.locator('.shop .row').filter({ hasText: '箭矢' }).first();
        add('商店清楚显示每组箭矢数量与价格', (await row.innerText()).includes('×10') && (await row.innerText()).includes('18'));
        await row.getByRole('button', { name: '购买', exact: true }).click();
        const purchase = await page.evaluate(() => ({ arrows: window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow'), coins: window.__SEAPP_DOMAIN__.economy.getCoins() }));
        add('购买十支箭扣十八金币', purchase.arrows === 10 && purchase.coins === 18, purchase);
        await page.getByRole('button', { name: '关闭', exact: true }).click();
        await page.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoLevel('1-1'));
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready && window.__SEAPP__.game.scene.isActive('Level') && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await page.waitForTimeout(250);
        hud = await page.locator('.hud').innerText();
        add('补给后重返关卡显示十发并清除弹药警告', hud.includes('箭矢 10') && await page.locator('.ammo-warning').count() === 0, hud);
        const coinBefore = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.pickups.spawnCoinBurst({ x: s.player.sprite.x + 15, y: s.player.sprite.y }, 1);
            return window.__SEAPP_DOMAIN__.economy.getCoins();
        });
        await page.waitForTimeout(100);
        const coinPickup = await page.evaluate(() => ({ coins: window.__SEAPP_DOMAIN__.economy.getCoins(),
            label: window.__SEAPP__.game.scene.getScene('Level').children.list.some(o => o.text === '+1 金币') }));
        add('实际拾取金币有名称浮字并增加金币', coinPickup.coins === coinBefore + 1 && coinPickup.label, coinPickup);
        const skpBefore = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const shard = s.ctx.shards[0]; s.player.teleportTo(shard.x, shard.y);
            return window.__SEAPP_DOMAIN__.skills.skpBalance;
        });
        await page.waitForTimeout(100);
        const shardPickup = await page.evaluate(() => ({ skp: window.__SEAPP_DOMAIN__.skills.skpBalance,
            label: window.__SEAPP__.game.scene.getScene('Level').children.list.some(o => o.text === '回响碎片 +1 技能点') }));
        add('实际拾取回响碎片获得技能点并显示专用浮字', shardPickup.skp === skpBefore + 1 && shardPickup.label, shardPickup);
        add('浏览器无脚本和控制台错误', errors.length === 0, errors);
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
    } finally { await browser.close(); }
}
