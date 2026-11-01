/** Playwright MCP: isolated headless Chrome; no changes to the user's save. */
async function checkEnemyArt(sourcePage, { url = 'http://127.0.0.1:8093' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); } });
        const cases = [];
        const add = (label, passed, detail) => cases.push({ label, passed, ...(passed ? {} : { detail }) });
        await page.goto(url);
        await page.locator('.menu').waitFor();
        await page.getByRole('button', { name: '开始游戏', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready);
        const ant = await page.evaluate(async () => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const e = s.enemies.getEntities().find(e => e.def.id === 'enm_patrol');
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            s.player.teleportTo(e.sprite.x - 110, 760);
            const canvas = document.createElement('canvas');
            canvas.width = 96; canvas.height = 96;
            const c = canvas.getContext('2d');
            const cells = [];
            for (let i = 0; i < 8; i++) {
                c.clearRect(0, 0, 96, 96);
                c.drawImage(e.sprite.texture.getSourceImage(), i * 96, 0, 96, 96, 0, 0, 96, 96);
                cells.push(c.getImageData(0, 0, 96, 96).data.filter((v, j) => j % 4 === 3 && v > 0).length);
            }
            const frames = [];
            for (let i = 0; i < 12; i++) {
                await new Promise(r => setTimeout(r, 140));
                frames.push({ frame: e.sprite.frame.name, visible: e.sprite.visible, alpha: e.sprite.alpha });
            }
            return { cells, frames, fps: e.sprite.anims.currentAnim.frameRate };
        });
        add('蚂蚁8格均有实体像素、低速完整循环且不消失', ant.cells.every(n => n > 1000)
            && ant.frames.every(f => f.visible && f.alpha === 1) && new Set(ant.frames.map(f => f.frame)).size >= 7 && ant.fps === 6, ant);
        await page.screenshot({ path: 'output/art-pilot/ant-after.png' });

        const enter = async (id) => {
            await page.evaluate(id => window.__SEAPP_DIRECTOR__.director.gotoLevel(id), id);
            await page.waitForFunction(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.ready && s.levelId === id && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
            }, id);
            await page.waitForTimeout(450);
            await page.evaluate(() => {
                window.__SEAPP_DOMAIN__.resources.refill();
                window.__SEAPP__.game.scene.getScene('Level').player.iFrameUntil = 0;
            });
        };
        for (const id of ['1-4', '2-4', '3-4']) {
            await enter(id);
            await page.waitForTimeout(900);
            const far = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return !s.enemies.getBoss().bossEngaged && s.hazards.length === 0 && s.projectiles.getActive().length === 0
                    && window.__SEAPP_DOMAIN__.resources.getSnapshot().hp === 100;
            });
            add(`${id} 远处Boss不偷袭`, far);
            await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                s.combat.setRng(() => 0.5);
                s.player.iFrameUntil = 0;
                s.player.teleportTo(1700, 796);
                const Rect = s.ctx.goal.constructor;
                s.hazards = [{ rect: new Rect(1660, 740, 80, 100), startsAtSec: s.elapsedSec + 0.85,
                    untilSec: s.elapsedSec + 3, damage: 14, sourceId: 'enm_boss_guardian' }];
            });
            await page.waitForTimeout(400);
            const warning = await page.evaluate(() => window.__SEAPP_DOMAIN__.resources.getSnapshot().hp);
            add(`${id} 地刺预警期间无伤害`, warning === 100, warning);
            await page.waitForFunction(() => window.__SEAPP_DOMAIN__.resources.getSnapshot().hp < 100);
            const hit = await page.evaluate(() => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return { hp: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp, dead: s.dead, invincible: s.player.iFrameUntil > s.time.now };
            });
            add(`${id} 普通命中100→86，存活且进入受击保护`, hit.hp === 86 && !hit.dead && hit.invincible, hit);
            await page.waitForTimeout(250);
            const hp = await page.evaluate(() => window.__SEAPP_DOMAIN__.resources.getSnapshot().hp);
            add(`${id} 连续重叠不逐帧扣血`, hp === 86, hp);
        }

        await enter('1-4');
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            s.player.teleportTo(2050, 796);
        });
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.getBossAttack()?.stage === 'windup');
        add('冲撞前摇有文字和方向提示', await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.dangerFx.label.visible && s.dangerFx.label.text.includes('冲撞蓄力') && s.enemies.getBoss().body.velocity.x === 0;
        }));
        await page.screenshot({ path: 'output/art-pilot/boss-windup.png' });
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.getBossAttack()?.stage === 'active');
        const charge = await page.evaluate(async () => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const b = s.enemies.getBoss();
            s.player.teleportTo(b.sprite.x + 200, 796);
            const speeds = [];
            for (let i = 0; i < 3; i++) { await new Promise(r => setTimeout(r, 80)); speeds.push(b.body.velocity.x); }
            return speeds;
        });
        add('冲撞持续多帧且不临时转向', charge.every(v => v === -480), charge);
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.getBossAttack()?.stage === 'recovery');
        add('冲撞后有明确反击窗口', await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').dangerFx.label.text.includes('可以反击')));

        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            const b = s.enemies.getBoss(); b.hp = 390;
        });
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.phaseIndex === 1);
        add('阶段切换取消旧技能并播放发光动画', await page.evaluate(() => {
            const b = window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss();
            return b.getBossAttack() === null && b.sprite.anims.currentAnim.key === 'guardian-glow';
        }));
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
            b.invincibleUntil = 0; b.bossBehavior.skillQueue = [1]; b.skillCooldown = 0; b.sprite.body.reset(2304, 768);
            s.player.teleportTo(2050, 796);
        });
        await page.waitForFunction(() => {
            const a = window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss()?.getBossAttack();
            return a?.stage === 'windup' && a.skill.kind === 'projectileSpread';
        });
        add('弹幕前摇显示扇形轨迹与文字', await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').dangerFx.label.text.includes('扇形弹幕')));
        await page.screenshot({ path: 'output/art-pilot/boss-spread.png' });
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').projectiles.getActive().some(p => p.spec.side === 'enemy'));
        add('敌弹使用可辨识的发光危险弹', await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').projectiles.getActive()
            .filter(p => p.spec.side === 'enemy').every(p => p.sprite.texture.key === 'projectile_enemy')));

        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
            b.bossBehavior.attack = null; b.skillCooldown = 999;
            s.enemies.events.onBossSkill(b, 'arenaHazard', { count: 3, durationSec: 2, damage: 20 });
        });
        add('实际地刺技能有0.85秒预警且使用配置伤害', await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.hazards.length === 3 && s.hazards.every(h => h.startsAtSec > s.elapsedSec && h.damage === 20);
        }));
        await page.waitForTimeout(250);
        await page.screenshot({ path: 'output/art-pilot/boss-hazard-warning.png' });
        await page.waitForTimeout(700);
        await page.screenshot({ path: 'output/art-pilot/boss-hazard-active.png' });
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); s.hazards = []; s.enemies.getBoss().applyHit(10000, 0);
        });
        await page.waitForTimeout(700);
        add('崩解动画中途仍可见且碰撞已禁用', await page.evaluate(() => {
            const b = window.__SEAPP__.game.scene.getScene('Level').enemies.getEntities().find(e => e.def.kind === 'boss');
            return b.dead && b.sprite.visible && !b.body.enable && b.sprite.anims.currentAnim.key === 'guardian-death';
        }));
        await page.waitForTimeout(850);
        add('完整崩解后隐藏', await page.evaluate(() => !window.__SEAPP__.game.scene.getScene('Level').enemies.getEntities().find(e => e.def.kind === 'boss').sprite.visible));
        await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').respawn());
        add('重生清空旧弹幕、地刺并复活Boss', await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'); const b = s.enemies.getBoss();
            return s.projectiles.getActive().length === 0 && s.hazards.length === 0 && b !== null && !b.bossEngaged
                && b.sprite.visible && b.body.enable && b.sprite.alpha === 1;
        }));
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
