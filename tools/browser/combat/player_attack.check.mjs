/** Isolated headless browser: exercise real J/K/mouse input without touching the user's save. */
async function checkPlayerAttack(sourcePage, { url = 'http://127.0.0.1:8087' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); } });
        const cases = [];
        const add = (label, passed, detail) => cases.push({ label, passed, ...(passed ? {} : { detail }) });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        // 1-1 currently has separate map metadata validation errors; use the unchanged 1-2 map.
        await page.evaluate(() => window.__SEAPP_DOMAIN__.progress.completeLevel('1-1'));
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-2', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready && window.__SEAPP_UI__.state === 'none');
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const audio = window.__SEAPP_AUDIO__.director;
            const play = audio.playSfx.bind(audio);
            window.__attackSamples = [];
            window.__attackSounds = [];
            audio.playSfx = key => { window.__attackSounds.push(key); play(key); };
            window.addEventListener('contextmenu', event => { window.__attackMenuPrevented = event.defaultPrevented; });
            s.game.events.on('poststep', () => {
                window.__attackSamples.push({
                    anim: s.player.sprite.anims.currentAnim?.key,
                    ammo: window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow'),
                    shots: s.projectiles.getActive().filter(p => p.spec?.side === 'player').length
                });
            });
        });
        const prepare = async () => {
            await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                s.player.teleportTo(200, 800);
                s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
                s.projectiles.clear();
                window.__attackSamples = [];
                window.__attackSounds = [];
            });
        };
        const press = async key => {
            await page.keyboard.down(key);
            await page.waitForTimeout(70);
            await page.keyboard.up(key);
        };
        const result = () => page.evaluate(() => ({ samples: window.__attackSamples, sounds: window.__attackSounds,
            notices: window.__SEAPP__.game.scene.getScene('Level').children.list
                .filter(c => c.type === 'Text' && c.visible && c.alpha > 0).map(c => c.text),
            menuPrevented: window.__attackMenuPrevented }));

        await prepare();
        await press('j');
        const melee = await result();
        add('J: melee action and sound, no projectile or ammo use',
            melee.samples.some(s => s.anim === 'player-swing') && melee.samples.every(s => s.ammo === 20 && s.shots === 0)
            && melee.sounds.includes('sword') && !melee.sounds.includes('crossbow'), melee);

        await prepare();
        await press('k');
        const ranged = await result();
        add('K: shooting action, one projectile and one arrow consumed',
            ranged.samples.some(s => s.anim === 'player-shoot' && s.ammo === 19 && s.shots === 1)
            && ranged.sounds.includes('crossbow') && !ranged.sounds.includes('sword'), ranged);

        await prepare();
        await page.mouse.move(400, 400);
        await page.mouse.down({ button: 'right' });
        await page.waitForTimeout(70);
        await page.mouse.up({ button: 'right' });
        const right = await result();
        add('Right mouse: same ranged attack as K',
            right.samples.some(s => s.anim === 'player-shoot' && s.ammo === 18 && s.shots === 1), right);
        add('Right mouse does not open browser context menu', right.menuPrevented === true, right.menuPrevented);

        await prepare();
        await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.consumeItem('itm_arrow', 18));
        await press('k');
        const empty = await result();
        add('Empty K: visible notice and error sound, no attack animation or projectile',
            empty.notices.includes('弹药不足') && empty.sounds.includes('ui_error') && !empty.sounds.includes('shoot')
            && empty.samples.every(s => s.shots === 0 && s.anim !== 'player-swing' && s.anim !== 'player-shoot'), empty);
        await page.screenshot({ path: 'output/player-attack-empty.png' });

        await prepare();
        await page.mouse.down({ button: 'right' });
        await page.waitForTimeout(70);
        await page.mouse.up({ button: 'right' });
        const emptyRight = await result();
        add('Empty right mouse: same notice, no attack animation', emptyRight.notices.includes('弹药不足')
            && emptyRight.samples.every(s => s.shots === 0 && s.anim !== 'player-shoot' && s.anim !== 'player-swing'), emptyRight);

        await prepare();
        await page.evaluate(() => window.__SEAPP_DOMAIN__.inventory.addItem('itm_arrow', 1));
        await press('k');
        const refill = await result();
        add('Refill: immediately able to shoot the last arrow', refill.samples.some(s => s.anim === 'player-shoot' && s.shots === 1 && s.ammo === 0), refill);

        // Render the short action long enough to inspect a screenshot.
        await prepare();
        await page.evaluate(() => {
            window.__SEAPP_DOMAIN__.inventory.addItem('itm_arrow', 1);
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.game.events.once('poststep', () => {
                s.combat.tryAttack('sub');
                s.scene.pause();
            });
        });
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').scene.isPaused());
        await page.screenshot({ path: 'output/player-attack-shoot.png' });
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
