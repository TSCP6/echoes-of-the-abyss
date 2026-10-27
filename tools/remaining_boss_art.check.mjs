/** Isolated Chrome: imported boss clips, live skills, damage timing and cleanup. */
async function checkRemainingBossArt(sourcePage, { url = 'http://127.0.0.1:8094', screenshots = true } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    const cases = [];
    const errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); } });
        const add = (label, passed, detail) => cases.push({ label, passed, ...(passed ? {} : { detail }) });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.evaluate(() => window.__SEAPP_DOMAIN__.progress.completeLevel('1-1'));
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-2', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready);
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            // This pool instance is replaced on level entry; install capture in prime().
            window.__bossShotLog = [];
        });

        const enter = async id => {
            await page.evaluate(id => window.__SEAPP_DIRECTOR__.director.gotoLevel(id), id);
            await page.waitForFunction(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.ready && s.levelId === id && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
            }, id);
            await page.waitForTimeout(450);
        };
        const prime = async (phase, skill) => {
            await page.evaluate(({ phase, skill }) => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const b = s.enemies.getBoss();
                b.sprite.body.reset(2304, b.spawnPos.y);
                b.hp = b.def.hp * [1, 0.6, 0.3][phase];
                b.phaseIndex = phase;
                b.invincibleUntil = 0;
                b.bossAttack = null;
                b.bossEngaged = true;
                b.skillQueue = [skill];
                b.skillCooldown = 0;
                s.projectiles.clear();
                window.__bossShotLog = [];
                if (!s.projectiles.__captureInstalled) {
                    const spawn = s.projectiles.spawn.bind(s.projectiles);
                    s.projectiles.spawn = spec => { if (spec.side === 'enemy') { window.__bossShotLog.push(spec); } spawn(spec); };
                    s.projectiles.__captureInstalled = true;
                }
                s.hazards = [];
                s.enemies.events.onBossPhase(b, phase);
                s.player.teleportTo(2050, 796);
                s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            }, { phase, skill });
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.getBossAttack()?.stage === 'windup');
        };
        const screenshot = async name => {
            if (!screenshots) { return; }
            await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').scene.pause());
            await page.screenshot({ path: `output/boss-expansion/${name}.png` });
            await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').scene.resume());
        };
        for (const [id, prefix, size, summonPhase, summonIndex] of [
            ['2-4', 'spider', 160, 0, 0], ['3-4', 'echo', 200, 1, 2]
        ]) {
            await enter(id);
            const base = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
                return { texture: b.sprite.texture.key, size: b.sprite.width, count: s.enemies.getEntities().length,
                    w: b.body.width, h: b.body.height, engaged: b.bossEngaged };
            });
            add(`${id} dedicated art and unchanged hurtbox`, base.texture === `${prefix}_idle` && base.size === size
                && base.w === (prefix === 'spider' ? 88 : 64) && base.h === (prefix === 'spider' ? 72 : 88) && !base.engaged, base);
            await prime(summonPhase, summonIndex);
            const warning = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
                return { text: s.dangerFx.label.text, clip: b.sprite.anims.currentAnim.key, count: s.enemies.getEntities().length };
            });
            add(`${id} summon windup, no early spawn`, warning.count === base.count && warning.clip === `${prefix}-summon`
                && warning.text.includes(prefix === 'spider' ? '孵化' : '回响召唤'), warning);
            await screenshot(`${prefix}-summon-warning`);
            await page.waitForFunction(count => window.__SEAPP__.game.scene.getScene('Level').enemies.getEntities().length > count, base.count);
            const summons = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.enemies.getEntities().filter(e => e.def.kind !== 'boss').map(e => ({ x: e.sprite.x, y: e.sprite.y, texture: e.sprite.texture.key }));
            });
            add(`${id} distinct summoned creature art and positions`, summons.length === 2
                && summons.every(e => e.texture.startsWith(prefix === 'spider' ? 'spiderling_' : 'echo_spirit_'))
                && Math.abs(summons[0].x - summons[1].x) > 100, summons);
            await screenshot(`${prefix}-summons`);
            await page.waitForTimeout(1000);
            if (prefix === 'spider') {
                const grounded = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getEntities()
                    .filter(e => e.def.kind !== 'boss').map(e => ({ bottom: e.body.bottom, grounded: e.body.blocked.down })));
                add('Spiderlings stay on the arena floor', grounded.every(e => e.bottom < 900), grounded);
            }
            await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').respawn());
            const cleanCount = await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getEntities().length);
            add(`${id} retry removes summoned creatures`, cleanCount === base.count, cleanCount);

            await prime(0, prefix === 'spider' ? 1 : 1);
            await screenshot(`${prefix}-spread-warning`);
            await page.waitForFunction(() => window.__bossShotLog.length >= 3);
            const shots = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const textures = s.projectiles.getActive().filter(p => p.spec?.side === 'enemy').map(p => p.sprite.texture.key);
                return { fired: window.__bossShotLog.map(p => ({ source: p.sourceId, damage: p.damage })), textures };
            });
            add(`${id} themed three-shot spread with configured damage`, shots.fired.length === 3 && shots.fired.every(p =>
                p.source === `enm_boss_${prefix}` && p.damage === (prefix === 'spider' ? 16 : 20))
                && shots.textures.length > 0 && shots.textures.every(t => t === `projectile_${prefix}`), shots);
            await screenshot(`${prefix}-spread-active`);

            if (prefix === 'spider') {
                await prime(1, 2);
                await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').hazards.length > 0);
                const hazard = await page.evaluate(() => {
                    const s = window.__SEAPP__.game.scene.getScene('Level'); const h = s.hazards[0];
                    return { delay: h.startsAtSec - s.elapsedSec, source: h.sourceId, damage: h.damage };
                });
                add('Poison web uses real damage rectangles and 0.85s warning', hazard.delay > 0.7 && hazard.delay <= 0.85
                    && hazard.source === 'enm_boss_spider' && hazard.damage === 14, hazard);
                await screenshot('spider-web-warning');
                await page.waitForFunction(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); return s.hazards.some(h => s.elapsedSec >= h.startsAtSec); });
                await screenshot('spider-web-active');
            } else {
                await prime(0, 0);
                await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.getBossAttack()?.stage === 'active');
                const charge = await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
                    return { ghosts: s.dangerFx.echoes.filter(i => i.visible).length, clip: s.enemies.getBoss().sprite.anims.currentAnim.key }; });
                add('Echo dash uses scythe action and three pooled afterimages', charge.ghosts === 3 && charge.clip === 'echo-charge', charge);
                await screenshot('echo-charge');
            }

            await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
                b.hp = b.def.hp * 0.3; b.phaseIndex = 0; b.invincibleUntil = 0; b.bossAttack = null; });
            await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.phaseIndex === 2);
            const phase = await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level');
                return { clip: s.enemies.getBoss().sprite.anims.currentAnim.key, shield: s.dangerFx.label.text }; });
            add(`${id} phase change has dedicated animation and shield feedback`, phase.clip === `${prefix}-phase` && phase.shield.includes('护盾'), phase);
            await screenshot(`${prefix}-phase`);
            await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
                b.invincibleUntil = 0; b.applyHit(b.hp + 1, s.player.sprite.x); });
            const death = await page.evaluate(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getEntities().find(e => e.def.kind === 'boss');
                return { clip: b.sprite.anims.currentAnim.key, alpha: b.sprite.alpha, enabled: b.body.enable }; });
            add(`${id} full death clip without placeholder transparency`, death.clip === `${prefix}-death` && death.alpha === 1 && !death.enabled, death);
            await page.waitForFunction(() => !window.__SEAPP__.game.scene.getScene('Level').enemies.getEntities().find(e => e.def.kind === 'boss').sprite.visible);
            add(`${id} death completes and hides sprite`, await page.evaluate(() => !window.__SEAPP__.game.scene.getScene('Level').enemies.getEntities().find(e => e.def.kind === 'boss').sprite.visible));
            await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').respawn());
            add(`${id} retry resets boss animation, effects and projectiles`, await page.evaluate(prefix => { const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.enemies.getBoss().sprite.anims.currentAnim.key === `${prefix}-idle` && s.dangerFx.bursts.length === 0
                    && s.dangerFx.echoes.every(i => !i.visible) && s.projectiles.getActive().length === 0 && s.hazards.length === 0; }, prefix));
        }
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } catch (error) {
        return { passed: false, cases, errors, error: String(error) };
    } finally { await browser.close(); }
}
