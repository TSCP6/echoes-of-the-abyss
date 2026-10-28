/** 隔离 Chrome 验证普通敌人美术；不改玩家实际存档。 */
async function checkNormalEnemyArt(sourcePage, { url = 'http://127.0.0.1:8095' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        const cases = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); } });
        const add = (label, passed, detail) => cases.push({ label, passed, ...(passed ? {} : { detail }) });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.evaluate(() => window.__SEAPP_DOMAIN__.progress.completeLevel('1-1'));
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-2', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready);
        await page.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoLevel('3-3'));
        await page.waitForFunction(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.ready && s.levelId === '3-3' && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
        });
        await page.waitForTimeout(450);
        for (const [id, texture, frames, w, h, prefix] of [
            ['enm_chaser', 'chaser_run', 6, 28, 34, 'chaser'],
            ['enm_flyer', 'flyer_fly', 4, 28, 24, 'flyer'],
            ['enm_elite', 'elite_move', 4, 40, 48, 'elite']
        ]) {
            const art = await page.evaluate(({ id, texture, frames, w, h }) => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
                const e = s.enemies.getEntities().find(e => e.def.id === id);
                s.player.teleportTo(e.sprite.x - 100, e.sprite.y - 20);
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 128;
                const ctx = canvas.getContext('2d');
                const pixels = [];
                for (let i = 0; i < frames; i++) {
                    ctx.clearRect(0, 0, 128, 128);
                    ctx.drawImage(e.sprite.texture.getSourceImage(), i * 128, 0, 128, 128, 0, 0, 128, 128);
                    pixels.push(ctx.getImageData(0, 0, 128, 128).data.filter((v, j) => j % 4 === 3 && v > 0).length);
                }
                return { texture: e.sprite.texture.key, width: e.sprite.width, pixels,
                    body: e.body.width === w && e.body.height === h,
                    offset: e.body.offset.x === (128 - w) / 2 && e.body.offset.y === 64 + 24 - h };
            }, { id, texture, frames, w, h });
            add(`${id} 独立美术所有帧非空、碰撞尺寸和原点保持`, art.texture === texture && art.width === 128
                && art.pixels.every(n => n > 100) && art.body && art.offset, art);
            const motion = await page.evaluate(async id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const e = s.enemies.getEntities().find(e => e.def.id === id);
                const samples = [];
                for (let i = 0; i < 9; i++) {
                    await new Promise(r => setTimeout(r, 120));
                    samples.push({ frame: e.sprite.frame.name, key: e.sprite.anims.currentAnim?.key,
                        visible: e.sprite.visible, alpha: e.sprite.alpha });
                }
                return samples;
            }, id);
            add(`${id} 运动动画持续可见且帧推进`, motion.every(x => x.visible && x.alpha === 1)
                && new Set(motion.map(x => x.frame)).size > 1, motion);
            if (id === 'enm_flyer') {
                const facing = await page.evaluate(async () => {
                    const s = window.__SEAPP__.game.scene.getScene('Level');
                    const e = s.enemies.getEntities().find(e => e.def.id === 'enm_flyer');
                    const samples = [];
                    for (const direction of [1, -1]) {
                        e.reset();
                        e.body.reset(e.spawnPos.x, e.spawnPos.y);
                        s.player.teleportTo(e.sprite.x + direction * 100, e.sprite.y);
                        await new Promise(r => setTimeout(r, 80));
                        samples.push({ vx: e.body.velocity.x, flip: e.sprite.flipX, direction });
                    }
                    return samples;
                });
                add('紫鹰左右俯冲时朝向与速度一致', facing.every(x => x.vx * x.direction > 0 && x.flip === (x.direction > 0)), facing);
            }
            await page.evaluate(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const e = s.enemies.getEntities().find(e => e.def.id === id);
                s.player.teleportTo(e.sprite.x - 170, e.sprite.y);
            }, id);
            await page.waitForTimeout(250);
            await page.screenshot({ path: `output/enemy-expansion/${prefix}-in-game.png` });
            const hit = await page.evaluate(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const e = s.enemies.getEntities().find(e => e.def.id === id);
                const hp = e.hp;
                e.applyHit(1, 0);
                return { key: e.sprite.anims.currentAnim.key, hp: e.hp, previous: hp, enabled: e.body.enable };
            }, id);
            add(`${id} 受击动作与存活判定`, hit.key === `${prefix}-hit` && hit.hp === hit.previous - 1 && hit.enabled, hit);
            await page.waitForTimeout(250);
            const dead = await page.evaluate(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const e = s.enemies.getEntities().find(e => e.def.id === id);
                e.applyHit(10000, 0);
                return e.dead && !e.body.enable && e.sprite.anims.currentAnim.key === 'normal-enemy-death';
            }, id);
            add(`${id} 死亡消散立即关闭碰撞`, dead);
            await page.waitForTimeout(250);
            add(`${id} 消散中途仍可见`, await page.evaluate(id => window.__SEAPP__.game.scene.getScene('Level')
                .enemies.getEntities().find(e => e.def.id === id).sprite.visible, id));
            await page.waitForTimeout(500);
            add(`${id} 消散结束隐藏`, await page.evaluate(id => !window.__SEAPP__.game.scene.getScene('Level')
                .enemies.getEntities().find(e => e.def.id === id).sprite.visible, id));
            add(`${id} 重置恢复实体、碰撞与透明度`, await page.evaluate(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const e = s.enemies.getEntities().find(e => e.def.id === id);
                e.reset();
                return !e.dead && e.body.enable && e.sprite.visible && e.sprite.alpha === 1;
            }, id));
        }
        await page.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoLevel('1-2'));
        await page.waitForFunction(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.ready && s.levelId === '1-2' && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
        });
        add('切关后新实体正确加载，控制台无异常', await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level')
            .enemies.getEntities().every(e => !e.sprite.texture.key.startsWith('enemy_'))));
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
