/**
 * 三首领独立技能的隔离浏览器回归。
 * 单点检查允许传送与请求 begin 构造施招；伤害、输入、物理、暂停仍走真实运行管线。
 * 完整出生点→战斗→结算由 world_routes.check.mjs 的 fightBoss 选项另行验证。
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const BOSS_IDENTITY_PLAN = [
    { level: '1-4', name: '石像守卫', skills: ['guardianHammer', 'guardianStomp', 'charge'],
        special: ['前摇内HP不变、伤害区激活后真实扣HP', '重锤跑出范围、震波基础跳跃躲避',
            '冲撞方向锁定、撞墙后1.4秒可反击收招'] },
    { level: '2-4', name: '深渊蛛后', skills: ['spiderWeb', 'spiderEggs', 'spiderDrop'],
        special: ['蛛网速度因子0.65、跳离恢复、最多两网且有干净通道',
            '蛛卵J/K/范围技能可破坏、三秒孵化且小蜘蛛至多三只',
            '吊顶高处预警→锁定落点→落地伤害→收招'] },
    { level: '3-4', name: '回响之影', skills: ['echoStep', 'echoDance', 'echoReplay'],
        special: ['换位标记无瞬间伤害，攻击方向锁定', '剑舞两横斩和慢重劈时序',
            '回响位置固定、延迟激活、待触发剑痕至多一道'] }
];

/** 60Hz确定性运行，按键由Playwright送入浏览器，再跨真实Arcade帧采样。 */
async function createHarness(page, url) {
    await page.goto(url);
    await page.waitForFunction(() => window.__SEAPP_UI__?.booted && window.__SEAPP_DOMAIN__);
    // DEV 探针来自 Vue ref；循环与场景身份必须使用原始 Phaser 实例。
    // 否则第二次启动循环会将 Proxy scene 登记为令牌，箭头监听器持有的 raw scene 无法暂停。
    await page.evaluate(() => {
        const exposed = window.__SEAPP__.game;
        window.__bossCheckGame = exposed.__v_raw ?? exposed;
    });
    const tick = frames => page.evaluate(frames => {
        const game = window.__bossCheckGame;
        for (let i = 0; i < frames; i++) {
            window.__bossCheckClock += 1000 / 60;
            game.step(window.__bossCheckClock, 1000 / 60);
        }
    }, frames);
    const enter = async id => {
        await page.evaluate(id => {
            const game = window.__bossCheckGame;
            if (!game.loop.running) { game.loop.start(game.step.bind(game)); }
            document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel(id);
        }, id);
        await page.waitForFunction(id => {
            const s = window.__bossCheckGame.scene.getScene('Level');
            return s.ready && s.levelId === id && s.scene.isActive() && window.__SEAPP_UI__.state === 'none'
                && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
        }, id);
        await page.evaluate(async () => {
            const game = window.__bossCheckGame;
            game.loop.stop();
            window.__bossCheckClock = game.loop.lastTime;
            window.__bossDamageCalls = [];
            const s = game.scene.getScene('Level');
            const original = s.combat.damagePlayer;
            s.combat.damagePlayer = function (...args) {
                const before = window.__SEAPP_DOMAIN__.resources.getSnapshot().hp;
                const result = original.apply(this, args);
                window.__bossDamageCalls.push({ args, before, after: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp,
                    now: s.bossAbilities?.field.snapshot.now, body: { x: s.player.body.x, y: s.player.body.y,
                        width: s.player.body.width, height: s.player.body.height } });
                return result;
            };
            s.combat.setRng(() => 0.5);
            if (s.bossAbilities) {
                const fx = s.bossAbilities.fx, graphics = fx.graphics;
                const stroke = graphics.strokeRect, render = fx.render;
                graphics.strokeRect = function (x, y, width, height) {
                    window.__bossDrawnRects.push({ x, y, width, height });
                    return stroke.call(this, x, y, width, height);
                };
                fx.render = function (snapshot, boss) {
                    window.__bossDrawnRects = [];
                    const result = render.call(this, snapshot, boss);
                    const zones = snapshot.zones.filter(z => z.endsAt > snapshot.now);
                    window.__bossVisualGeometry = { now: snapshot.now, matched: zones.every(zone =>
                        window.__bossDrawnRects.some(rect => ['x', 'y', 'width', 'height'].every(key => Math.abs(rect[key] - zone.rect[key]) < 0.001))),
                        zones: zones.map(z => ({ id: z.id, rect: { ...z.rect } })), drawn: window.__bossDrawnRects };
                    return result;
                };
            }
            window.__beginBossAttack = (await import('/src/game/systems/bossAttack.ts')).beginBossAttack;
        });
        await tick(30);
    };
    const key = async (name, down) => page.keyboard[down ? 'down' : 'up'](name);
    const press = async (name, frames = 2) => {
        await key(name, true); await tick(frames); await key(name, false); await tick(2);
    };
    const snapshot = () => page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getBoss();
        return { field: s.bossAbilities ? JSON.parse(JSON.stringify(s.bossAbilities.field.snapshot)) : null,
            hp: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp,
            player: { x: s.player.sprite.x, y: s.player.sprite.y, foot: s.player.body.bottom,
                vx: s.player.body.velocity.x, vy: s.player.body.velocity.y, grounded: s.player.isGrounded(), dead: s.dead,
                speedFactor: s.player.moveSpeedFactor },
            boss: b ? { x: b.sprite.x, y: b.sprite.y, hp: b.hp, phase: b.phaseIndex,
                alpha: b.sprite.alpha, contactSuppressed: b.abilityContactSuppressed, collisionNone: b.body.checkCollision.none,
                attack: b.bossAttack ? JSON.parse(JSON.stringify(b.bossAttack)) : null } : null,
            ui: window.__SEAPP_UI__.state, calls: window.__bossDamageCalls, geometry: window.__bossVisualGeometry };
    });
    const place = (x, foot) => page.evaluate(({ x, foot }) => {
        const s = window.__bossCheckGame.scene.getScene('Level');
        s.player.teleportTo(x, foot - 32);
    }, { x, foot });
    const fresh = async () => {
        // 等真实死亡重试结束，避免上个用例的延迟重生在新施招中途触发。
        if (await page.evaluate(() => window.__bossCheckGame.scene.getScene('Level').dead)) { await tick(180); }
        await page.evaluate(() => {
            const s = window.__bossCheckGame.scene.getScene('Level');
            s.respawn();
            const b = s.enemies.getBoss(), r = s.ctx.bossArena;
            b.sprite.setPosition(r.centerX, r.bottom - 24);
            s.player.teleportTo(r.centerX + 240, r.bottom - 32);
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
        });
        await tick(3);
        return page.evaluate(() => {
            const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getBoss(), r = s.ctx.bossArena;
            b.bossAttack = null; b.skillCooldown = 100000; b.skillQueue = []; b.body.setVelocity(0, 0);
            s.bossAbilities.reset();
            s.player.iFrameUntil = 0;
            window.__SEAPP_DOMAIN__.resources.refill();
            window.__bossDamageCalls = [];
            return { x: b.sprite.x, floor: r.bottom, left: r.left, right: r.right, width: r.width };
        });
    };
    const begin = async (kind, direction = 1) => {
        const prepared = await page.evaluate(({ kind, direction }) => {
            const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getBoss();
            const phase = b.def.phases.findIndex(phase => phase.skills.some(skill => skill.kind === kind));
            if (phase < 0) { throw new Error(`配置缺少技能 ${kind}`); }
            if (!b.def.phases[b.phaseIndex].skills.some(skill => skill.kind === kind)) {
                b.phaseIndex = phase; b.hp = b.def.hp * (phase === 1 ? 0.5 : 0.25); b.invincibleUntil = 0;
            }
            const skill = b.def.phases[b.phaseIndex].skills.find(skill => skill.kind === kind);
            const attack = window.__beginBossAttack(skill, direction);
            const existing = s.bossAbilities.field.snapshot.zones.map(zone => zone.id);
            b.bossAttack = attack; b.skillCooldown = 100000; b.skillQueue = [];
            b.visual?.windup(kind);
            s.bossAbilities.begin(b, attack);
            return { skill, attack, existing };
        }, { kind, direction });
        // begin立即捕获姿态并创建区域；推进一帧后按实际快照时间断言。
        await tick(1);
        const field = (await snapshot()).field;
        const zones = field.zones.filter(zone => !prepared.existing.includes(zone.id));
        return { ...prepared, now: zones[0]?.announcedAt ?? field.now, snapshot: { ...field, zones } };
    };
    const until = async time => {
        const current = (await snapshot()).field.now;
        if (time > current) { await tick(Math.max(1, Math.ceil((time - current) * 60 - 1e-6))); }
    };
    return { page, enter, tick, key, press, snapshot, place, fresh, begin, until };
}

const damagingKinds = ['guardianHammer', 'guardianStomp', 'charge', 'spiderDrop', 'echoStep', 'echoDance', 'echoReplay'];
const active = field => field.zones.filter(z => z.damage > 0 && field.now >= z.startsAt - 1e-6 && field.now < z.endsAt);

/** 用预警本身的矩形放置玩家；不修改模型判定、伤害或运动数值。 */
async function checkTiming(h, plan, add, shot) {
    for (const kind of plan.skills) {
        const arena = await h.fresh();
        const cast = await h.begin(kind);
        const zone = cast.snapshot.zones.find(z => z.damage > 0) ?? cast.snapshot.zones[0];
        if (!zone) { add(`${kind} 生成可读预警`, false, cast); continue; }
        await h.place(zone.rect.x + zone.rect.width / 2, arena.floor);
        const baseline = await h.snapshot();
        await h.until(zone.startsAt - 2 / 60);
        const warning = await h.snapshot();
        add(`${kind} 预警期不提前造成技能伤害`, warning.hp === baseline.hp
            && warning.calls.every(call => call.before === call.after), { baseline: baseline.hp, warning: warning.hp, zone, now: warning.field.now });
        await shot(`${kind}-warning`);
        await h.until(zone.startsAt + 2 / 60);
        if (kind === 'charge') {
            // 冲撞的激活矩形随真实首领身体移动；移动到当前矩形用于命中单点回归。
            const current = (await h.snapshot()).field.zones.find(z => z.kind === 'charge');
            const perFrame = cast.skill.params.distance / cast.skill.params.activeSec / 60;
            // 命中外侧冲撞区域，避开实体接触先触发5伤害及i-frame的干扰。
            await h.place(current.rect.x + current.rect.width + 11 + perFrame - 0.5, arena.floor);
            await h.tick(1);
        }
        const impact = await h.snapshot();
        const harmful = damagingKinds.includes(kind);
        add(`${kind} ${harmful ? '激活区命中真实扣除HP' : '激活仅生成控制/可破坏实体，无直接伤害'}`,
            harmful ? impact.calls.some(call => call.after < call.before) : impact.hp === baseline.hp,
            { before: baseline.hp, after: impact.hp, now: impact.field.now, calls: impact.calls,
                active: active(impact.field), webs: impact.field.webs.length, eggs: impact.field.eggs.length });
        await shot(`${kind}-active`);
        add(`${kind} 画布外框使用实际预警/伤害矩形`, warning.geometry?.matched && impact.geometry?.matched,
            { warning: warning.geometry, active: impact.geometry });
    }
}

async function checkBasicDodges(h, plan, add) {
    for (const kind of plan.skills.filter(kind => damagingKinds.includes(kind))) {
        const arena = await h.fresh();
        const cast = await h.begin(kind);
        const zones = cast.snapshot.zones.filter(z => z.damage > 0);
        const first = zones[0];
        const origin = cast.snapshot.zones.find(z => z.kind === 'shift');
        const x = kind === 'guardianStomp' || kind === 'charge' ? arena.x + 150 : first.rect.x + first.rect.width / 2;
        await h.place(x, arena.floor);
        const before = (await h.snapshot()).hp;
        if (kind === 'guardianStomp' || kind === 'charge') {
            await h.until(first.startsAt - 0.25);
            await h.key('Space', true); await h.tick(38); await h.key('Space', false);
            await h.tick(5);
        } else {
            // 退出全部已锁定预警的包围范围，依靠基础移动，不使用冲刺或解锁技能。
            const right = Math.max(...zones.map(z => z.rect.x + z.rect.width), origin ? origin.rect.x + origin.rect.width : -Infinity);
            const left = Math.min(...zones.map(z => z.rect.x), origin ? origin.rect.x : Infinity);
            const preferred = first.direction;
            const direction = preferred === 1 ? (arena.right - right > 30 ? 1 : -1)
                : (left - arena.left > 30 ? -1 : 1);
            await h.key(direction > 0 ? 'd' : 'a', true);
            const end = Math.max(...zones.map(z => z.endsAt));
            await h.until(Math.min(end + 1 / 60, cast.now + 4));
            await h.key(direction > 0 ? 'd' : 'a', false);
        }
        const result = await h.snapshot();
        add(`${kind} 基础${kind === 'guardianStomp' || kind === 'charge' ? '跳跃' : '移动'}可以躲避`, result.hp === before
            && result.calls.every(call => call.before === call.after), { before, after: result.hp, player: result.player, calls: result.calls });
    }
}

async function checkGuardian(h, add, shot) {
    const r = await h.fresh();
    await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getBoss();
        b.body.reset(s.ctx.bossArena.right - 180, s.ctx.bossArena.bottom - 24);
        s.player.teleportTo(s.ctx.bossArena.right - 60, s.ctx.bossArena.bottom - 32);
        s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
    });
    const cast = await h.begin('charge', 1);
    await h.place(r.left + 120, r.floor);
    await h.until(cast.now + cast.skill.params.windupSec - 0.05);
    const locked = await h.snapshot();
    add('守卫冲撞前摇后不随玩家换边改变方向', locked.boss.attack.direction === 1
        && locked.field.zones.find(z => z.kind === 'charge')?.direction === 1, locked);
    const wall = await h.page.evaluate(() => {
        const game = window.__bossCheckGame, s = game.scene.getScene('Level'), b = s.enemies.getBoss();
        for (let n = 0; n < 240; n++) {
            window.__bossCheckClock += 1000 / 60; game.step(window.__bossCheckClock, 1000 / 60);
            const a = b.getBossAttack();
            if (a?.stage === 'recovery') return { now: s.bossAbilities.field.snapshot.now, remaining: a.remaining,
                right: b.body.right, edge: s.ctx.bossArena.right, stage: a.stage };
        }
        return { stage: b.getBossAttack()?.stage, right: b.body.right, edge: s.ctx.bossArena.right };
    });
    add('守卫冲撞真实触墙后进入1.4秒收招', wall.stage === 'recovery' && Math.abs(wall.right - wall.edge) < 0.2
        && Math.abs(wall.remaining - 1.4) < 1 / 60 + 1e-5, wall);
    await shot('guardian-charge-wall-recovery');
    await h.tick(68);
    const recovering = await h.snapshot();
    add('守卫触墙后经过1.13秒仍在收招，冲撞伤害已取消', recovering.boss.attack?.stage === 'recovery'
        && active(recovering.field).every(z => z.kind !== 'charge'), recovering.boss);
    await h.tick(20);
    const finished = await h.snapshot();
    add('守卫撞墙收招结束后释放当前动作', finished.boss.attack === null, finished.boss);
}

async function spawnEggs(h, fresh = true) {
    const arena = fresh ? await h.fresh() : null;
    const cast = await h.begin('spiderEggs');
    await h.until(cast.snapshot.zones[0].startsAt + 0.05);
    return { arena, cast, eggs: (await h.snapshot()).field.eggs };
}

async function checkSpider(h, add, shot) {
    const r = await h.fresh();
    const cast = await h.begin('spiderWeb');
    const mark = cast.snapshot.zones[0].rect;
    await h.place(r.left + 150, r.floor);
    await h.until(cast.snapshot.zones[0].startsAt + 0.05);
    const web = (await h.snapshot()).field.webs[0];
    add('蛛网预警位置锁定，玩家移走后不追踪', Math.abs(web.rect.x - mark.x) < 0.1, { mark, web });
    await h.place(web.rect.x + web.rect.width / 2, r.floor); await h.tick(2);
    await h.key('d', true); await h.tick(28);
    const slow = await h.snapshot();
    await h.key('Space', true); await h.tick(15);
    const airborne = await h.snapshot();
    await h.key('Space', false); await h.key('d', false);
    add('蛛网上实际水平速度为基础0.65，基础跳跃离网后恢复', Math.abs(Math.abs(slow.player.vx) / Math.abs(airborne.player.vx) - 0.65) < 0.02
        && airborne.player.vy < 0 && Math.abs(airborne.player.vx) > Math.abs(slow.player.vx), { slow: slow.player, airborne: airborne.player });
    for (const x of [r.left + 180, r.right - 180, r.x]) {
        await h.place(x, r.floor);
        const next = await h.begin('spiderWeb'); await h.until(next.snapshot.zones[0].startsAt + 0.05);
    }
    const webs = (await h.snapshot()).field.webs;
    const intervals = webs.map(w => [w.rect.x, w.rect.x + w.rect.width]).sort((a, b) => a[0] - b[0]);
    let covered = 0, edge = -Infinity;
    for (const [left, right] of intervals) { covered += Math.max(0, right - Math.max(left, edge)); edge = Math.max(edge, right); }
    add('蛛网最多两片且至少一半场地仍为干净通道', webs.length === 2 && covered <= r.width / 2, { webs, covered, clean: r.width - covered });
    await shot('spider-web-limits');

    for (const method of ['J', 'K', '范围技能']) {
        const { arena, eggs } = await spawnEggs(h);
        const egg = eggs[0];
        if (method === 'K') {
            // 卵现在铺在玩家附近；把夹具Boss放到射手后方，避免弹丸先命中Boss。
            await h.page.evaluate(({ x, floor }) => {
                window.__bossCheckGame.scene.getScene('Level').enemies.getBoss().body.reset(x, floor - 24);
            }, { x: arena.left + 90, floor: arena.floor });
        }
        await h.place(egg.rect.x - (method === 'K' ? 160 : 28), arena.floor);
        await h.key('d', true); await h.tick(1); await h.key('d', false); await h.tick(5);
        const before = (await h.snapshot()).field.eggs.find(e => e.id === egg.id);
        if (method === 'J') {
            await h.press('j'); await h.tick(10); await h.press('j'); await h.tick(4);
        } else if (method === 'K') {
            await h.press('k'); await h.tick(26); await h.press('k'); await h.tick(26);
        } else {
            await h.page.evaluate(() => {
                const d = window.__SEAPP_DOMAIN__;
                d.skills.syncEarned(50); d.skills.unlock('sk_blade_focus'); d.skills.unlock('sk_whirlwind'); d.skills.equip('sk_whirlwind', 0);
                d.resources.refill();
            });
            await h.press('1'); await h.tick(3);
        }
        const after = await h.snapshot();
        add(`蛛卵可由真实${method}输入破坏`, before?.hp === before?.hpMax
            && !after.field.eggs.some(e => e.id === egg.id), { before, after: after.field.eggs, player: after.player });
    }
    const eggCast = await spawnEggs(h);
    await h.page.evaluate(() => { window.__bossCheckGame.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
    await h.place(eggCast.arena.left + 100, eggCast.arena.floor);
    const firstHatch = Math.min(...eggCast.eggs.map(e => e.hatchAt));
    await h.until(firstHatch - 2 / 60);
    const beforeHatch = await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level');
        return { now: s.bossAbilities.field.snapshot.now, eggs: s.bossAbilities.field.snapshot.eggs.length,
            minions: s.enemies.getEntities().filter(e => !e.dead && e.def.id === 'enm_patrol').length };
    });
    await h.until(firstHatch + 2 / 60);
    const hatched = await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level');
        return { now: s.bossAbilities.field.snapshot.now, eggs: s.bossAbilities.field.snapshot.eggs.length,
            minions: s.enemies.getEntities().filter(e => !e.dead && e.def.id === 'enm_patrol').length };
    });
    add('蛛卵约三秒后才孵化真实小蜘蛛', beforeHatch.minions === 0 && beforeHatch.eggs === 2 && hatched.minions === 2,
        { beforeHatch, hatched, hatchAt: firstHatch, spawnedAt: firstHatch - 3 });
    const second = await spawnEggs(h, false);
    await h.until(Math.max(...second.eggs.map(e => e.hatchAt)) + 0.1);
    const cap = await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level');
        return { minions: s.enemies.getEntities().filter(e => !e.dead && e.def.id === 'enm_patrol').length,
            eggs: s.bossAbilities.field.snapshot.eggs.length };
    });
    add('连续孵化时最多三只小蜘蛛、最多两枚蛛卵', cap.minions === 3 && cap.eggs <= 2, cap);
    await shot('spider-eggs-and-minions');

    const floor = (await h.fresh()).floor;
    const drop = await h.begin('spiderDrop');
    const dropRect = drop.snapshot.zones[0].rect;
    await h.place(dropRect.x - 160, floor);
    await h.until(drop.now + 0.5);
    const high = await h.snapshot();
    await shot('spider-drop-high');
    await h.until(drop.snapshot.zones[0].startsAt + 0.05);
    const landed = await h.snapshot();
    add('俯袭先升至吊顶高处，并落在已锁定位置', high.boss.y <= floor - 24 - drop.skill.params.liftHeight + 5
        && Math.abs(landed.boss.x - (dropRect.x + dropRect.width / 2)) < 2
        && Math.abs(landed.boss.y - (floor - 24)) < 2,
        { high: high.boss, landed: landed.boss, lockedRect: dropRect });
    await h.until(drop.now + drop.skill.params.windupSec + drop.skill.params.activeSec + 0.05);
    const recovery = await h.snapshot();
    add('俯袭进入收招时落地伤害已经结束', recovery.boss.attack?.stage === 'recovery'
        && active(recovery.field).every(zone => zone.kind !== 'drop'), recovery.boss);
    await shot('spider-drop-landing');
}

async function checkEcho(h, add, shot) {
    const r = await h.fresh();
    const step = await h.begin('echoStep');
    const shift = step.snapshot.zones.find(z => z.kind === 'shift'), slash = step.snapshot.zones.find(z => z.kind === 'slash');
    await h.place(shift.rect.x + shift.rect.width / 2, r.floor);
    const hp = (await h.snapshot()).hp;
    await h.until(shift.startsAt + 0.1);
    const shifted = await h.snapshot();
    add('影换位在安全标记显形时没有瞬间接触伤害', shifted.hp === hp && shifted.calls.every(c => c.before === c.after)
        && Math.abs(shifted.boss.x - (shift.rect.x + shift.rect.width / 2)) < 1,
        { before: hp, after: shifted.hp, shifted: shifted.boss, mark: shift, slashStarts: slash.startsAt });
    await h.place(r.left + 150, r.floor); await h.tick(2);
    const locked = (await h.snapshot()).field.zones.find(z => z.id === slash.id);
    add('影换位后的拔剑方向与位置锁定，不追踪换边玩家', locked.direction === slash.direction
        && JSON.stringify(locked.rect) === JSON.stringify(slash.rect), { announced: slash, after: locked });
    await shot('echo-step-mark');

    await h.fresh();
    const dance = await h.begin('echoDance');
    const cuts = dance.snapshot.zones.filter(z => z.kind === 'slash').sort((a, b) => a.startsAt - b.startsAt);
    add('影剑舞两横斩加慢重劈，重劈前留更长间隔', cuts.length === 3 && cuts[0].rect.height === cuts[1].rect.height
        && cuts[2].rect.height > cuts[1].rect.height && cuts[2].startsAt - cuts[1].startsAt > cuts[1].startsAt - cuts[0].startsAt,
        cuts);
    for (const [index, zone] of cuts.entries()) {
        // 等上一击结束后再准备下一击，避免上一击的残留伤害与i-frame冒充第二击。
        await h.until(zone.startsAt - 2 / 60);
        await h.place(zone.rect.x + zone.rect.width / 2, r.floor);
        await h.page.evaluate(() => { const s = window.__bossCheckGame.scene.getScene('Level');
            s.player.iFrameUntil = 0; window.__SEAPP_DOMAIN__.resources.refill(); window.__bossDamageCalls = []; });
        await h.until(zone.startsAt + 2 / 60);
        const hit = await h.snapshot();
        add(`影剑舞第${index + 1}击在公布区域激活后真实扣HP`, hit.hp < 100 && hit.calls.some(c => c.after < c.before
            && c.now >= zone.startsAt - 1e-5 && c.now < zone.endsAt && Math.abs(c.args[2] - zone.rect.x - zone.rect.width / 2) < 0.1),
            { zone, hp: hit.hp, calls: hit.calls });
    }
    await shot('echo-dance-heavy');

    await h.fresh();
    const replay = await h.begin('echoReplay');
    const original = replay.snapshot.zones.find(z => z.kind === 'slash'), echo = replay.snapshot.zones.find(z => z.kind === 'echo');
    await h.place(r.left + 100, r.floor); await h.until(original.endsAt + 0.05);
    await h.place(echo.rect.x + echo.rect.width / 2, r.floor);
    await h.page.evaluate(() => { const s = window.__bossCheckGame.scene.getScene('Level'); s.player.iFrameUntil = 0;
        window.__SEAPP_DOMAIN__.resources.refill(); window.__bossDamageCalls = []; });
    await h.until(echo.startsAt - 2 / 60); const warned = await h.snapshot();
    await h.until(echo.startsAt + 2 / 60); const hit = await h.snapshot();
    add('延迟回响固定在原剑痕，在延迟前无伤、到时真实伤害', JSON.stringify(echo.rect) === JSON.stringify(original.rect)
        && echo.startsAt > original.endsAt && warned.hp === 100 && hit.calls.some(c => c.after < c.before),
        { original, echo, warnedHP: warned.hp, hitHP: hit.hp, calls: hit.calls });
    await h.begin('echoReplay'); await h.begin('echoReplay');
    const pending = (await h.snapshot()).field;
    add('重复请求回响仍最多一道待触发剑痕', pending.zones.filter(z => z.kind === 'echo' && z.startsAt > pending.now).length === 1,
        pending.zones.filter(z => z.kind === 'echo'));
    await shot('echo-replay-fixed');
}

const isEmpty = field => field && field.zones.length === 0 && field.webs.length === 0
    && field.eggs.length === 0 && field.motion === null;

async function checkCleanup(h, plan, add) {
    const kind = plan.level === '1-4' ? 'guardianHammer' : plan.level === '2-4' ? 'spiderWeb' : 'echoReplay';
    const persistent = async () => {
        await h.fresh();
        const cast = await h.begin(kind);
        if (kind === 'spiderWeb') {
            await h.until(cast.snapshot.zones[0].startsAt + 0.05);
            const eggs = await h.begin('spiderEggs'); await h.until(eggs.snapshot.zones[0].startsAt + 0.05);
            await h.begin('spiderDrop'); await h.tick(18);
        } else if (kind === 'echoReplay') {
            await h.begin('echoStep'); await h.tick(18);
        }
        return cast;
    };
    await persistent();
    const seeded = await h.snapshot();
    add(`${plan.level} 清理夹具确有待取消的技能状态`, plan.level === '2-4'
        ? seeded.field.webs.length > 0 && seeded.field.eggs.length === 2 && seeded.field.motion !== null
        : plan.level === '3-4' ? seeded.field.zones.some(z => z.kind === 'echo') && seeded.field.motion !== null
            : seeded.field.zones.length > 0, seeded.field);
    await h.press('Escape');
    const paused = await h.snapshot(); await h.tick(120); const waiting = await h.snapshot();
    add(`${plan.level} 暂停两秒冻结技能时钟与HP`, paused.ui === 'paused' && waiting.ui === 'paused'
        && paused.field.now === waiting.field.now && paused.hp === waiting.hp,
        { paused: paused.field.now, waiting: waiting.field.now, hp: waiting.hp, pausedUI: paused.ui, waitingUI: waiting.ui });
    await h.press('Escape'); const resumed = await h.snapshot();
    add(`${plan.level} 恢复后技能时钟继续`, resumed.ui === 'none' && resumed.field.now > waiting.field.now,
        { before: waiting.field.now, after: resumed.field.now });
    await persistent();
    const phase = await h.page.evaluate(() => {
        const b = window.__bossCheckGame.scene.getScene('Level').enemies.getBoss();
        const next = b.phaseIndex === 0 ? 1 : 2;
        b.hp = b.def.hp * (next === 1 ? 0.5 : 0.25); b.invincibleUntil = 0;
        return next;
    });
    await h.tick(2);
    const changed = await h.snapshot();
    add(`${plan.level} 阶段变化取消旧预警/实体/脚本动作`, changed.boss.phase === phase && isEmpty(changed.field)
        && changed.player.speedFactor === 1 && changed.boss.alpha === 1 && !changed.boss.contactSuppressed
        && !changed.boss.collisionNone, { field: changed.field, boss: changed.boss, player: changed.player });
    await persistent();
    await h.page.evaluate(() => window.__bossCheckGame.scene.getScene('Level').onPlayerDeath());
    await h.tick(1); const dead = await h.snapshot();
    add(`${plan.level} 玩家死亡清理技能场并停止伤害`, dead.player.dead && isEmpty(dead.field)
        && dead.player.speedFactor === 1, dead.field);
    await h.tick(180);
    const retry = await h.snapshot();
    add(`${plan.level} 死亡重试恢复首领且无卵网/动作残留`, !retry.player.dead && retry.boss !== null
        && isEmpty(retry.field) && retry.player.speedFactor === 1 && retry.boss.alpha === 1
        && !retry.boss.contactSuppressed && !retry.boss.collisionNone, { boss: retry.boss, field: retry.field });
    await persistent();
    await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getBoss();
        b.invincibleUntil = 0; b.applyHit(b.hp + 1, s.player.sprite.x);
    });
    await h.tick(2); const killed = await h.snapshot();
    add(`${plan.level} 首领死亡取消所有残留技能`, killed.boss === null && isEmpty(killed.field), killed.field);
    await persistent();
    await h.page.evaluate(() => { window.__oldBossAbility = window.__bossCheckGame.scene.getScene('Level').bossAbilities; });
    await h.enter('1-1');
    const exited = await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level');
        return { old: JSON.parse(JSON.stringify(window.__oldBossAbility.field.snapshot)),
            current: s.bossAbilities ? JSON.parse(JSON.stringify(s.bossAbilities.field.snapshot)) : null,
            level: s.levelId };
    });
    add(`${plan.level} 切关销毁旧技能场，普通关无残留`, exited.level === '1-1' && isEmpty(exited.old)
        && (exited.current === null || isEmpty(exited.current)), exited);
}

async function checkNaturalAI(h, plan, add) {
    await h.fresh();
    await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getBoss();
        window.__naturalBossCasts = [];
        const original = s.bossAbilities.begin;
        s.bossAbilities.begin = function (enemy, attack) {
            window.__naturalBossCasts.push({ kind: attack.skill.kind, phase: enemy.phaseIndex,
                now: this.field.snapshot.now });
            return original.call(this, enemy, attack);
        };
        // 第二阶段包含蛛卵和延迟回响；只构造血量区间，不手动请求施招。
        b.hp = b.def.hp * 0.5; b.invincibleUntil = 0; b.skillCooldown = 0; b.skillQueue = []; b.bossAttack = null;
        s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
    });
    await h.tick(1200);
    const natural = await h.page.evaluate(() => ({ casts: window.__naturalBossCasts,
        ui: window.__SEAPP_UI__.state, dead: window.__bossCheckGame.scene.getScene('Level').dead }));
    add(`${plan.level} 正常EnemyAI第二阶段实际触发三种独立技能`, plan.skills.every(kind => natural.casts.some(c => c.kind === kind))
        && !natural.dead && natural.ui === 'none', natural);
}

/** K7：Boss技能与玩家挥击在同一真实Arcade帧命中时，先处理玩家死亡。 */
async function checkSimultaneousLethal(h, add, shot, attackKey = 'j') {
    const arena = await h.fresh();
    await h.page.evaluate(() => {
        const b = window.__bossCheckGame.scene.getScene('Level').enemies.getBoss();
        b.phaseIndex = 2; b.hp = b.def.hp * 0.25; b.invincibleUntil = 0;
    });
    const cast = await h.begin('guardianHammer');
    await h.until(cast.snapshot.zones[0].startsAt + 1 / 60);
    await h.page.evaluate(() => { window.__bossCheckGame.scene.getScene('Level').player.iFrameUntil = Number.MAX_SAFE_INTEGER; });
    await h.place(arena.x + 57, arena.floor);
    await h.key('a', true); await h.tick(1); await h.key('a', false); await h.tick(1);
    if (attackKey === '1') {
        await h.page.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__;
            d.skills.syncEarned(10); d.skills.unlock('sk_blade_focus'); d.skills.unlock('sk_whirlwind');
            d.skills.equip('sk_whirlwind', 0); d.skills.cooldowns.clear();
        });
    }
    const before = await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getBoss();
        s.player.teleportTo(b.sprite.x + 57, s.ctx.bossArena.bottom - 32);
        b.hp = 1; b.phaseIndex = 2; b.invincibleUntil = 0;
        s.player.iFrameUntil = 0; s.player.attackLockMs = 0;
        window.__SEAPP_DOMAIN__.resources.fromSnapshot({ hp: 1, hpMax: 100, sp: 50, spMax: 50 });
        window.__bossDamageCalls = [];
        return { bossHP: b.hp, playerHP: 1, facing: s.player.getFacing(), now: s.bossAbilities.field.snapshot.now,
            zone: s.bossAbilities.field.damageZones[0], gap: s.player.body.left - b.body.right,
            player: { x: s.player.body.x, y: s.player.body.y, width: s.player.body.width, height: s.player.body.height },
            boss: b.getHurtbox() };
    });
    await h.press(attackKey, 1);
    const after = await h.page.evaluate(() => {
        const s = window.__bossCheckGame.scene.getScene('Level'), b = s.enemies.getEntities().find(e => e.def.kind === 'boss');
        return { bossHP: b.hp, bossDead: b.dead, playerHP: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp,
            playerDead: s.dead, calls: window.__bossDamageCalls };
    });
    add(`K7 已激活锤区双方1HP时真实${attackKey === 'j' ? 'J' : '1键范围技'}同帧互杀以玩家死亡优先`, before.gap > 0 && before.zone !== undefined
        && before.facing === -1 && after.playerDead && after.playerHP === 0 && !after.bossDead && after.bossHP === 1,
        { before, after });
    await shot(`guardian-simultaneous-lethal-${attackKey === 'j' ? 'J' : 'AOE'}`);
}

/** 独立Chrome与空白存储；不连接用户已有浏览器或游玩存档。 */
export async function checkBossIdentities(source, {
    url = 'http://127.0.0.1:8100', outputDir = 'output/playwright/boss-identities', only,
    onProgress = () => {}, k7Only = false, k7Attack = 'j'
} = {}) {
    const browserType = source.context ? source.context().browser().browserType() : source;
    const browser = await browserType.launch({ channel: 'chrome', headless: true,
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows'] });
    const cases = [], errors = [], screenshots = [];
    const selected = BOSS_IDENTITY_PLAN.filter(plan => !only || only.includes(plan.level));
    const add = (name, passed, detail = null) => {
        const result = { name, passed, detail };
        cases.push(result); onProgress(result);
    };
    await mkdir(outputDir, { recursive: true });
    let page;
    try {
        page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); } });
        const h = await createHarness(page, url);
        const shot = async name => {
            const path = resolve(outputDir, `${name}.png`);
            await page.screenshot({ path }); screenshots.push(path);
        };
        for (const plan of selected) {
            await h.enter(plan.level);
            const ready = await page.evaluate(() => {
                const s = window.__bossCheckGame.scene.getScene('Level');
                return Boolean(s.bossAbilities?.field.snapshot && typeof s.bossAbilities.begin === 'function');
            });
            add(`${plan.level} 独立技能运行桥接存在`, ready);
            if (!ready) { continue; }
            try {
                if (k7Only) { await checkSimultaneousLethal(h, add, shot, k7Attack); continue; }
                await checkTiming(h, plan, add, shot);
                await checkBasicDodges(h, plan, add);
                if (plan.level === '1-4') { await checkGuardian(h, add, shot); }
                else if (plan.level === '2-4') { await checkSpider(h, add, shot); }
                else { await checkEcho(h, add, shot); }
                await checkNaturalAI(h, plan, add);
                if (plan.level === '1-4') {
                    await checkSimultaneousLethal(h, add, shot);
                    await checkSimultaneousLethal(h, add, shot, '1');
                }
                await checkCleanup(h, plan, add);
            } catch (error) {
                add(`${plan.level} 技能流程未完成`, false, String(error));
                await shot(`${plan.level}-failure`);
            }
        }
        add('技能浏览器无pageerror及console.error', errors.length === 0, errors);
        return { passed: cases.length > 1 && cases.every(c => c.passed), cases, errors, screenshots,
            scope: '单点构造施招与实际EnemyAI冒烟；真实Arcade、HP与基础输入，不代表正常战斗难度或出生点通关' };
    } catch (error) {
        return { passed: false, cases, errors, screenshots, error: String(error), pending: selected };
    } finally { await browser.close(); }
}
