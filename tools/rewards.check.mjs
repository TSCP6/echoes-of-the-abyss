/** 奖励路线浏览器检查。独立context，真实键盘事件及Arcade碰撞；仅给予玩家伤害无敌。
 * 不传送或更改物理参数，每个奖励从出生点执行audit_reach报告的独立路线。
 * report来源: python -X utf8 tools/audit_reach.py 2-3 --json output/world-audit-rewards.json
 */
export async function checkRewardRoutes(sourcePage, reports, {url='http://127.0.0.1:8100', only=['2-3'], objectives}={}) {
    const results=[],errors=[];
    for (const report of reports.levels.filter(r=>only.includes(r.id))) {
        const routes=[...report.routes.coins,...report.routes.chests].filter(r=>!objectives || objectives.some(id=>r.id===id || r.clusterId===id));
        for (const route of routes) {
            const page=await sourcePage.context().browser().newPage({viewport:{width:1280,height:900}});
            page.on('pageerror',e=>errors.push(e.message));
            page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
            await page.goto(url);
            await page.waitForFunction(()=>window.__SEAPP_UI__?.booted);
            await page.evaluate(id=>document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel(id),report.id);
            await page.waitForFunction(id=>window.__SEAPP__.game.scene.getScene('Level').ready&&window.__SEAPP__.game.scene.getScene('Level').levelId===id&&!window.__SEAPP_DIRECTOR__.director.isTransitioning,report.id);
        const result = await page.evaluate(async ({report, route}) => {
            const dev = window.__SEAPP__.game, game = dev.__v_raw ?? dev, s = game.scene.getScene('Level');
            const p = s.player, held = new Set();
            let coinBaseline = 0, targetCoinValue = 0;
            if (route.kind === 'coin') {
                // 隔离目标堆，防止路上其他金币掩盖目标奖励未入账。
                const positions = report.routes.coins.filter(t=>t.clusterId===route.clusterId).map(t=>t.object);
                for (const coin of s.pickups.coins) {
                    const target = positions.some(q=>Math.hypot(q.x-coin.sprite.x,q.y-coin.sprite.y)<1);
                    if (target && coin.active) targetCoinValue += coin.value ?? 1;
                    else { coin.active=false; coin.sprite.setVisible(false); }
                }
                coinBaseline = window.__SEAPP_DOMAIN__.economy.getCoins();
            }

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
            const steps = []; let chestBefore = null;
            if (!route?.reachable) return { id: report.id, passed: false, error: '静态路线不存在' };
            for (let index = 0; index < route.steps.length; index++) {
                const step = route.steps[index];
                let ok = true;
                if (step.kind === 'walk') {
                    ok = walk(step.target.x, Math.max(900, Math.ceil((step.moveMs ?? 0) / (1000/60)) + 180));
                } else if (step.kind === 'interact') {
                    chestBefore = {...window.__SEAPP_DOMAIN__.economy.toSnapshot()};
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
            tick(90);
            const remaining = s.pickups.coins.filter(c => c.active && Math.hypot(c.sprite.x-route.object.x,c.sprite.y-route.object.y)<70).length;
            const opened = route.kind === 'chest' ? window.__SEAPP_DOMAIN__.progress.isChestOpened(report.id,route.id) : null;
            const visual = route.kind === 'chest' ? s.pickups.chestVisuals.get(route.id) : null;
            game.renderer.snapshot;
            return { id: report.id, objective: route.id, kind: route.kind,
                passed: steps.length === route.steps.length && steps.every(v => v.passed) && (route.kind === 'chest' ? opened && (window.__SEAPP_DOMAIN__.economy.getMaterials().itm_relic_shard ?? 0) - (chestBefore?.materials?.itm_relic_shard ?? 0) === Number(report.id[0]) : remaining===0 && targetCoinValue>0 && window.__SEAPP_DOMAIN__.economy.getCoins()-coinBaseline===targetCoinValue),
                steps, remaining, opened, targetCoinValue, creditedCoins:window.__SEAPP_DOMAIN__.economy.getCoins()-coinBaseline, visual: visual ? {texture:visual.sprite.texture.key,label:visual.label.text,visible:visual.sprite.visible}:null,
                materials: {...window.__SEAPP_DOMAIN__.economy.getMaterials()}, frames, actual:snapshot() };
        }, {report, route});
            results.push(result);
            console.log('REWARD ROUTE',result.id,result.objective,JSON.stringify(result));
            // 确定性时钟暂停时请求一次渲染，截图与物理结论分别保留。
            await page.screenshot({path:`output/reward-route-${report.id}-${route.id.replaceAll('/','-')}.png`});
            await page.close();
        }
    }
    return {passed:results.length>0&&results.every(r=>r.passed)&&errors.length===0,results,errors};
}
