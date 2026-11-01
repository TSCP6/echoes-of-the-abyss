/** 隔离 Chrome 的营地/机关/Boss 单点回归；传送与直接伤害仅用于构造测试状态。 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function checkWorldInteractions(source, {
    url = 'http://127.0.0.1:8098', outputDir = 'output/playwright/world-interactions',
    onProgress = () => {}
} = {}) {
    const browserType = source.context ? source.context().browser().browserType() : source;
    const browser = await browserType.launch({ channel: 'chrome', headless: true,
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows'] });
    const cases = [], errors = [], screenshots = [];
    const add = (name, passed, detail = null) => {
        cases.push({ name, passed, detail });
        onProgress({ name, passed, detail });
    };
    await mkdir(outputDir, { recursive: true });
    let page;
    try {
        page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); } });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted && window.__SEAPP_DOMAIN__);
        const idle = async milliseconds => {
            const until = Date.now() + milliseconds;
            while (Date.now() < until) {
                await page.evaluate(() => window.__SEAPP__.game.loop.frame);
                await page.waitForTimeout(Math.min(80, Math.max(1, until - Date.now())));
            }
        };
        const press = async key => {
            await page.keyboard.down(key); await idle(140); await page.keyboard.up(key); await idle(80);
        };
        const ui = state => page.waitForFunction(expected => window.__SEAPP_UI__.state === expected, state);
        const camp = async id => {
            await page.evaluate(id => document.querySelector('.ui-layer').__vueParentComponent.exposed.enterCamp(id), id);
            await page.waitForFunction(id => {
                const s = window.__SEAPP__.game.scene.getScene('Camp');
                return window.__SEAPP_UI__.sceneKey === 'Camp' && s.sceneId === id && s.scene.isActive()
                    && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
            }, id);
            await page.mouse.move(5, 5);
            await idle(350);
        };
        const level = async id => {
            await page.evaluate(id => document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel(id), id);
            await page.waitForFunction(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return window.__SEAPP_UI__.sceneKey === 'Level' && s.ready && s.levelId === id && s.scene.isActive()
                    && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
            }, id);
            await page.evaluate(() => { window.__SEAPP__.game.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
            await idle(120);
        };
        const shot = async name => {
            const path = resolve(outputDir, `${name}.png`);
            await page.screenshot({ path }); screenshots.push(path);
        };
        const canvasPoint = name => page.evaluate(name => {
            const s = window.__SEAPP__.game.scene.getScene('Camp');
            const zone = s.children.getByName(name), c = s.cameras.main;
            const rect = s.game.canvas.getBoundingClientRect();
            return { x: rect.left + ((zone.x - c.scrollX) * c.zoom + c.x) / s.scale.gameSize.width * rect.width,
                y: rect.top + ((zone.y - c.scrollY) * c.zoom + c.y) / s.scale.gameSize.height * rect.height };
        }, name);
        await page.evaluate(() => window.__SEAPP_DOMAIN__.economy.addCoins(5000));

        for (const id of [1, 2, 3]) {
            try {
                await camp(id);
                for (const [width, height] of [[1024, 768], [1600, 900], [800, 1000]]) {
                    await page.setViewportSize({ width, height }); await idle(350);
                    const layout = await page.evaluate(() => {
                        const s = window.__SEAPP__.game.scene.getScene('Camp'), c = s.cameras.main;
                        const names = ['camp-resources', 'camp-merchant', 'camp-portal'];
                        return { scene: s.sceneId, viewport: [c.width, c.height],
                            visible: names.map(name => { const b = s.children.getByName(name).getBounds();
                                return { name, inside: b.left >= c.worldView.left && b.right <= c.worldView.right
                                    && b.top >= c.worldView.top && b.bottom <= c.worldView.bottom }; }),
                            coins: s.children.getByName('camp-resources').text };
                    });
                    add(`营地${id} ${width}×${height} 设施及资源栏在视野内`, layout.visible.every(v => v.inside), layout);
                    await shot(`camp-${id}-${width}x${height}`);
                }
                await page.setViewportSize({ width: 1024, height: 768 }); await idle(250);
                const point = await canvasPoint('camp-merchant');
                await page.mouse.click(point.x, point.y); await ui('shop');
                add(`营地${id} 鼠标商人打开商店`, await page.locator('.shop').isVisible());
                const before = await page.evaluate(() => window.__SEAPP_DOMAIN__.economy.getCoins());
                const row = page.locator('.shop .row').filter({ has: page.getByRole('button', { name: '购买', exact: true }) }).first();
                const price = Number((await row.locator('.price').innerText()).replace(/\D/g, ''));
                await row.getByRole('button', { name: '购买', exact: true }).click();
                await idle(120);
                const after = await page.evaluate(() => window.__SEAPP_DOMAIN__.economy.getCoins());
                const displayed = Number((await page.locator('.shop .coins').innerText()).replace(/\D/g, ''));
                add(`营地${id} 实际购买扣款且商店余额更新`, after === before - price && displayed === after,
                    { before, price, after, displayed });
                await press('Escape'); await ui('none');
                const resources = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').children.getByName('camp-resources').text);
                add(`营地${id} 关店后资源栏同步购买余额`, resources.includes(String(after)), resources);
                await page.mouse.move(5, 5);
                await press('e'); await ui('shop');
                add(`营地${id} 默认E打开当前商人`, true);
                await press('Escape'); await ui('none');
                await press('d'); await press('e'); await ui('levelSelect');
                add(`营地${id} D再E进入选关`, await page.locator('.select').isVisible());
                await camp(id); await press('d'); await press('Enter'); await ui('levelSelect');
                add(`营地${id} D再Enter进入选关`, await page.locator('.select').isVisible());
                await camp(id); await press('Escape'); await ui('paused');
                const paused = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').scene.isPaused());
                await press('Escape'); await ui('none'); await idle(250);
                const resumed = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').scene.isActive());
                add(`营地${id} Esc暂停和恢复且不会立刻重开`, paused && resumed && await page.evaluate(() => window.__SEAPP_UI__.state === 'none'));
            } catch (error) {
                add(`营地${id} 流程未完成`, false, String(error));
                await shot(`camp-${id}-failure`).catch(() => {});
            }
        }
        try {
            await camp(1); await press('Escape'); await ui('paused');
            await page.getByRole('button', { name: '设置', exact: true }).click(); await ui('settings');
            for (const [label, key] of [['交互', 'Q'], ['向右移动', 'L']]) {
                page.once('dialog', dialog => dialog.accept(key));
                await page.getByRole('button', { name: new RegExp(`^${label}：`) }).click();
                await page.getByRole('status').filter({ hasText: `设为 ${key}` }).waitFor();
            }
            await page.getByRole('button', { name: '返回', exact: true }).click(); await ui('paused');
            await press('Escape'); await ui('none');
            const instructions = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Camp').controls.text);
            await press('d'); await press('e');
            const oldInactive = await page.evaluate(() => window.__SEAPP_UI__.state === 'none'
                && window.__SEAPP__.game.scene.getScene('Camp').navigation.focused === 'merchant');
            await press('l'); await press('q'); await ui('levelSelect');
            add('设置面板真实重映射L/Q，营地提示更新且旧D/E失效、新键可选关', oldInactive && instructions.includes('L') && instructions.includes('Q'), instructions);
            await page.evaluate(() => { const s = window.__SEAPP_DOMAIN__.settings; s.remap('interact', 'E'); s.remap('moveRight', 'D'); });
        } catch (error) { add('营地按键重映射流程未完成', false, String(error)); }

        try {
            await level('3-3');
            const activate = async order => {
                await page.evaluate(order => {
                    const s = window.__SEAPP__.game.scene.getScene('Level');
                    const d = s.ctx.devices.find(d => d.kind === 'switch' && d.order === order);
                    s.player.teleportTo(d.x, d.y);
                }, order);
                await idle(100); await press('e');
            };
            const deviceState = () => page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return { switches: s.ctx.devices.filter(d => d.kind === 'switch').sort((a, b) => a.order - b.order)
                    .map(d => ({ id: d.id, order: d.order, active: s.devices.state.isActive(d.id) })),
                    gates: s.devices.views.filter(v => v.def.kind === 'gate').map(v => ({ id: v.def.id, enabled: v.body.enable })),
                    message: s.devices.message.text, ui: window.__SEAPP_UI__.state };
            });
            await activate(1); await activate(3);
            const wrong = await deviceState();
            add('3-3 真实E以1→3错误顺序激活会清空符文并保持封门', wrong.switches.every(s => !s.active)
                && wrong.gates.every(g => g.enabled) && wrong.message.includes('顺序错误'), wrong);
            for (const order of [1, 2, 3]) { await activate(order); }
            const correct = await deviceState();
            add('3-3 真实E按1→2→3激活后实体门body.enable=false', correct.switches.every(s => s.active)
                && correct.gates.length > 0 && correct.gates.every(g => !g.enabled), correct);
            await shot('runes-correct-open');
            await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                window.__switchLabelCalls = [];
                for (const v of s.devices.views.filter(v => v.def.kind === 'switch')) {
                    const count = { id: v.def.id, calls: 0 };
                    window.__switchLabelCalls.push(count);
                    const original = v.label.setColor;
                    v.label.setColor = function (...args) { count.calls++; return original.apply(this, args); };
                }
            });
            await idle(400);
            const repaint = await page.evaluate(() => window.__switchLabelCalls);
            add('3-3 符文状态不变时不逐帧重绘文字颜色', repaint.every(v => v.calls === 0), repaint);
            await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').respawn()); await idle(100);
            const reset = await deviceState();
            add('3-3 检查点重试清空机关并重新启用实体门', reset.switches.every(s => !s.active) && reset.gates.every(g => g.enabled), reset);
        } catch (error) { add('3-3 符文流程未完成', false, String(error)); }

        try {
            await level('2-2');
            const stand = () => page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const d = s.ctx.devices.find(d => d.kind === 'crumble');
                s.player.teleportTo(d.x + d.width / 2, d.y - 34);
            });
            const crumble = () => page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level'), v = s.devices.views.find(v => v.def.kind === 'crumble');
                return { phase: v.crumble.phase, elapsed: v.crumble.elapsed, enabled: v.body.enable, now: s.time.now, dead: s.dead };
            });
            await stand();
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').devices.views.find(v => v.def.kind === 'crumble').crumble.phase === 'warning');
            const start = await crumble(); await shot('crumble-warning');
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').devices.views.find(v => v.def.kind === 'crumble').crumble.phase === 'missing');
            const missing = await crumble();
            add('2-2 实际站立约1秒后崩塌并关闭碰撞体', !missing.enabled && missing.now - start.now >= 850 && missing.now - start.now <= 1450,
                { start, missing, milliseconds: missing.now - start.now });
            await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); s.player.teleportTo(s.ctx.spawn.x, s.ctx.spawn.y); });
            await shot('crumble-missing');
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').devices.views.find(v => v.def.kind === 'crumble').crumble.phase === 'stable', undefined, { timeout: 7000 });
            const restored = await crumble();
            add('2-2 消失约3秒后复原并恢复碰撞体', restored.enabled && !restored.dead
                && restored.now - missing.now >= 2850 && restored.now - missing.now <= 3500,
            { restored, milliseconds: restored.now - missing.now });
            await stand();
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').devices.views.find(v => v.def.kind === 'crumble').crumble.phase === 'warning');
            await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').respawn()); await idle(100);
            const retry = await crumble();
            add('2-2 重试清除崩塌计时并恢复实体', retry.phase === 'stable' && retry.elapsed === 0 && retry.enabled, retry);
            await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const def = { id: 'test-thin-crumble', kind: 'crumble', x: s.ctx.spawn.x + 80,
                    y: s.ctx.spawn.y, width: 160, height: 2, group: '', order: 0, label: '' };
                window.__thinPlatform = new s.devices.constructor(s, s.player, [def]);
                s.player.teleportTo(def.x + def.width / 2, def.y - 36);
            });
            await page.waitForFunction(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level'), v = window.__thinPlatform.views[0];
                return Math.abs(s.player.body.bottom - v.def.y) < 0.1 && s.player.body.blocked.down;
            });
            const thin = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level'), v = window.__thinPlatform.views[0], b = v.shape.getBounds();
                return { mapHeight: v.def.height, shapeHeight: v.shape.height, bodyHeight: v.body.height,
                    mapTop: v.def.y, shapeTop: b.top, bodyTop: v.body.top, playerFoot: s.player.body.bottom };
            });
            add('实际画布2px薄脆桥尺寸保持2px，真实落脚与图形和碰撞顶面一致', thin.mapHeight === 2
                && thin.shapeHeight === 2 && thin.bodyHeight === 2 && Math.abs(thin.shapeTop - thin.mapTop) < 0.1
                && Math.abs(thin.bodyTop - thin.mapTop) < 0.1 && Math.abs(thin.playerFoot - thin.mapTop) < 0.1, thin);
            await shot('crumble-thin-2px');
            await page.evaluate(() => { window.__thinPlatform.destroy(); delete window.__thinPlatform; });
        } catch (error) { add('2-2 崩塌流程未完成', false, String(error)); }

        for (const id of ['1-4', '2-4', '3-4']) {
            try {
                await level(id);
                const before = await page.evaluate(() => ({ progress: window.__SEAPP_DOMAIN__.progress.toSnapshot(), skp: window.__SEAPP_DOMAIN__.skills.skpBalance }));
                await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); s.player.teleportTo(s.ctx.goal.centerX, s.ctx.goal.centerY); });
                await idle(350);
                const blocked = await page.evaluate(id => {
                    const s = window.__SEAPP__.game.scene.getScene('Level');
                    return { alive: s.enemies.getBoss() !== null, reached: s.pickups.goalReached,
                        cleared: window.__SEAPP_DOMAIN__.progress.isCleared(id), ui: window.__SEAPP_UI__.state,
                        skp: window.__SEAPP_DOMAIN__.skills.skpBalance, progress: window.__SEAPP_DOMAIN__.progress.toSnapshot() };
                }, id);
                add(`${id} Boss存活时终点不结算、不解锁、不发奖励`, blocked.alive && !blocked.reached && !blocked.cleared
                    && blocked.ui === 'none' && blocked.skp === before.skp
                    && JSON.stringify(before.progress.clearedLevels) === JSON.stringify(blocked.progress.clearedLevels)
                    && JSON.stringify(before.progress.unlockedLevels) === JSON.stringify(blocked.progress.unlockedLevels), blocked);
                await page.evaluate(() => {
                    const s = window.__SEAPP__.game.scene.getScene('Level'), b = s.enemies.getBoss();
                    s.player.teleportTo(b.sprite.x - Math.min(100, b.def.detectRange / 2), b.sprite.y);
                });
                await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').arena.isActive);
                const bounds = await page.evaluate(() => {
                    const s = window.__SEAPP__.game.scene.getScene('Level'), b = s.enemies.getBoss(), r = s.ctx.bossArena;
                    b.invincibleUntil = s.time.now + 100000;
                    return { player: s.player.body.collideWorldBounds, boss: b.body.collideWorldBounds,
                        left: r.left, right: r.right, floor: r.bottom };
                });
                add(`${id} 按实际地图arena启用双方物理封锁`, bounds.player && bounds.boss, bounds);
                for (const [direction, key] of [[-1, 'a'], [1, 'd']]) {
                    await page.evaluate(direction => {
                        const s = window.__SEAPP__.game.scene.getScene('Level'), r = s.ctx.bossArena;
                        s.player.teleportTo(direction < 0 ? r.left + s.player.body.width / 2 + 1 : r.right - s.player.body.width / 2 - 1,
                            r.bottom - 32);
                    }, direction);
                    await page.keyboard.down(key); await idle(400);
                    const position = await page.evaluate(() => {
                        const s = window.__SEAPP__.game.scene.getScene('Level');
                        return { left: s.player.body.left, right: s.player.body.right, blocked: { left: s.player.body.blocked.left, right: s.player.body.blocked.right },
                            min: s.ctx.bossArena.left, max: s.ctx.bossArena.right };
                    });
                    await page.keyboard.up(key);
                    add(`${id} 持续向${direction < 0 ? '左' : '右'}真实输入不能穿越锁场边界`, position.left >= position.min - 0.1
                        && position.right <= position.max + 0.1 && (direction < 0 ? position.blocked.left : position.blocked.right), position);
                }
                await shot(`boss-${id}-locked`);
                await page.evaluate(() => {
                    const s = window.__SEAPP__.game.scene.getScene('Level'), b = s.enemies.getBoss();
                    s.player.teleportTo(s.ctx.bossArena.centerX, s.ctx.bossArena.bottom - 32);
                    b.invincibleUntil = 0; b.applyHit(b.hp + 1, s.player.sprite.x);
                });
                await page.waitForFunction(() => !window.__SEAPP__.game.scene.getScene('Level').arena.isActive);
                const released = await page.evaluate(() => {
                    const s = window.__SEAPP__.game.scene.getScene('Level');
                    return { arena: s.arena.isActive, player: s.player.body.collideWorldBounds, visible: s.arena.graphics.visible };
                });
                add(`${id} 测试接缝击败Boss后解除封锁`, !released.arena && !released.player && !released.visible, released);
                await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').respawn()); await idle(120);
                const retry = await page.evaluate(() => {
                    const s = window.__SEAPP__.game.scene.getScene('Level');
                    return { alive: s.enemies.getBoss() !== null, arena: s.arena.isActive, player: s.player.body.collideWorldBounds,
                        engaged: s.enemies.getBoss().bossEngaged, x: s.player.sprite.x, entrance: s.ctx.bossArena.left };
                });
                add(`${id} 重试恢复Boss且回入口外、无残留封锁`, retry.alive && !retry.arena && !retry.player && !retry.engaged && retry.x < retry.entrance, retry);
            } catch (error) { add(`${id} Boss单点回归未完成`, false, String(error)); }
        }
        try {
            const fixture = await page.evaluate(async () => {
                const game = window.__SEAPP__.game, key = 'map_3-3', stored = game.cache.tilemap.get(key);
                // Phaser 已使用过的缓存可带运行时对象；从发布的实际 JSON 构造纯数据夹具。
                const raw = await (await fetch('/assets/levels/3-3.json')).json();
                const cloned = { format: stored.format, data: raw };
                const obj = cloned.data.layers.find(l => l.name === 'mechanisms').objects.find(o => o.type === 'switch');
                const id = obj.name;
                obj.class = obj.type; delete obj.type;
                window.__classFixture = stored;
                game.cache.tilemap.remove(key); game.cache.tilemap.add(key, cloned);
                return { id, typeAbsent: !('type' in obj), class: obj.class };
            });
            await level('3-3');
            const loaded = await page.evaluate(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level'), device = s.ctx.devices.find(d => d.id === id);
                const cache = s.game.cache.tilemap;
                cache.remove('map_3-3'); cache.add('map_3-3', window.__classFixture); delete window.__classFixture;
                return device?.kind;
            }, fixture.id);
            add('实际Tiled缓存仅class而无type的switch可经loader加载', fixture.typeAbsent && loaded === 'switch', { fixture, loaded });
        } catch (error) { add('Tiled class兼容回归未完成', false, String(error)); }
        try {
            await page.evaluate(async () => { window.__worldBus = (await import('/src/game/EventBus.ts')).EventBus; });
            const listeners = () => page.evaluate(() => {
                const game = window.__SEAPP__.game, bus = window.__worldBus;
                return { resize: game.scale.listenerCount('resize'), settings: bus.listenerCount('settings:changed'),
                    overlay: bus.listenerCount('ui:overlay'), blur: game.events.listenerCount('blur') };
            });
            await camp(1); const campBaseline = await listeners();
            await level('1-1'); const levelBaseline = await listeners();
            const samples = [];
            for (let iteration = 0; iteration < 10; iteration++) {
                const region = iteration % 3 + 1;
                await camp(region); const campCounts = await listeners();
                await level(`${region}-1`); const levelCounts = await listeners();
                samples.push({ iteration: iteration + 1, region, camp: campCounts, level: levelCounts });
            }
            add('10轮营地↔关卡切换后resize/settings/overlay/blur监听数保持稳定', samples.every(sample =>
                JSON.stringify(sample.camp) === JSON.stringify(campBaseline)
                && JSON.stringify(sample.level) === JSON.stringify(levelBaseline)), { campBaseline, levelBaseline, samples });
        } catch (error) { add('10轮场景监听稳定性检查未完成', false, String(error)); }
        add('隔离Chrome无pageerror及console.error', errors.length === 0, errors);
        return { passed: cases.every(c => c.passed), cases, errors, screenshots,
            scope: '营地真实鼠标/键盘交互；机关/Boss为传送构造位置的单点回归，Boss直接伤害仅验证门禁解除，不代表正常战斗通关' };
    } catch (error) {
        return { passed: false, cases, errors, screenshots, error: String(error),
            state: await page?.evaluate(() => ({ ui: window.__SEAPP_UI__?.state, scene: window.__SEAPP_UI__?.sceneKey, text: document.body.innerText })).catch(() => null) };
    } finally { await browser.close(); }
}
