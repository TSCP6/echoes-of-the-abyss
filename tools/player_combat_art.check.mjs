/** 隔离存档，实际执行六武器、九主动技能及界面图标。 */
async function checkPlayerCombatArt(sourcePage, { url = 'http://127.0.0.1:8096' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [], cases = [];
        const add = (name, passed, detail) => cases.push({ name, passed, ...(passed ? {} : { detail }) });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready);
        await page.waitForTimeout(500);
        const ids = await page.evaluate(async () => {
            const { WEAPONS } = await import('/src/game/data/weapons.ts');
            const { SKILLS } = await import('/src/game/data/skills.ts');
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            return { weapons: WEAPONS.map(w => w.id), active: SKILLS.filter(s => s.kind === 'active').map(s => s.id),
                passive: SKILLS.filter(s => s.kind === 'passive').map(s => s.id), all: SKILLS.map(s => s.id) };
        });
        const bodies = await page.evaluate(() => {
            const game = window.__SEAPP__.game;
            return ['player_swing_0', 'player_swing_1', 'player_swing_2', 'player_swing_3', 'player_shoot_0'].map(key => {
                const c = document.createElement('canvas'); c.width = c.height = 64;
                const ctx = c.getContext('2d'); ctx.drawImage(game.textures.get(key).getSourceImage(), 0, 0);
                const data = ctx.getImageData(0, 0, 64, 64).data;
                return Array.from(data).filter((v, i) => i % 4 === 3 && v > 0).length;
            });
        });
        add('攻击各帧保留角色身体而非白色碎块', bodies.every(n => n > 300), bodies);
        for (const id of ids.weapons) {
            const attack = await page.evaluate(async id => {
                const { WEAPONS } = await import('/src/game/data/weapons.ts');
                const def = WEAPONS.find(w => w.id === id);
                const d = window.__SEAPP_DOMAIN__, s = window.__SEAPP__.game.scene.getScene('Level');
                d.inventory.fromSnapshot({ ...d.inventory.toSnapshot(), equipped: { main: id, sub: 'wpn_crossbow' } });
                d.inventory.addItem('itm_arrow', 20); d.inventory.addItem('itm_dart', 20);
                s.playerCombatFx.clear(); s.projectiles.clear();
                const accepted = s.combat.tryAttack('main');
                const shots = s.projectiles.getActive().map(p => ({ texture: p.sprite.texture.key, source: p.spec.sourceId }));
                return { accepted, shots, weapon: s.playerCombatFx.attack?.def.id, type: def.type };
            }, id);
            add(`${id} 成功触发独立武器动画`, attack.accepted && attack.weapon === id, attack);
            if (attack.type === 'ranged') {
                const expected = { wpn_crossbow: 'combat_bolt', wpn_dartgun: 'combat_dart', wpn_firestaff: 'combat_fire' }[id];
                add(`${id} 弹体正确且保留伤害来源`, attack.shots.length === 1 && attack.shots[0].texture === expected && attack.shots[0].source === id, attack.shots);
            }
            await page.waitForTimeout(30);
            await page.screenshot({ path: `output/player-combat-art/${id}.png` });
            await page.waitForTimeout(250);
        }
        for (const id of ids.active) {
            const cast = await page.evaluate(async ({ id, all }) => {
                const { SKILLS } = await import('/src/game/data/skills.ts');
                const { PLAYER_SKILL_ART } = await import('/src/game/data/playerCombatArt.ts');
                const d = window.__SEAPP_DOMAIN__, s = window.__SEAPP__.game.scene.getScene('Level');
                d.skills.syncEarned(46);
                d.skills.fromSnapshot({ unlocked: all, loadout: [id, null, null, null] });
                d.resources.refill(); d.resources.applyDamage(10);
                s.playerCombatFx.clear(); s.projectiles.clear();
                s.player.teleportTo(s.ctx.spawn.x + 80, s.ctx.spawn.y);
                s.tryCastSlot(0);
                const skill = SKILLS.find(s => s.id === id);
                const expected = PLAYER_SKILL_ART[id].kind;
                return { expected, present: s.playerCombatFx.pending.some(f => f.kind === expected),
                    shots: s.projectiles.getActive().length, expectedShots: skill.effect.projectileCount ?? 0,
                    hp: d.resources.getSnapshot().hp };
            }, { id, all: ids.all });
            add(`${id} 成功施放对应效果和正确弹数`, cast.present && cast.shots === cast.expectedShots, cast);
            await page.waitForTimeout(45);
            await page.screenshot({ path: `output/player-combat-art/${id}.png` });
            await page.waitForTimeout(550);
        }
        const passive = await page.evaluate(ids => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return ids.map(id => {
                s.playerCombatFx.clear();
                window.__SEAPP_DOMAIN__.emit('skill:unlocked', { skillId: id, remainingSkp: 0 });
                return s.playerCombatFx.pending.some(f => f.kind === 'passive');
            });
        }, ids.passive);
        add('十二个被动解锁都有生效反馈', passive.length === 12 && passive.every(Boolean), passive);
        for (const id of ids.weapons) {
            await page.waitForTimeout(180);
            const facing = await page.evaluate(id => {
                const d = window.__SEAPP_DOMAIN__, s = window.__SEAPP__.game.scene.getScene('Level');
                d.inventory.fromSnapshot({ ...d.inventory.toSnapshot(), equipped: { main: id, sub: null } });
                s.player.facing = -1; s.player.sprite.setFlipX(true);
                s.playerCombatFx.clear(); s.projectiles.clear();
                const accepted = s.combat.tryAttack('main');
                const rect = s.playerCombatFx.pending.find(f => f.rect)?.rect;
                const shots = s.projectiles.getActive();
                return accepted && (rect ? rect.x + rect.width <= s.player.sprite.x : shots.every(p => p.sprite.body.velocity.x < 0));
            }, id);
            add(`${id} 向左攻击与实际判定方向一致`, facing);
        }
        await page.keyboard.down('y'); await page.waitForTimeout(100); await page.keyboard.up('y');
        await page.waitForSelector('.tree');
        await page.waitForFunction(() => [...document.querySelectorAll('.tree .node img')].every(i => i.complete && i.naturalWidth > 0));
        const iconCount = await page.locator('.tree .node img.combat-icon').count();
        add('技能树21个独立图标加载完整', iconCount === 21, iconCount);
        await page.waitForTimeout(350);
        await page.screenshot({ path: 'output/player-combat-art/skill-tree.png' });
        await page.keyboard.down('y'); await page.waitForTimeout(100); await page.keyboard.up('y');
        await page.waitForTimeout(100);
        const failure = await page.evaluate(() => {
            const d = window.__SEAPP_DOMAIN__, s = window.__SEAPP__.game.scene.getScene('Level');
            d.skills.fromSnapshot({ unlocked: ['sk_dash'], loadout: ['sk_dash', null, null, null] });
            d.resources.refill(); s.tryCastSlot(0); s.playerCombatFx.clear(); s.tryCastSlot(0);
            return s.playerCombatFx.pending.length === 0;
        });
        add('冷却中失败施放不产生虚假技能动画', failure);
        const clear = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.onPlayerDeath();
            return s.playerCombatFx.pending.length === 0 && s.playerCombatFx.attack === null;
        });
        add('死亡清除攻击与技能效果', clear);
        await page.waitForTimeout(1000);
        await page.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoLevel('1-2'));
        await page.waitForFunction(() => { const s = window.__SEAPP__.game.scene.getScene('Level'); return s.ready && s.levelId === '1-2'; });
        add('切关后图形对象无重复与残留', await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.children.list.filter(o => o.name === 'player-held-weapon').length === 1
                && s.children.list.filter(o => o.name === 'player-combat-effects').length === 1 && s.playerCombatFx.pending.length === 0;
        }));
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
