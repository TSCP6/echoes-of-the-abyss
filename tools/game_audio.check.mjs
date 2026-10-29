/** Playwright MCP：隔离 Chrome，不读取或覆盖用户游玩存档。 */
async function checkGameAudio(sourcePage, { url = 'http://127.0.0.1:8097' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [], cases = [];
    const add = (name, passed, detail) => cases.push({ name, passed, ...(passed ? {} : { detail }) });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        const before = await page.evaluate(async () => {
            const { AUDIO_FILES, BGM } = await import('/src/game/data/audioCatalog.ts');
            const game = window.__SEAPP__.game;
            return { files: AUDIO_FILES.length, loaded: AUDIO_FILES.every(key => game.cache.audio.exists(key)),
                music: Object.values(BGM).map(key => ({ key, duration: game.cache.audio.get(key).duration })) };
        });
        add('36 组音频全部预加载，四首配乐均超过一分钟', before.files === 36 && before.loaded && before.music.every(m => m.duration > 60), before);
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready);
        await page.waitForTimeout(1100);
        const boot = await page.evaluate(async () => {
            const a = window.__SEAPP_AUDIO__.director;
            const sm = window.__SEAPP__.game.sound;
            const original = sm.add.bind(sm);
            window.__audioAdded = [];
            sm.add = (key, config) => { window.__audioAdded.push(key); return original(key, config); };
            const s = window.__SEAPP__.game.scene.getScene('Level');
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            s.scene.pause();
            const analyser = sm.context.createAnalyser(); analyser.fftSize = 2048;
            sm.masterVolumeNode.connect(analyser); window.__audioAnalyser = analyser;
            return { context: sm.context.state, playing: sm.sounds.filter(s => s.isPlaying && s.loop).map(s => ({ key: s.key, volume: s.volume })), music: a.currentBgm };
        });
        add('手势后音频运行，关卡仅有一首低音量探索音乐', boot.context === 'running' && boot.playing.length === 1 && boot.music === 'level' && boot.playing[0].volume > 0 && boot.playing[0].volume < .4, boot);
        await page.waitForTimeout(150);
        const signal = await page.evaluate(() => {
            const data = new Float32Array(2048); window.__audioAnalyser.getFloatTimeDomainData(data);
            return Math.max(...data.map(Math.abs));
        });
        add('真实 WebAudio 输出含非静音信号', signal > .00001 && signal < .9, signal);

        const aac = await page.evaluate(async () => {
            const { AUDIO_FILES } = await import('/src/game/data/audioCatalog.ts');
            const context = window.__SEAPP__.game.sound.context, result = [];
            for (const key of AUDIO_FILES) {
                const response = await fetch(`/assets/audio/${key}.m4a`);
                const buffer = await context.decodeAudioData(await response.arrayBuffer());
                result.push({ key, ok: response.ok && buffer.length > 100, duration: buffer.duration });
            }
            return result;
        });
        add('36 个 AAC 回退文件均在真实浏览器成功解码', aac.length === 36 && aac.every(r => r.ok), aac.filter(r => !r.ok));
        const ids = await page.evaluate(async () => {
            const { WEAPONS } = await import('/src/game/data/weapons.ts');
            const { SKILLS } = await import('/src/game/data/skills.ts');
            return { weapons: WEAPONS.map(w => w.id), active: SKILLS.filter(s => s.kind === 'active').map(s => s.id), all: SKILLS.map(s => s.id) };
        });
        for (const id of ids.weapons) {
            const result = await page.evaluate(async id => {
                const { WEAPON_SFX, SFX } = await import('/src/game/data/audioCatalog.ts');
                const d = window.__SEAPP_DOMAIN__, s = window.__SEAPP__.game.scene.getScene('Level');
                d.inventory.fromSnapshot({ ...d.inventory.toSnapshot(), equipped: { main: id, sub: 'wpn_crossbow' } });
                d.inventory.addItem('itm_arrow', 20); d.inventory.addItem('itm_dart', 20);
                s.player.teleportTo(s.ctx.spawn.x, s.ctx.spawn.y); s.projectiles.clear();
                window.__audioAdded = [];
                const accepted = s.combat.tryAttack('main');
                return { accepted, added: [...window.__audioAdded], expected: SFX[WEAPON_SFX[id]].file };
            }, id);
            add(`${id} 实际攻击播放对应音色`, result.accepted && result.added.length === 1 && result.added[0] === result.expected, result);
            await page.waitForTimeout(400);
        }
        for (const id of ids.active) {
            const result = await page.evaluate(async ({ id, all }) => {
                const { SKILL_SFX, SFX } = await import('/src/game/data/audioCatalog.ts');
                const d = window.__SEAPP_DOMAIN__, s = window.__SEAPP__.game.scene.getScene('Level');
                d.inventory.fromSnapshot({ ...d.inventory.toSnapshot(), equipped: { main: 'wpn_shortsword', sub: 'wpn_crossbow' } });
                d.skills.syncEarned(46); d.skills.fromSnapshot({ unlocked: all, loadout: [id, null, null, null] });
                d.resources.refill(); d.resources.applyDamage(10);
                window.__audioAdded = [];
                s.tryCastSlot(0);
                return { added: [...window.__audioAdded], expected: SFX[SKILL_SFX[id]].file };
            }, { id, all: ids.all });
            add(`${id} 真实施放只播放一次技能声`, result.added.length === 1 && result.added[0] === result.expected, result);
            await page.waitForTimeout(750);
        }
        const rejected = await page.evaluate(async () => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            window.__audioAdded = []; s.tryCastSlot(0);
            return [...window.__audioAdded];
        });
        add('冷却中拒绝施放只发轻量错误提示', rejected.length === 1 && rejected[0] === 'sfx_ui_error', rejected);

        for (const key of ['menu', 'level', 'ruins', 'boss']) {
            await page.evaluate(async key => {
                const a = window.__SEAPP_AUDIO__.director;
                a.playBgm(key);
            }, key);
            await page.waitForTimeout(950);
            const loop = await page.evaluate(async () => {
                const a = window.__SEAPP_AUDIO__.director;
                const sound = a.bgmSound; window.__loopCount = 0;
                if (sound === null) { throw new Error(`音乐实例缺失：${a.currentBgm}，attached=${a.game === window.__SEAPP__.game}，context=${window.__SEAPP__.game.sound.context.state}`); }
                sound.once('looped', () => window.__loopCount++);
                sound.setSeek(sound.duration - .12);
                return { sounds: window.__SEAPP__.game.sound.sounds.filter(s => s.isPlaying && s.loop).length, volume: sound.volume };
            });
            await page.waitForTimeout(650);
            const looped = await page.evaluate(async () => {
                const a = window.__SEAPP_AUDIO__.director;
                return window.__loopCount > 0 && a.bgmSound.isPlaying;
            });
            add(`${key} 在暂停场景完成淡化并实际越过循环点`, loop.sounds === 1 && loop.volume > 0 && looped, { ...loop, looped });
        }
        const phases = await page.evaluate(async () => {
            const a = window.__SEAPP_AUDIO__.director;
            const first = a.bgmSound; const seek = first.seek;
            a.setBossPhase(0); a.setBossPhase(1); a.setBossPhase(2);
            return { same: first === a.bgmSound, seek, after: a.bgmSound.seek };
        });
        add('Boss 三阶段保留同一播放实例与时间轴', phases.same && phases.after >= phases.seek, phases);
        const mute = await page.evaluate(async () => {
            const a = window.__SEAPP_AUDIO__.director;
            const d = window.__SEAPP_DOMAIN__;
            a.playBgm('menu'); a.playSfx('heal');
            d.settings.setVolume('master', 0);
            return window.__SEAPP__.game.sound.sounds.filter(s => s.isPlaying).map(s => ({ key: s.key, scheduled: s.currentConfig.volume }));
        });
        await page.waitForTimeout(950);
        const mutedSignal = await page.evaluate(() => {
            const data = new Float32Array(2048); window.__audioAnalyser.getFloatTimeDomainData(data);
            return { peak: Math.max(...data.map(Math.abs)), silentNodes: window.__SEAPP__.game.sound.sounds.filter(s => s.isPlaying).every(s => s.volume === 0) };
        });
        // AudioParam.value 在音频渲染线程的下一量子才刷新；同任务先检查已提交值，再检查实际输出。
        add('淡化途中静音立即生效，输出信号归零且不会回弹', mute.every(s => s.scheduled === 0) && mutedSignal.silentNodes && mutedSignal.peak < .000001, { mute, mutedSignal });
        await page.evaluate(() => window.__SEAPP_DOMAIN__.settings.setVolume('master', 80));
        for (let i = 0; i < 6; i++) {
            await page.evaluate(async i => {
                const { sceneDirector } = await import('/src/game/systems/sceneDirector.ts');
                if (i % 2 === 0) sceneDirector.gotoCamp(1); else sceneDirector.gotoMenu();
            }, i);
            await page.waitForTimeout(1250);
        }
        const cleanup = await page.evaluate(async () => {
            const a = window.__SEAPP_AUDIO__.director;
            const game = window.__SEAPP__.game;
            return { loops: game.sound.sounds.filter(s => s.isPlaying && s.loop).length,
                sfx: a.activeSfx.size, tracks: a.music.size, stepListeners: game.events.listeners('step').filter(f => f === a.onStep).length,
                current: a.currentBgm };
        });
        add('六次营地/菜单切换后仅一首钢琴、一次时钟订阅且无残留音效', cleanup.loops === 1 && cleanup.tracks === 1 && cleanup.sfx === 0 && cleanup.stepListeners === 1 && cleanup.current === 'menu', cleanup);
        for (const id of ['2-1', '3-1', '1-4']) {
            await page.evaluate(id => window.__SEAPP_DIRECTOR__.director.gotoLevel(id), id);
            await page.waitForFunction(id => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                return s.ready && s.levelId === id;
            }, id);
            await page.waitForTimeout(950);
            const music = await page.evaluate(() => window.__SEAPP_AUDIO__.director.currentBgm);
            add(`${id} 实际进入关卡选择对应区域音乐`, music === (id === '1-4' ? 'level' : 'ruins'), music);
        }
        await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'), boss = s.enemies.getBoss();
            s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
            s.player.teleportTo(boss.sprite.x - 70, boss.sprite.y);
        });
        await page.waitForTimeout(1100);
        const engage = await page.evaluate(() => ({ music: window.__SEAPP_AUDIO__.director.currentBgm,
            engaged: window.__SEAPP__.game.scene.getScene('Level').enemies.getBoss().bossEngaged }));
        add('真实进入 Boss 战场后才切换战斗钢琴', engage.engaged && engage.music === 'boss', engage);
        const kill = await page.evaluate(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level'), boss = s.enemies.getBoss();
            s.combat.hitEnemy(boss, 1000000, s.player.sprite.x, 1, 'wpn_greataxe');
            return { dead: boss.dead, music: window.__SEAPP_AUDIO__.director.currentBgm };
        });
        add('实际击败 Boss 后恢复区域音乐', kill.dead && kill.music === 'level', kill);
        await page.evaluate(() => window.__SEAPP__.game.scene.getScene('Level').onPlayerDeath());
        await page.waitForTimeout(1400);
        const retry = await page.evaluate(() => ({ music: window.__SEAPP_AUDIO__.director.currentBgm,
            dead: window.__SEAPP__.game.scene.getScene('Level').dead,
            loops: window.__SEAPP__.game.sound.sounds.filter(s => s.isPlaying && s.loop).length }));
        add('死亡重试后保留区域曲且仅一个音乐声道', !retry.dead && retry.music === 'level' && retry.loops === 1, retry);
        add('控制台无异常', errors.length === 0, errors);
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
    } catch (error) {
        return { passed: cases.filter(c => c.passed).length, total: cases.length + 1, cases,
            errors: [...errors, String(error)] };
    } finally { await browser.close(); }
}
