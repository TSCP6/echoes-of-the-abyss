import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** 隔离浏览器、实际地图与完整 Phaser/Arcade 管线；固定步长避免隐藏标签页暂停。 */
export async function checkNormalEnemyCombat(chromium, { url = 'http://localhost:8101', outputDir = 'output/normal-enemy-ai' } = {}) {
    await mkdir(outputDir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const cases = [], errors = [];
    const add = (name, passed, detail) => cases.push({ name, passed: !!passed, ...(passed ? {} : { detail }) });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); } });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready
            && !window.__SEAPP_DIRECTOR__.director.isTransitioning && window.__SEAPP_UI__.state === 'none');
        await page.evaluate(() => {
            const exposed = window.__SEAPP__.game;
            const game = exposed.__v_raw ?? exposed;
            game.loop.stop();
            window.__normalRun = { game, clock: game.loop.lastTime, frame: 0 };
        });
        const setup = async (id, playerX, enemyX = 700, enemyY = 808) => page.evaluate(({ id, playerX, enemyX, enemyY }) => {
            const s = window.__normalRun.game.scene.getScene('Level');
            s.enemies.clearSummons(); s.projectiles.clear();
            for (const e of s.enemies.getEntities()) { e.dead = true; e.body.setEnable(false); e.sprite.setVisible(false); }
            s.enemies.summonAt(enemyX, enemyY, id);
            const e = s.enemies.getEntities().at(-1);
            e.body.reset(enemyX, enemyY);
            s.player.teleportTo(playerX, 800); s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            window.__SEAPP_DOMAIN__.resources.refill(); s.combat.setRng(() => 0.5);
            window.__normalRun.enemy = e;
        }, { id, playerX, enemyX, enemyY });
        const advance = async (frames, stop = '') => page.evaluate(({ frames, stop }) => {
            const run = window.__normalRun, s = run.game.scene.getScene('Level'), e = run.enemy;
            const samples = [];
            for (let i = 0; i < frames; i++) {
                run.clock += 1000 / 60; run.game.step(run.clock, 1000 / 60); run.frame++;
                const state = e.getNormalCombatState();
                samples.push({ frame: run.frame, stage: state?.stage, locked: state?.locked, target: state?.target,
                    x: e.body.center.x, y: e.body.center.y, vx: e.body.velocity.x, vy: e.body.velocity.y,
                    attack: e.getNormalAttack(), contactSuppressed: e.suppressesContactDamage(), hp: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp,
                    shots: s.projectiles.getActive().filter(p => p.spec.side === 'enemy').map(p => ({ ...p.spec, vx: p.sprite.body.velocity.x, vy: p.sprite.body.velocity.y })),
                    warningCommands: s.normalEnemyFx.graphics.commandBuffer.length });
                if (stop && (state?.stage === stop || stop === 'locked' && state?.locked || stop === 'hit' && samples.at(-1).hp < 100)) { break; }
            }
            return { first: samples[0], last: samples.at(-1), samples };
        }, { frames, stop });
        const shot = async name => page.screenshot({ path: resolve(outputDir, name + '.png') });

        await setup('enm_chaser', 880);
        const approach = await advance(8);
        add('快速近战以160px/s追击', approach.last.vx === 160, approach.last);
        const windup = await advance(100, 'windup');
        add('近战进入距离后先停步预警', windup.last.stage === 'windup' && windup.last.vx === 0 && windup.last.warningCommands > 0, windup.last);
        await shot('melee-windup');
        await page.evaluate(() => { const s = window.__normalRun.game.scene.getScene('Level'); s.player.teleportTo(500, 800); });
        const lunge = await advance(40, 'active');
        add('近战释放后沿预警方向扑击，玩家绕背不瞬间转向', lunge.last.stage === 'active' && lunge.last.vx > 0, lunge.last);
        const recovery = await advance(30, 'recovery');
        add('近战扑空停步进入后摇', recovery.last.stage === 'recovery' && recovery.last.vx === 0, recovery.last);
        await shot('melee-recovery');
        await page.evaluate(() => {
            const run = window.__normalRun, s = run.game.scene.getScene('Level');
            s.player.teleportTo(run.enemy.body.center.x, 800); s.player.iFrameUntil = 0;
        });
        const safe = await advance(20);
        add('近战后摇重叠期间不造成接触伤害', safe.samples.every(x => x.hp === 100 && x.contactSuppressed), safe.last);

        await setup('enm_chaser', 748);
        await page.evaluate(() => { window.__normalRun.game.scene.getScene('Level').player.iFrameUntil = 0; });
        const hit = await advance(80, 'hit');
        add('近战主动攻击真实命中扣12HP', hit.last.hp === 88, hit.last);
        await page.evaluate(() => { window.__normalRun.game.scene.getScene('Level').player.iFrameUntil = 0; });
        const once = await advance(15);
        add('同次近战命中后不因提前结束无敌帧再次扣血', once.samples.every(x => x.hp === 88), once.last);

        await setup('enm_patrol', 900);
        const aim = await advance(10);
        add('远程怪中距离停步前摇，不提前发射', aim.last.stage === 'windup' && aim.last.vx === 0 && aim.last.shots.length === 0, aim.last);
        await shot('ranged-aim');
        const fire = await advance(60, 'active');
        add('远程前摇后单发敌弹，弹速230且射程480', fire.last.shots.length === 1 && fire.last.shots[0].speed === 230
            && fire.last.shots[0].range === 480, fire.last);
        await shot('ranged-projectile');
        const slow = await advance(90);
        add('远程后摇和冷却期间不连续连发', slow.samples.every(x => x.shots.length <= 1) && slow.last.stage !== 'active', slow.last);
        await setup('enm_patrol', 900);
        await page.evaluate(() => { window.__normalRun.game.scene.getScene('Level').player.iFrameUntil = 0; });
        const rangedHit = await advance(150, 'hit');
        add('普通敌弹在真实物理管线命中扣10HP', rangedHit.last.hp === 90, rangedHit.last);

        await setup('enm_patrol', 750);
        await page.keyboard.down('a');
        const retreat = await advance(100);
        await page.keyboard.up('a');
        add('远程怪退让受72px预算限制，不会无限倒退', Math.min(...retreat.samples.map(x => x.x)) >= 626, retreat.last);

        await setup('enm_flyer', 800, 700, 780);
        const track = await advance(5);
        add('紫鹰同高度发现玩家时先追踪升空', track.first.vy < 0 && Math.hypot(track.first.vx, track.first.vy) <= 111, track.first);
        const diveWarning = await advance(120, 'windup');
        add('紫鹰到达上方后显示俯冲前摇', diveWarning.last.stage === 'windup' && diveWarning.last.warningCommands > 0, diveWarning.last);
        await shot('flyer-windup');
        await page.keyboard.down('d');
        const lock = await advance(60, 'locked');
        await page.keyboard.up('d');
        add('紫鹰前摇前段追踪移动玩家，末段锁定目标', lock.last.target.x > diveWarning.last.target.x && lock.last.locked, lock.last);
        const lockedTarget = lock.last.target;
        await page.evaluate(() => { const s = window.__normalRun.game.scene.getScene('Level'); s.player.teleportTo(500, 800); });
        const dive = await advance(60, 'active');
        add('锁定后玩家闪开，俯冲方向保持固定', dive.last.stage === 'active' && dive.last.vx > 0
            && dive.last.target.x === lockedTarget.x && dive.last.target.y === lockedTarget.y, dive.last);
        await shot('flyer-active');
        const recover = await advance(80, 'recovery');
        add('紫鹰扑空在有限距离/时间内结束，关闭攻击并停下', recover.last.stage === 'recovery'
            && recover.last.vx === 0 && recover.last.vy === 0 && recover.last.attack === null, recover.last);
        await shot('flyer-recovery');
        await page.evaluate(() => {
            const run = window.__normalRun, s = run.game.scene.getScene('Level');
            s.player.teleportTo(run.enemy.body.center.x, run.enemy.body.center.y - 10); s.player.iFrameUntil = 0;
        });
        const diveSafe = await advance(45);
        add('紫鹰低空后摇至少0.75秒，贴近可安全反击', diveSafe.samples.every(x => x.stage === 'recovery' && x.hp === 100), diveSafe.last);
        const rise = await advance(30);
        add('紫鹰后摇结束先升空重整，冷却期间不立即再俯冲', rise.samples.some(x => x.vy < 0) && rise.samples.every(x => x.stage !== 'active' && x.stage !== 'windup'), rise.last);
        await page.evaluate(() => { const s = window.__normalRun.game.scene.getScene('Level'); s.player.teleportTo(1600, 800); s.player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
        const home = await advance(600, 'patrol');
        add('玩家远离后紫鹰归巢并恢复巡航', home.last.stage === 'patrol' && Math.hypot(home.last.x - 700, home.last.y - 792) < 115, home.last);
        await setup('enm_flyer', 800, 700, 650);
        await page.evaluate(() => { window.__normalRun.game.scene.getScene('Level').player.iFrameUntil = 0; });
        const diveHit = await advance(150, 'hit');
        add('紫鹰主动俯冲真实命中扣14HP', diveHit.last.hp === 86, diveHit.last);

        const reset = await page.evaluate(() => {
            const run = window.__normalRun, s = run.game.scene.getScene('Level');
            s.enemies.resetAll(); s.projectiles.clear();
            return { count: s.enemies.getEntities().length, states: s.enemies.getEntities().map(e => e.getNormalCombatState()?.stage), shots: s.projectiles.getActive().length };
        });
        add('重试清理召唤测试敌人、弹丸和旧攻击状态', reset.count === 2 && reset.states.every(x => x === 'patrol') && reset.shots === 0, reset);
        await page.evaluate(() => {
            const run = window.__normalRun;
            run.game.loop.start(run.game.step.bind(run.game));
            window.__SEAPP_DIRECTOR__.director.gotoLevel('1-2');
        });
        await page.waitForFunction(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); return s.ready && s.levelId === '1-2' && !window.__SEAPP_DIRECTOR__.director.isTransitioning; });
        add('切关仅保留一个普通敌人预警Graphics', await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').children.list.filter(x => x.name === 'normal-enemy-attack-warnings').length === 1));
        const cliff = await page.evaluate(() => {
            const run = window.__normalRun, s = run.game.scene.getScene('Level');
            run.game.loop.stop(); run.clock = run.game.loop.lastTime;
            for (const e of s.enemies.getEntities()) { e.dead = true; e.body.setEnable(false); e.sprite.setVisible(false); }
            const layer = s.ctx.collisionGroup;
            const tile = layer.layer.data.flat().find(t => t.collides && t.pixelY > s.ctx.mapHeight / 2 && t.pixelX > 200
                && !layer.getTileAtWorldXY(t.pixelX + 48, t.pixelY + 8)?.collides
                && !layer.getTileAtWorldXY(t.pixelX + 16, t.pixelY - 24)?.collides);
            if (!tile) { return { found: false }; }
            const x = tile.pixelX + 16, y = tile.pixelY - 24;
            s.enemies.summonAt(x, y, 'enm_chaser'); const e = s.enemies.getEntities().at(-1);
            e.body.reset(x, y); s.player.teleportTo(x + 150, tile.pixelY - 32); s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            const samples = [];
            for (let i = 0; i < 20; i++) {
                run.clock += 1000 / 60; run.game.step(run.clock, 1000 / 60);
                samples.push({ x: e.body.center.x, bottom: e.body.bottom, vx: e.body.velocity.x });
            }
            return { found: true, x, floor: tile.pixelY, samples };
        });
        add('真实1-2地图悬崖边追击不会主动迈入深渊', cliff.found && cliff.samples.every(p => p.x <= cliff.x + 1 && p.bottom <= cliff.floor + 1), cliff);
        await shot('level-switch');
        add('全程无浏览器控制台错误', errors.length === 0, errors);
        const result = { passed: cases.every(x => x.passed) && errors.length === 0, cases, errors };
        await writeFile(resolve(outputDir, 'result.json'), JSON.stringify(result, null, 2));
        return result;
    } finally { await browser.close(); }
}
