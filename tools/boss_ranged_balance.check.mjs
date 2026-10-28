/**
 * 三首领远程应对的隔离浏览器验收。
 * 每场仅在开始前设置章节装备/198箭/100HP与双方起点；之后仅发送真实键盘事件。
 * 不设无敌、不补血补弹、不改BossHP、不停止AI、不手选技能、不传送战斗中的角色。
 * 确定性60Hz只替代墙钟，仍运行完整Phaser/Arcade/场景管线。
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const RANGED_BALANCE_PLAN = [
    { level: '1-4', name: '石像守卫', weaponLevel: 1 },
    { level: '2-4', name: '深渊蛛后', weaponLevel: 3 },
    { level: '3-4', name: '回响之影', weaponLevel: 5 }
];
const strategies = ['stationary', 'retreat', 'platform', 'active', 'melee'];

async function prepare(page, url, plan, mode) {
    await page.goto(url);
    await page.waitForFunction(() => window.__SEAPP_UI__?.booted && window.__SEAPP_DOMAIN__);
    await page.evaluate(id => {
        const exposed = window.__SEAPP__.game;
        const game = window.__rangedGame = exposed.__v_raw ?? exposed;
        if (!game.loop.running) game.loop.start(game.step.bind(game));
        document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel(id);
    }, plan.level);
    await page.waitForFunction(id => {
        const s = window.__rangedGame.scene.getScene('Level');
        return s.ready && s.levelId === id && s.scene.isActive() && window.__SEAPP_UI__.state === 'none'
            && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
    }, plan.level);
    return page.evaluate(({ plan, mode }) => {
        const game = window.__rangedGame, s = game.scene.getScene('Level'), d = window.__SEAPP_DOMAIN__;
        game.loop.stop();
        const b = s.enemies.getBoss(), r = s.ctx.bossArena, p = s.player;
        d.resources.fromSnapshot({ hp: 100, hpMax: 100, sp: 50, spMax: 50 });
        const slots = [{ slot: 0, itemId: 'itm_arrow', count: 99 }, { slot: 1, itemId: 'itm_arrow', count: 99 }];
        d.inventory.fromSnapshot({ slots, equipped: { main: 'wpn_shortsword', sub: 'wpn_crossbow' } });
        d.weapons.fromSnapshot({ 'wpn_shortsword#main': { level: plan.weaponLevel }, 'wpn_crossbow#sub': { level: plan.weaponLevel } });
        s.combat.setRng(() => 0.5);
        const tiles = s.ctx.onewayGroup.layer.data.flat().filter(t => t.index > 0 && t.pixelX > r.left + 48
            && t.pixelX < r.centerX && t.pixelY < r.bottom - 48);
        const platform = tiles.sort((a, b) => Math.abs(a.pixelX - (r.left + 224)) - Math.abs(b.pixelX - (r.left + 224)))[0];
        const x = mode === 'outside' ? r.left - 100 : mode === 'entry' ? r.left + 1
            : mode === 'platform' ? platform?.pixelX + 16 : r.centerX - 210;
        const floor = mode === 'platform' ? platform?.pixelY : r.bottom;
        if (!Number.isFinite(x) || !Number.isFinite(floor)) throw new Error('缺少真实高台，不能伪造平台验收');
        b.body.reset(mode === 'outside' ? r.left + 150 : mode === 'platform' ? x + 310 : r.centerX + 100, r.bottom - 24);
        p.teleportTo(x, floor - 32); p.body.reset(x, floor - 32);
        const telemetry = { casts: [], hits: [], bossHits: [], samples: [], zones: [], attacks: 0 };
        const attackBegan = s.combat.onAttackBegan;
        s.combat.onAttackBegan = function (...args) {
            telemetry.attacks++;
            return attackBegan?.apply(this, args);
        };
        const begin = s.bossAbilities.begin;
        s.bossAbilities.begin = function (enemy, attack) {
            telemetry.casts.push({ frame: window.__rangedRun.frames, kind: attack.skill.kind, phase: enemy.phaseIndex,
                playerX: p.sprite.x, playerFoot: p.body.bottom, bossX: enemy.sprite.x });
            return begin.call(this, enemy, attack);
        };
        const hit = b.applyHit;
        b.applyHit = function (...args) {
            const before = this.hp, result = hit.apply(this, args);
            telemetry.bossHits.push({ frame: window.__rangedRun.frames, amount: before - this.hp, hp: this.hp });
            return result;
        };
        const damage = s.combat.damagePlayer;
        s.combat.damagePlayer = function (...args) {
            const before = d.resources.getSnapshot().hp, result = damage.apply(this, args), after = d.resources.getSnapshot().hp;
            if (after < before) telemetry.hits.push({ frame: window.__rangedRun.frames, amount: before - after, source: args[1] });
            return result;
        };
        window.__rangedRun = { clock: game.loop.lastTime, frames: 0, held: new Set(), telemetry, mode,
            initial: { hp: 100, bossHP: b.hp, ammo: 198, playerX: x, playerFoot: floor, bossX: b.sprite.x,
                arena: { x: r.x, y: r.y, width: r.width, height: r.height }, platform: platform ? { x: platform.pixelX, y: platform.pixelY } : null },
            firstDamageFrame: null, lastDamageFrame: null, outputFrames: 0, seenZones: new Set(), dodgeDirection: 0,
            stop: null, boss: b };
        return window.__rangedRun.initial;
    }, { plan, mode });
}

async function advance(page, maxFrames) {
    return page.evaluate(maxFrames => {
        const run = window.__rangedRun, game = window.__rangedGame, s = game.scene.getScene('Level'), p = s.player;
        const d = window.__SEAPP_DOMAIN__, b = run.boss, r = s.ctx.bossArena;
        const map = { a: ['a', 'KeyA', 65], d: ['d', 'KeyD', 68], j: ['j', 'KeyJ', 74], k: ['k', 'KeyK', 75], jump: [' ', 'Space', 32] };
        const key = (name, down) => {
            if (run.held.has(name) === down) return;
            const [key, code, keyCode] = map[name];
            window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code, keyCode, which: keyCode, bubbles: true }));
            down ? run.held.add(name) : run.held.delete(name);
        };
        const horizontal = dir => { key('a', dir < 0); key('d', dir > 0); };
        for (let n = 0; n < maxFrames && !run.stop; n++) {
            const frame = run.frames, dx = b.sprite.x - p.sprite.x, sign = Math.sign(dx) || 1;
            let direction = 0, jump = false, fire = false;
            const field = s.bossAbilities.field.snapshot;
            const threats = field.zones.filter(z => z.damage > 0 && z.endsAt > field.now && z.startsAt - field.now < 0.9);
            const overlapX = z => p.body.right > z.rect.x - 32 && p.body.left < z.rect.x + z.rect.width + 32;
            const imminent = threats.filter(overlapX);
            if (run.mode === 'retreat') direction = -1; // 固定朝左后退，触墙之后仍按同一方向。
            if (run.mode === 'active' || run.mode === 'melee') {
                const targetDistance = run.mode === 'melee' ? b.body.width / 2 + 26 : 200;
                direction = Math.abs(dx) > targetDistance + 12 ? sign : Math.abs(dx) < targetDistance - 12 ? -sign : 0;
                const localized = imminent.filter(z => z.kind !== 'wave' && z.kind !== 'charge');
                // 已离开固定预警时停在外侧，直到伤害区结束再进场，避免在边界来回抖动。
                if (threats.some(z => z.kind !== 'wave' && z.kind !== 'charge') && localized.length === 0) direction = 0;
                if (localized.length) {
                    const zone = localized[0], center = zone.rect.x + zone.rect.width / 2;
                    direction = p.sprite.x < center ? -1 : 1;
                    if (p.sprite.x < r.left + 70) direction = 1;
                    if (p.sprite.x > r.right - 70) direction = -1;
                }
                const waveClose = field.zones.some(z => z.kind === 'wave' && z.endsAt > field.now
                    && z.startsAt - field.now < 0.2 && Math.abs(z.rect.x + z.rect.width / 2 - p.sprite.x) < 100
                    && Math.sign(p.sprite.x - z.rect.x - z.rect.width / 2) === z.direction);
                const chargeClose = b.getBossAttack()?.skill.kind === 'charge' && b.getBossAttack()?.stage === 'active'
                    && Math.abs(dx) < 240;
                if ((waveClose || chargeClose) && p.isGrounded()) jump = true;
            }
            // 只为瞄准短促转向；没有直接写facing或位置。站桩位置只会因真实受击后退发生变化。
            const cycle = run.mode === 'melee' ? 24 : 16;
            const aiming = frame % cycle >= cycle - 3;
            if (aiming && p.getFacing() !== sign) direction = sign;
            const attackPulse = frame % cycle === 0;
            if (attackPulse && Math.abs(dx) < (run.mode === 'melee' ? b.body.width / 2 + 52 : 475)) {
                if (p.getFacing() !== sign) direction = sign;
                else fire = run.mode !== 'active' && run.mode !== 'melee' || imminent.length === 0;
            }
            horizontal(direction); key('jump', jump);
            key('j', fire && run.mode === 'melee'); key('k', fire && run.mode !== 'melee' && run.mode !== 'entry');
            const beforeHP = b.hp;
            run.clock += 1000 / 60; game.step(run.clock, 1000 / 60); run.frames++;
            if (b.hp < beforeHP) {
                run.firstDamageFrame ??= frame; run.lastDamageFrame = frame;
            }
            if (fire) run.outputFrames++;
            for (const zone of s.bossAbilities.field.snapshot.zones) {
                if (!run.seenZones.has(zone.id)) {
                    run.seenZones.add(zone.id); run.telemetry.zones.push(JSON.parse(JSON.stringify(zone)));
                }
            }
            if (frame % 120 === 0) run.telemetry.samples.push({ seconds: frame / 60, hp: d.resources.getSnapshot().hp,
                bossHP: b.hp, ammo: d.inventory.countItem('itm_arrow'), x: p.sprite.x, foot: p.body.bottom,
                bossX: b.sprite.x, engaged: b.bossEngaged, locked: s.arena?.isActive, phase: b.phaseIndex,
                eggs: field.eggs.map(e => ({ x: e.rect.x, hp: e.hp, hatchAt: e.hatchAt })),
                summons: s.enemies.getSummons().map(e => ({ x: e.sprite.x, foot: e.body.bottom, hp: e.hp, dead: e.dead })) });
            if (s.dead || d.resources.getSnapshot().hp <= 0) run.stop = 'player-dead';
            else if (b.dead || b.hp <= 0) run.stop = 'boss-defeated';
            else if (run.frames >= 7200) run.stop = 'timeout';
        }
        return { frames: run.frames, stop: run.stop };
    }, maxFrames);
}

async function result(page, plan, mode) {
    return page.evaluate(({ plan, mode }) => {
        const s = window.__rangedGame.scene.getScene('Level'), d = window.__SEAPP_DOMAIN__, run = window.__rangedRun, b = run.boss;
        const hp = d.resources.getSnapshot().hp, ammo = d.inventory.countItem('itm_arrow');
        return { ...plan, strategy: mode, initial: run.initial, seconds: run.frames / 60, outcome: run.stop ?? 'sample-ended',
            hp, damageTaken: 100 - hp, bossHP: Math.max(0, b.hp), damageDealt: run.initial.bossHP - Math.max(0, b.hp),
            ammoUsed: 198 - ammo, ammoLeft: ammo, killed: b.dead, died: s.dead, phase: b.phaseIndex,
            engaged: b.bossEngaged, locked: s.arena?.isActive,
            firstDamageSeconds: run.firstDamageFrame === null ? null : run.firstDamageFrame / 60,
            lastDamageSeconds: run.lastDamageFrame === null ? null : run.lastDamageFrame / 60,
            attackInputSeconds: run.outputFrames / 60, successfulAttacks: run.telemetry.attacks,
            damageWindowSeconds: run.firstDamageFrame === null ? 0 : (run.lastDamageFrame - run.firstDamageFrame + 1) / 60,
            telemetry: run.telemetry };
    }, { plan, mode });
}

async function step(page, frames) {
    return page.evaluate(frames => {
        const run = window.__rangedRun, game = window.__rangedGame;
        for (let n = 0; n < frames; n++) {
            run.clock += 1000 / 60; game.step(run.clock, 1000 / 60); run.frames++;
        }
    }, frames);
}

async function press(page, key, frames = 2) {
    await page.keyboard.down(key); await step(page, frames); await page.keyboard.up(key); await step(page, 1);
}

/** 抗性单点仍通过J/K/1输入和实际弹丸命中；仅构造初始距离与装备。 */
async function checkResistance(browser, url, plans, add, errors) {
    const factors = {
        '1-4': { wpn_crossbow: 0.7, wpn_dartgun: 0.7, wpn_firestaff: 1, wpn_greataxe: 1.1 },
        '2-4': { wpn_crossbow: 0.9, wpn_dartgun: 0.9, wpn_firestaff: 1.15 },
        '3-4': { wpn_crossbow: 0.85, wpn_dartgun: 0.85, wpn_firestaff: 0.85 }
    };
    for (const plan of plans) {
        for (const [weapon, factor] of Object.entries(factors[plan.level])) {
            for (const skill of weapon === 'wpn_greataxe' ? [false] : [false, true]) {
                const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
                page.on('pageerror', error => errors.push(`${plan.level}/resistance: ${error.message}`));
                try {
                    await prepare(page, url, plan, 'stationary');
                    const fixture = await page.evaluate(({ weapon, skill }) => {
                        const s = window.__rangedGame.scene.getScene('Level'), d = window.__SEAPP_DOMAIN__, b = s.enemies.getBoss();
                        const hand = weapon === 'wpn_greataxe' ? 'main' : 'sub';
                        const eq = { main: 'wpn_shortsword', sub: 'wpn_crossbow', [hand]: weapon };
                        d.inventory.fromSnapshot({ slots: [{ slot: 0, itemId: 'itm_arrow', count: 99 }, { slot: 1, itemId: 'itm_dart', count: 99 }], equipped: eq });
                        const level = d.weapons.getLevel('wpn_crossbow', 'sub');
                        d.weapons.fromSnapshot({ [`${weapon}#${hand}`]: { level } });
                        if (skill) d.skills.fromSnapshot({ unlocked: ['sk_multishot'], loadout: ['sk_multishot', null, null, null] });
                        const x = b.sprite.x - b.body.width / 2 - 34;
                        s.player.teleportTo(x, s.ctx.bossArena.bottom - 32); s.player.body.reset(x, s.ctx.bossArena.bottom - 32);
                        return { hp: b.hp, level, hand, ammo: d.inventory.countItem(weapon === 'wpn_dartgun' ? 'itm_dart' : 'itm_arrow') };
                    }, { weapon, skill });
                    // 先运行入场帧，再攻击；近战hitSet不能把尚未开战的第一帧当成有效命中。
                    await step(page, 1);
                    await press(page, skill ? '1' : fixture.hand === 'main' ? 'j' : 'k');
                    await step(page, 35);
                    const measured = await page.evaluate(weapon => {
                        const d = window.__SEAPP_DOMAIN__, s = window.__rangedGame.scene.getScene('Level');
                        return { hp: s.enemies.getBoss()?.hp, hits: window.__rangedRun.telemetry.bossHits,
                            ammo: d.inventory.countItem(weapon === 'wpn_dartgun' ? 'itm_dart' : 'itm_arrow'), sp: d.resources.getSnapshot().sp };
                    }, weapon);
                    const base = skill ? 9 : weapon === 'wpn_greataxe' ? 22 : weapon === 'wpn_firestaff' ? 16 : weapon === 'wpn_dartgun' ? 8 : 9;
                    const expected = Math.max(1, Math.round(base * (1 + 0.15 * (fixture.level - 1)) * factor));
                    add(`${plan.level} ${weapon} ${skill ? '1键散射每颗' : 'J/K普通命中'}统一抗性`, measured.hits.length === (skill ? 3 : 1)
                        && measured.hits.every(hit => hit.amount === expected)
                        && (skill ? measured.sp < 50 : fixture.ammo - measured.ammo === (fixture.hand === 'sub' ? 1 : 0)),
                    { factor, expected, level: fixture.level, hits: measured.hits, ammoUsed: fixture.ammo - measured.ammo, sp: measured.sp });
                } catch (error) { add(`${plan.level} ${weapon}抗性单点执行`, false, String(error)); }
                finally { await page.close(); }
            }
        }
    }
}

/** 单招几何单点：允许初始阶段/施招构造；之后不传送、不补血，输入躲避。 */
async function checkTargetedSkills(browser, url, plans, add, errors) {
    const specs = [
        { level: '2-4', kind: 'spiderWeb', platform: true },
        { level: '2-4', kind: 'spiderEggs', platform: true },
        { level: '2-4', kind: 'spiderDrop', platform: true },
        { level: '3-4', kind: 'echoStep', dodge: false },
        { level: '3-4', kind: 'echoStep', dodge: true }
    ];
    for (const spec of specs.filter(spec => plans.some(plan => plan.level === spec.level))) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', error => errors.push(`${spec.kind}: ${error.message}`));
        const plan = plans.find(plan => plan.level === spec.level);
        try {
            await prepare(page, url, plan, spec.platform ? 'platform' : 'stationary');
            await step(page, 1); // Arcade先同步贴图偏移与真实脚底，再捕获施招支撑面。
            const initial = await page.evaluate(async kind => {
                const s = window.__rangedGame.scene.getScene('Level'), b = s.enemies.getBoss();
                const phase = b.def.phases.findIndex(p => p.skills.some(skill => skill.kind === kind));
                // 此段仅是隔离技能fixture，正常15场从不写BossHP、阶段或冷却。
                b.phaseIndex = phase; b.hp = b.def.hp * (phase === 1 ? 0.5 : phase === 2 ? 0.25 : 1);
                b.bossEngaged = true; b.invincibleUntil = 0; b.skillCooldown = 100000; b.skillQueue = [];
                s.arena.activate([s.player.body, b.body]); s.bossAbilities.reset();
                const skill = b.def.phases[phase].skills.find(skill => skill.kind === kind);
                const { beginBossAttack } = await import('/src/game/systems/bossAttack.ts');
                const attack = beginBossAttack(skill, s.player.sprite.x < b.sprite.x ? -1 : 1);
                b.bossAttack = attack; s.bossAbilities.begin(b, attack);
                return { foot: s.player.body.bottom, x: s.player.sprite.x, hp: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp,
                    now: s.bossAbilities.field.snapshot.now, skill, zones: JSON.parse(JSON.stringify(s.bossAbilities.field.snapshot.zones)) };
            }, spec.kind);
            if (spec.dodge) { await page.keyboard.down('a'); }
            const duration = spec.kind === 'spiderEggs' ? 4.5 : spec.kind === 'spiderWeb' ? 1.1 : 1.7;
            await step(page, Math.ceil(duration * 60));
            if (spec.dodge) { await page.keyboard.up('a'); }
            const measured = await page.evaluate(() => {
                const s = window.__rangedGame.scene.getScene('Level'), p = s.player;
                return { hp: window.__SEAPP_DOMAIN__.resources.getSnapshot().hp, x: p.sprite.x, foot: p.body.bottom,
                    speedFactor: p.moveSpeedFactor, field: JSON.parse(JSON.stringify(s.bossAbilities.field.snapshot)),
                    summons: s.enemies.getSummons().map(e => ({ x: e.sprite.x, foot: e.body.bottom, vx: e.body.velocity.x,
                        target: p.sprite.x, dead: e.dead, hp: e.hp })) };
            });
            if (spec.kind === 'spiderWeb') add('蛛后高台蛛网落在玩家支撑面并实际减速', measured.field.webs.some(w => w.rect.y + w.rect.height === initial.foot)
                && measured.speedFactor === 0.65, { initial, measured });
            else if (spec.kind === 'spiderEggs') {
                add('蛛后高台蛛卵预警与孵化点使用玩家支撑面', initial.zones.length > 0 && initial.zones.every(z => z.rect.y + z.rect.height === initial.foot)
                    && measured.summons.length > 0, { initial, measured });
                add('蛛后高台孵化物留在支撑面追击玩家', measured.summons.some(e => Math.abs(e.foot - initial.foot) < 6
                    && Math.sign(e.vx) === Math.sign(e.target - e.x)), { initial, measured });
            } else if (spec.kind === 'spiderDrop') add('蛛后俯袭实际命中高台站立玩家', initial.zones.some(z => z.kind === 'drop' && z.rect.y + z.rect.height === initial.foot)
                && measured.hp < initial.hp, { initial, measured });
            else add(`影子换位后${spec.dodge ? '提前移动可避开固定横斩' : '站立玩家被真实横斩命中'}`,
                spec.dodge ? measured.hp === initial.hp && Math.abs(measured.x - initial.x) > 100 : measured.hp < initial.hp,
                { initial, measured });
        } catch (error) { add(`${spec.kind} 高台/换位单点执行`, false, String(error)); }
        finally { await page.close(); }
    }
}

/** 隔离防御姿态fixture：构造初始朝向/收招，J/K/弹药与命中仍走真实战斗管线。 */
async function checkGuardianDefense(browser, url, plans, add, errors) {
    const plan = plans.find(plan => plan.level === '1-4');
    if (!plan) return;
    for (const posture of ['front', 'rear', 'broken']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', error => errors.push(`guardian/${posture}: ${error.message}`));
        try {
            await prepare(page, url, plan, 'stationary');
            if (posture === 'front') { await press(page, 'a', 3); }
            const before = await page.evaluate(async posture => {
                const s = window.__rangedGame.scene.getScene('Level'), b = s.enemies.getBoss(), p = s.player;
                b.bossEngaged = true; b.invincibleUntil = 0; b.skillCooldown = 100000; b.skillQueue = [];
                b.bossAttack = null; s.bossAbilities.reset(); s.arena.activate([p.body, b.body]);
                const x = posture === 'front' ? b.sprite.x + 310 : posture === 'broken' ? s.ctx.bossArena.right - 180
                    : b.sprite.x - b.body.width / 2 - 22;
                p.teleportTo(x, s.ctx.bossArena.bottom - 32); p.body.reset(x, s.ctx.bossArena.bottom - 32);
                if (posture === 'broken') {
                    b.phaseIndex = 1; b.hp = b.def.hp * 0.5;
                    b.body.reset(s.ctx.bossArena.right - 90, s.ctx.bossArena.bottom - 24);
                    const skill = b.def.phases[1].skills.find(skill => skill.kind === 'charge');
                    const { beginBossAttack } = await import('/src/game/systems/bossAttack.ts');
                    b.bossAttack = beginBossAttack(skill, 1); s.bossAbilities.begin(b, b.bossAttack);
                }
                window.__defenseChecks = [];
                const blocks = b.blocksProjectile;
                b.blocksProjectile = function (fromX) {
                    const blocked = blocks.call(this, fromX);
                    window.__defenseChecks.push({ blocked, guarding: this.guardianGuarding, fromX, bossX: this.sprite.x });
                    return blocked;
                };
                return { hp: b.hp, ammo: window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow') };
            }, posture);
            await step(page, 1);
            if (posture === 'broken') {
                for (let n = 0; n < 180; n++) {
                    if (await page.evaluate(() => window.__rangedGame.scene.getScene('Level').enemies.getBoss().armorBroken)) break;
                    await step(page, 1);
                }
            }
            const brokenBeforeShot = await page.evaluate(() => window.__rangedGame.scene.getScene('Level').enemies.getBoss().armorBroken);
            await press(page, 'k'); await step(page, 38);
            const measured = await page.evaluate(() => {
                const s = window.__rangedGame.scene.getScene('Level'), b = s.enemies.getBoss();
                return { hp: b.hp, ammo: window.__SEAPP_DOMAIN__.inventory.countItem('itm_arrow'),
                        facing: s.player.getFacing(), hits: window.__rangedRun.telemetry.bossHits, broken: b.armorBroken, checks: window.__defenseChecks };
            });
            const expected = posture === 'front' ? 0 : posture === 'rear' ? 6 : 9;
            add(`守卫${posture === 'front' ? '正面自然举盾拦住真实K弹丸' : posture === 'rear' ? '侧后开盾窗口K命中并保留武器抗性' : '真实撞墙收招破甲取消轻弩减伤'}`,
                before.hp - measured.hp === expected && before.ammo - measured.ammo === 1
                    && (posture !== 'front' || measured.checks.some(c => c.blocked && c.guarding))
                    && (posture !== 'broken' || brokenBeforeShot),
                { posture, expected, before, measured, brokenBeforeShot });
        } catch (error) { add(`守卫${posture}防御单点执行`, false, String(error)); }
        finally { await page.close(); }
    }
}

/** 独立空白存储；source可传Playwright chromium或已有页面以取browserType。 */
export async function checkBossRangedBalance(source, {
    url = 'http://127.0.0.1:8100', outputDir = 'output/playwright/boss-ranged-balance', only,
    modes = strategies, seconds = 120, resistance = true, targetedSkills = true, onProgress = () => {}
} = {}) {
    const browserType = source.context ? source.context().browser().browserType() : source;
    const browser = await browserType.launch({ channel: 'chrome', headless: true,
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    const cases = [], encounters = [], errors = [], screenshots = [];
    const add = (name, passed, detail) => { const item = { name, passed, detail }; cases.push(item); onProgress(item); };
    await mkdir(outputDir, { recursive: true });
    try {
        const selected = RANGED_BALANCE_PLAN.filter(p => !only || only.includes(p.level));
        for (const plan of selected) {
            for (const mode of ['outside', 'entry', ...modes]) {
                const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
                page.setDefaultTimeout(12000);
                page.on('pageerror', e => errors.push(`${plan.level}/${mode}: ${e.message}`));
                page.on('console', m => { if (m.type() === 'error') errors.push(`${plan.level}/${mode}: ${m.text()}`); });
                try {
                    await prepare(page, url, plan, mode);
                    const frames = mode === 'outside' ? 180 : mode === 'entry' ? 1 : seconds * 60;
                    for (let n = 0; n < frames; n += 300) { if ((await advance(page, Math.min(300, frames - n))).stop) break; }
                    const outcome = await result(page, plan, mode); encounters.push(outcome);
                    if (mode === 'outside') add(`${plan.level} 场外实弹不能扣BossHP`, outcome.damageDealt === 0 && outcome.ammoUsed > 0, outcome);
                    else if (mode === 'entry') add(`${plan.level} 身体进入当帧开战与锁场`, outcome.engaged && outcome.locked, outcome);
                    else {
                        add(`${plan.level}/${mode} 正常AI真实战斗已记录`, outcome.seconds > 0 && outcome.initial.hp === 100
                            && (mode === 'melee' ? outcome.ammoUsed === 0 : outcome.ammoUsed > 0), outcome);
                        if (['stationary', 'retreat', 'platform'].includes(mode)) add(`${plan.level}/${mode} 不躲避受到真实压迫且不能击杀`, outcome.damageTaken > 0 && !outcome.killed, {
                            hp: outcome.hp, bossHP: outcome.bossHP, seconds: outcome.seconds, outcome: outcome.outcome, casts: outcome.telemetry.casts });
                        else if (['active', 'melee'].includes(mode)) add(`${plan.level}/${mode} 主动应对保留真实击杀能力`, outcome.killed && !outcome.died && outcome.hp > 0, {
                            hp: outcome.hp, bossHP: outcome.bossHP, seconds: outcome.seconds, outcome: outcome.outcome, ammoUsed: outcome.ammoUsed });
                    }
                    const path = resolve(outputDir, `${plan.level}-${mode}.png`); await page.screenshot({ path }); screenshots.push(path);
                } catch (error) { add(`${plan.level}/${mode} 验收执行完成`, false, String(error)); }
                finally { await page.close(); }
            }
        }
        if (resistance) await checkResistance(browser, url, selected, add, errors);
        if (targetedSkills) await checkTargetedSkills(browser, url, selected, add, errors);
        if (targetedSkills) await checkGuardianDefense(browser, url, selected, add, errors);
        add('远程应对浏览器无控制台异常', errors.length === 0, errors);
        return { passed: cases.length > 1 && cases.every(c => c.passed), cases, encounters, errors, screenshots,
            scope: '单点入场后真实AI与键盘对战，章节武器1/3/5级、100HP、198箭、无战中补给；输赢如实记录，不替代真人难度或出生点通关验收' };
    } finally { await browser.close(); }
}
