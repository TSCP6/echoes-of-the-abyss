/** 在真实 Phaser/Arcade 中逐帧执行审计路线。仅新建隔离浏览器，不读用户存档。
 * 自由运行时钟改为确定性60Hz，使用浏览器键盘事件；几何路线检查仅给玩家受伤无敌，
 * 不传送、不改速度/重力、不忽略碰撞。Boss战斗与门禁另测，不能据此宣称真人难度验收。
 */
export async function checkWorldRoutes(sourcePage, reports, { url = 'http://127.0.0.1:8098', only, fightBoss = false } = {}) {
    const errors = [], results = [];
    for (const report of reports.levels.filter(r => !only || only.includes(r.id))) {
        const page = await sourcePage.context().browser().newPage({viewport:{width:1280,height:900}});
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error') { errors.push(message.text()); }
            if (message.text().startsWith('ROUTE')) console.log(message.text());
        });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.getByRole('button', { name: '开始游戏', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await page.evaluate(async id => {
            const game = window.__SEAPP__.game;
            if (!game.loop.running) game.loop.start(game.step.bind(game));
            document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel(id);
        }, report.id);
        await page.waitForFunction(id => window.__SEAPP__.game.scene.getScene('Level').ready
            && window.__SEAPP__.game.scene.getScene('Level').levelId === id
            && !window.__SEAPP_DIRECTOR__.director.isTransitioning, report.id);
        const result = await page.evaluate(async ({report, fightBoss}) => {
            const game = window.__SEAPP__.game, s = game.scene.getScene('Level');
            const p = s.player, held = new Set();
            game.loop.stop();
            let clock = game.loop.lastTime, frames = 0;
            const keys = { left: ['a', 'KeyA', 65], right: ['d', 'KeyD', 68], jump: [' ', 'Space', 32], interact: ['e', 'KeyE', 69], attack: ['j', 'KeyJ', 74] };
            const key = (action, down) => {
                if (held.has(action) === down) return;
                const [name, code, keyCode] = keys[action];
                window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: name, code, keyCode, which: keyCode, bubbles: true }));
                down ? held.add(action) : held.delete(action);
            };
            const horizontal = direction => { key('left', direction < 0); key('right', direction > 0); };
            const tick = (n = 1) => {
                for (let i = 0; i < n; i++) {
                    clock += 1000 / 60; game.step(clock, 1000 / 60); frames++;
                    p.iFrameUntil = Number.MAX_SAFE_INTEGER;
                }
            };
            const snapshot = () => ({ x: p.sprite.x, foot: p.body.bottom, vx: p.body.velocity.x, vy: p.body.velocity.y,
                grounded: p.isGrounded(), dead: s.dead, ui: window.__SEAPP_UI__.state });
            const steer = target => {
                const dx = target - p.sprite.x;
                const brake = Math.abs(p.body.velocity.x) * 0.055 + 1;
                horizontal(Math.abs(dx) <= brake ? 0 : Math.sign(dx));
            };
            const walk = (target, max = 900) => {
                for (let i = 0; i < max; i++) {
                    if (Math.abs(p.sprite.x - target) <= 2.5 && Math.abs(p.body.velocity.x) < 28) return true;
                    steer(target); tick();
                    if (s.dead) return false;
                    if (window.__SEAPP_UI__.state === 'result') return true;
                }
                return false;
            };
            tick(30);
            const steps = [], route = report.routes.main;
            if (!route?.reachable) return { id: report.id, passed: false, error: '静态路线不存在' };
            for (let index = 0; index < route.steps.length; index++) {
                const step = route.steps[index];
                let ok = true;
                if (step.kind === 'walk') {
                    ok = walk(step.target.x);
                } else if (step.kind === 'interact') {
                    horizontal(0); key('interact', true); tick(2); key('interact', false); tick(2);
                } else {
                    if (Math.abs(p.body.bottom - step.launch.y) > 5 || !p.isGrounded()) {
                        // 启动位置必须由上一条路线真实到达；不能用传送弥补。
                        ok = false;
                    } else {
                        ok = walk(step.runUpStart.x);
                        horizontal(step.initialVx === 0 ? 0 : step.direction);
                        if (step.runUpMs) tick(Math.round(step.runUpMs / (1000/60)));
                        const startFoot = p.body.bottom;
                        key('jump', step.kind === 'jump');
                        let airborne = false, landed = false;
                        const limit = Math.ceil(step.flightSeconds * 60) + 120;
                        for (let n = 0; n < limit; n++) {
                            steer(step.landing.x);
                            tick();
                            if (n * 1000/60 > step.jumpHoldMs) key('jump', false);
                            if (!p.isGrounded() || Math.abs(p.body.bottom-startFoot)>4) airborne=true;
                            if (airborne && p.isGrounded() && p.body.velocity.y === 0) {
                                landed = Math.abs(p.body.bottom - step.landing.y) < 4;
                                break;
                            }
                            if (s.dead || window.__SEAPP_UI__.state === 'result') break;
                        }
                        key('jump', false);
                        ok &&= landed;
                    }
                }
                steps.push({ index, kind: step.kind, passed: ok, ...(ok ? {} : { step, actual: snapshot() }) });
                if (!ok) console.log('ROUTE', report.id, index, step.kind, ok, JSON.stringify({step,actual:snapshot()}));
                if (!ok) break;
            }
            horizontal(0); key('jump', false); key('interact', false);
            const collected = s.ctx.shards.filter(sh => window.__SEAPP_DOMAIN__.progress.isShardCollected(report.id, sh.id)).length;
            const switches = s.ctx.devices.filter(d => d.kind === 'switch').map(d => ({ id: d.id, active: s.devices.state.isActive(d.id) }));
            let cleared = s.pickups.goalReached && window.__SEAPP_UI__.state === 'result';
            const boss = s.enemies.getBoss();
            const atGoal = s.ctx.goal.contains(p.sprite.x, p.sprite.y);
            const bossGateHeld = s.ctx.bossId !== null && boss !== null && atGoal && !s.pickups.goalReached;
            let bossDefeated = false, combatFrames = 0;
            if (fightBoss && bossGateHeld && collected === 3) {
                // 从完整路线的终点继续追击首领，真实移动/J攻击，不直接扣首领HP。
                for (let n = 0; n < 6000; n++) {
                    const target = s.enemies.getBoss();
                    if (target === null) { bossDefeated = true; break; }
                    const dx = target.sprite.x - p.sprite.x;
                    horizontal(Math.abs(dx) > 52 ? Math.sign(dx) : 0);
                    // 在距离内短促转身，确保攻击朝向与首领一致。
                    if (Math.abs(dx) <= 80 && p.getFacing() !== Math.sign(dx)) horizontal(Math.sign(dx));
                    key('attack', n % 14 === 0);
                    tick(); combatFrames++;
                    if (s.dead) break;
                }
                key('attack', false); horizontal(0); tick(2);
                if (bossDefeated) {
                    walk(s.ctx.goal.centerX);
                    tick(2);
                    cleared = s.pickups.goalReached && window.__SEAPP_UI__.state === 'result';
                }
            }
            return { id: report.id, passed: steps.length === route.steps.length && steps.every(v => v.passed) && collected === 3
                    && switches.every(v => v.active) && (s.ctx.bossId === null ? cleared : bossGateHeld && (!fightBoss || bossDefeated && cleared)),
                steps, collected, switches, cleared, bossGateHeld, bossDefeated, combatFrames, frames, simulationSeconds: frames/60, actual: snapshot() };
        }, {report, fightBoss});
        results.push(result);
        console.log('ROUTE RESULT',report.id,JSON.stringify({...result,steps:result.steps.filter(s=>!s.passed)}));
        if (!result.passed) await page.screenshot({path:`output/route-failure-${report.id}.png`});
        await page.close();
    }
    return { passed: results.every(r => r.passed) && errors.length === 0, results, errors };
}
