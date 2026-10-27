/** 独立浏览器/存储验证技能、弹药换装、单向平台和悬浮金币。 */
export async function checkControlsAndPickups(chromium, url = 'http://localhost:8103') {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const cases = [], errors = [];
    const add = (name, passed, detail) => cases.push({ name, passed, ...(passed ? {} : { detail }) });
    try {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        const key = async k => { await p.keyboard.down(k); await p.waitForTimeout(90); await p.keyboard.up(k); await p.waitForTimeout(60); };
        const ready = () => p.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        const state = () => p.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); return {
            x: s.player.sprite.x, y: s.player.sprite.y, bottom: s.player.body.bottom, vy: s.player.body.velocity.y,
            resources: window.__SEAPP_DOMAIN__.resources.getSnapshot(),
            arrows: window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow'), darts: window.__SEAPP_DOMAIN__.inventory.countItem('itm_dart'),
            shots: s.projectiles.getActive().length, notices: s.children.list.filter(o => typeof o.text === 'string').map(o => o.text)
        }; });
        await p.goto(url); await p.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await p.getByRole('button', { name: '关卡选择', exact: true }).click();
        await p.getByRole('button', { name: '1-1', exact: true }).click(); await ready();
        await p.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__;
            for (const level of ['1-1', '1-2', '1-3', '1-4']) for (const shard of ['shard_a', 'shard_b', 'shard_c']) { d.progress.collectShard(level, shard); d.skills.grantShardSkp(); }
            window.__SEAPP__.game.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER;
        });
        await key('y'); await p.waitForSelector('.tree');
        const nodes = await p.locator('.tree .node').allTextContents();
        add('21 个技能全部显示中文名称', nodes.length === 21 && nodes.every(t => !t.includes('sk_') && /[\u4e00-\u9fff]/.test(t)), nodes);
        for (const [width, height] of [[1024, 768], [720, 960]]) {
            await p.setViewportSize({ width, height });
            const fits = await p.locator('.tree .panel').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth; });
            add(`${width}×${height} 技能树无横向溢出且关闭按钮可见`, fits && await p.getByRole('button', { name: '关闭（Y）', exact: true }).isVisible());
        }
        await p.setViewportSize({ width: 1280, height: 800 });
        await p.locator('[data-skill=sk_whirlwind]').hover();
        let text = await p.locator('#skill-details').innerText();
        add('悬停显示真实伤害范围、消耗冷却和中文前置', ['25', '80px', '20 SP', '6 秒', '刃影专注'].every(t => text.includes(t)), text);
        const learn = async id => { await p.locator(`[data-skill=${id}]`).click(); await p.locator('#skill-details .btn').first().click(); };
        await learn('sk_dash');
        add('学习主动技能后自动填入第一个空槽', await p.evaluate(() => window.__SEAPP_DOMAIN__.skills.getLoadout()[0] === 'sk_dash'));
        await p.locator('.tree .slot').nth(3).click();
        await p.getByRole('button', { name: '绑定到 4 键', exact: true }).click();
        add('手动改绑即时刷新且不会重复占槽', (await p.locator('.tree .slot').nth(3).innerText()).includes('回响冲刺') && await p.evaluate(() => window.__SEAPP_DOMAIN__.skills.getLoadout().filter(id => id === 'sk_dash').length === 1));
        await learn('sk_heal'); await learn('sk_bolt_steady'); await learn('sk_multishot'); await learn('sk_ruin_tough1');
        text = await p.locator('#skill-details').innerText();
        add('被动不占技能栏并实际提高生命上限', text.includes('永久生效') && await p.evaluate(() => window.__SEAPP_DOMAIN__.resources.getSnapshot().hpMax === 120 && !window.__SEAPP_DOMAIN__.skills.getLoadout().includes('sk_ruin_tough1')));
        await p.screenshot({ path: 'output/skills-tree-after.png' });
        await p.getByRole('button', { name: '关闭（Y）', exact: true }).click(); await p.locator('.tree').waitFor({ state: 'detached' });
        const hud = await p.locator('.hud').innerText();
        await p.screenshot({ path: 'output/skills-hud-after.png' });
        add('HUD 技能栏显示中文名称与未绑定槽', ['治疗祷言', '多重射击', '回响冲刺', '待绑定'].every(t => hud.includes(t)), hud);
        const beforeDash = await state(); await key('4'); await p.waitForTimeout(150); const afterDash = await state();
        add('按绑定键实际冲刺并消耗能量', afterDash.x - beforeDash.x > 130 && afterDash.resources.sp < beforeDash.resources.sp, { beforeDash, afterDash });
        await p.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); s.player.teleportTo(s.ctx.spawn.x, s.ctx.spawn.y); window.__SEAPP_DOMAIN__.resources.refill(); });
        await key('2'); const multi = await state();
        add('初始远程武器在副手时多重射击也能发射三枚弹丸', multi.shots === 3 && multi.arrows === 20, multi);
        await p.evaluate(() => { const d = window.__SEAPP_DOMAIN__; d.resources.refill(); d.resources.applyDamage(40); });
        await key('1'); const heal = await state();
        add('治疗技能恢复配置的生命值', heal.resources.hp === 115, heal.resources);
        await key('1'); const cooldown = await state();
        add('冷却时明确提示且不重复扣 SP', cooldown.resources.sp === heal.resources.sp && cooldown.notices.some(t => t.includes('冷却中')), cooldown);
        await key('3');
        add('未绑定技能给出学习指引', (await state()).notices.some(t => t.includes('未绑定')));
        await p.evaluate(() => { window.__SEAPP_DOMAIN__.save.markDirty(); window.__SEAPP_DOMAIN__.save.queueWrite(); });
        await p.waitForTimeout(500); await p.reload(); await p.waitForFunction(() => window.__SEAPP_UI__?.booted);
        add('技能学习与绑定刷新页面后保留，生命上限不重复叠加', await p.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__; return d.skills.getLoadout()[3] === 'sk_dash' && d.skills.getLoadout()[1] === 'sk_multishot' && d.resources.getSnapshot().hpMax === 120;
        }));
        await p.getByRole('button', { name: '继续游戏', exact: true }).click(); await ready();
        await p.evaluate(() => { window.__SEAPP__.game.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
        const platform = await p.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const tiles = s.ctx.onewayGroup.getTilesWithin().filter(t => t.index > 0);
            const top = tiles.find(t => tiles.some(lower => lower.pixelX === t.pixelX && lower.pixelY > t.pixelY + 32 && lower.pixelY <= t.pixelY + 128));
            const lower = tiles.filter(t => t.pixelX === top.pixelX && t.pixelY > top.pixelY).sort((a, b) => a.pixelY - b.pixelY)[0];
            const x = top.pixelX + 16; s.player.teleportTo(x, top.pixelY - 90); return { x, top: top.pixelY, lower: lower.pixelY };
        });
        await p.waitForFunction(top => { const b = window.__SEAPP__.game.scene.getScene('Level').player.body; return b.blocked.down && Math.abs(b.bottom - top) < 2; }, platform.top);
        await key(' '); const jump = await state();
        add('单向平台上普通跳跃仍向上', jump.vy < 0 && jump.bottom < platform.top, jump);
        await p.waitForFunction(top => { const b = window.__SEAPP__.game.scene.getScene('Level').player.body; return b.blocked.down && Math.abs(b.bottom - top) < 2; }, platform.top);
        await p.keyboard.down('s'); await key(' '); await p.keyboard.up('s');
        await p.waitForFunction(lower => { const b = window.__SEAPP__.game.scene.getScene('Level').player.body; return b.blocked.down && Math.abs(b.bottom - lower) < 2; }, platform.lower);
        add('S 加跳下穿当前平台，在更下方平台落地', Math.abs((await state()).bottom - platform.lower) < 2);
        await p.evaluate(platform => { const s = window.__SEAPP__.game.scene.getScene('Level'); s.player.teleportTo(platform.x, platform.top - 90); }, platform);
        await p.waitForFunction(top => { const b = window.__SEAPP__.game.scene.getScene('Level').player.body; return b.blocked.down && Math.abs(b.bottom - top) < 2; }, platform.top);
        await p.keyboard.down('ArrowDown'); await key(' '); await p.keyboard.up('ArrowDown');
        await p.waitForFunction(lower => { const b = window.__SEAPP__.game.scene.getScene('Level').player.body; return b.blocked.down && Math.abs(b.bottom - lower) < 2; }, platform.lower);
        add('方向下加跳同样可下穿且碰撞恢复', Math.abs((await state()).bottom - platform.lower) < 2);
        const coin = await p.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const coin = s.pickups.coins.find(c => !c.active);
            s.pickups.spawnCoinBurst({ x: 2015, y: 200 }, 1); window.__testCoin = coin;
            return { x: coin.sprite.x, y: coin.sprite.y, noBody: !coin.sprite.body };
        });
        await p.waitForTimeout(1400);
        const held = await p.evaluate(() => ({ x: window.__testCoin.sprite.x, y: window.__testCoin.sprite.y, active: window.__testCoin.active }));
        add('远处金币无刚体且持续悬浮，不依赖地面或平台碰撞', coin.noBody && held.active && held.x === coin.x && held.y === coin.y, { coin, held });
        const gold = await p.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); s.player.teleportTo(window.__testCoin.sprite.x, window.__testCoin.sprite.y); return window.__SEAPP_DOMAIN__.economy.getCoins(); });
        await p.waitForTimeout(100);
        add('悬浮金币接触仍可拾取且只计一次', await p.evaluate(gold => !window.__testCoin.active && window.__SEAPP_DOMAIN__.economy.getCoins() === gold + 1, gold));
        await p.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__; for (const id of ['1-1', '1-2', '1-3', '1-4']) d.progress.completeLevel(id);
            d.economy.addCoins(300); d.inventory.addItem('itm_dart', 5); window.__SEAPP_DIRECTOR__.director.gotoCamp(2);
        });
        await p.waitForFunction(() => window.__SEAPP__.game.scene.isActive('Camp') && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await key('e'); await p.waitForSelector('.shop');
        const dartRow = p.locator('.shop .row').filter({ hasText: '飞镖 ×10' }).first();
        add('商店标明飞镖对应飞镖枪', (await dartRow.innerText()).includes('用于飞镖枪'));
        await p.locator('.shop .row').filter({ hasText: '飞镖枪' }).filter({ has: p.getByRole('button', { name: '购买', exact: true }) }).last().getByRole('button', { name: '购买', exact: true }).click();
        await p.getByRole('button', { name: '关闭', exact: true }).click(); await p.locator('.shop').waitFor({ state: 'detached' });
        await p.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoLevel('1-1')); await ready();
        await key('Tab'); await p.waitForSelector('.inv');
        const dartSlot = await p.evaluate(() => window.__SEAPP_DOMAIN__.inventory.getSnapshot().slots.findIndex(s => s?.itemId === 'itm_dart'));
        await p.locator('.inv .cell').nth(dartSlot).click();
        add('背包说明未装备飞镖枪及第二区域购买条件', (await p.locator('.inv [role=status]').innerText()).includes('第 2 区域营地商店'));
        const gunSlot = await p.evaluate(() => window.__SEAPP_DOMAIN__.inventory.getSnapshot().slots.findIndex(s => s?.itemId === 'wpn_dartgun'));
        await p.locator('.inv .cell').nth(gunSlot).click(); await p.getByRole('button', { name: '装副手', exact: true }).click();
        add('显式装备按钮可将飞镖枪装到副手', await p.evaluate(() => window.__SEAPP_DOMAIN__.inventory.getSnapshot().equipped.sub === 'wpn_dartgun'));
        await p.screenshot({ path: 'output/ammo-equipment-after.png' });
        await p.getByRole('button', { name: '关闭（Tab）', exact: true }).click(); await p.locator('.inv').waitFor({ state: 'detached' });
        const ammoBefore = await state(); await key('k'); const ammoAfter = await state();
        add('两种弹药同时持有时飞镖枪消耗飞镖，不消耗箭矢', ammoBefore.darts === 5 && ammoAfter.darts === 4 && ammoAfter.arrows === ammoBefore.arrows, { ammoBefore, ammoAfter });
        add('浏览器无脚本或控制台异常', errors.length === 0, errors);
    } catch (e) { add('浏览器流程完整执行', false, String(e)); }
    finally { await browser.close(); }
    return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
}
