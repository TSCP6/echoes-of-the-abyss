/** 隔离 Chrome：守卫者三阶段真实前摇时长与预警期间静止。 */
async function checkGuardianCharge(sourcePage, { url = 'http://localhost:8097' } = {}) {
    const browser = await sourcePage.context().browser().browserType().launch({ channel: 'chrome', headless: true });
    const errors = [], cases = [];
    try {
        const page = await browser.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(url);
        await page.waitForFunction(() => window.__SEAPP_UI__?.booted);
        await page.getByRole('button', { name: '关卡选择', exact: true }).click();
        await page.getByRole('button', { name: '1-1', exact: true }).click();
        await page.waitForFunction(() => window.__SEAPP__.game.scene.getScene('Level').ready
            && !window.__SEAPP_DIRECTOR__.director.isTransitioning);
        await page.evaluate(() => window.__SEAPP_DIRECTOR__.director.gotoLevel('1-4'));
        await page.waitForFunction(() => {
            const s = window.__SEAPP__.game.scene.getScene('Level');
            return s.ready && s.levelId === '1-4' && !window.__SEAPP_DIRECTOR__.director.isTransitioning;
        });
        for (const [phase, hp, expected, speed] of [[0, 600, 0.9, 480], [1, 300, 0.8, 600], [2, 100, 0.7, 720]]) {
            const result = await page.evaluate(({ hp, expected, speed }) => new Promise(resolve => {
                const s = window.__SEAPP__.game.scene.getScene('Level');
                const boss = s.enemies.getBoss();
                boss.reset();
                boss.hp = hp;
                s.player.teleportTo(boss.sprite.x - 180, boss.sprite.y);
                s.player.iFrameUntil = Number.MAX_SAFE_INTEGER;
                let observed = null;
                let stationary = true;
                const deadline = s.time.now + 8000;
                const sample = () => {
                    const a = boss.getBossAttack();
                    if (a?.skill.kind === 'charge' && a.stage === 'windup') {
                        observed ??= { remaining: a.remaining, time: s.time.now, duration: a.windupSec };
                        stationary &&= boss.body.velocity.x === 0;
                    }
                    if (observed && a?.stage === 'active') {
                        const elapsed = (s.time.now - observed.time) / 1000;
                        resolve({ observed, elapsed, stationary, speed: Math.abs(boss.body.velocity.x),
                            passed: stationary && observed.duration === expected
                                && Math.abs(elapsed - observed.remaining) < 0.06
                                && Math.abs(boss.body.velocity.x) === speed });
                    } else if (s.time.now > deadline) { resolve({ passed: false, reason: '未观察到完整冲刺' }); }
                    else { requestAnimationFrame(sample); }
                };
                requestAnimationFrame(sample);
            }), { hp, expected, speed });
            cases.push({ phase: phase + 1, ...result });
        }
        return { passed: cases.every(c => c.passed) && errors.length === 0, cases, errors };
    } finally { await browser.close(); }
}
