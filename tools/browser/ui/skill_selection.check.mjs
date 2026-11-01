/** 隔离挂载真实技能树，验证选择不随鼠标/焦点漂移以及学习、绑定。 */
export async function checkSkillSelection(chromium, url = 'http://127.0.0.1:8111') {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const cases = [], errors = [];
    try {
        const p = await browser.newPage();
        const source = await (await fetch(url + '/src/ui/panels/SkillTreePanel.vue')).text();
        const vuePath = source.match(/from ["']([^"']*\/vue\.js[^"']*)/)[1];
        p.on('pageerror', e => errors.push(e.message));
        await p.route('**/__skill_selection_check.html', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="app"></div><script type="module">
            import {createApp} from '${vuePath}';
            import Tree from '/src/ui/panels/SkillTreePanel.vue';
            import {validateAll,markValidated} from '/src/game/domain/shared/configRegistry.ts';
            import {skillService} from '/src/game/domain/player/skillService.ts';
            import '/src/ui/tokens.css';
            if (!validateAll().ok) throw new Error('配置无效'); markValidated();
            skillService.syncEarned(10);window.skills=skillService;createApp(Tree).mount('#app');
            </script>` }));
        await p.goto(url + '/__skill_selection_check.html');
        await p.waitForSelector('.tree .node');
        const add = (name, passed) => cases.push({ name, passed });
        const details = () => p.locator('#skill-details').innerText();
        await p.locator('[data-skill=sk_dash]').click(); const initial = await details();
        await p.locator('[data-skill=sk_heal]').hover();
        add('鼠标经过其他技能保留当前详情', await details() === initial);
        await p.locator('[data-skill=sk_whirlwind]').focus();
        add('仅聚焦不切换选择', await details() === initial);
        add('不再出现另一技能的原生悬停介绍', await p.locator('.node[title]').count() === 0);
        await p.getByRole('button', { name: '学习 2 技能点', exact: true }).click();
        add('经过其他节点后学习的仍是所选技能', await p.evaluate(() => window.skills.getLoadout()[0] === 'sk_dash'));
        await p.locator('.slot').nth(3).click();
        await p.locator('[data-skill=sk_blade_focus]').hover();
        await p.getByRole('button', { name: '绑定到 4 键', exact: true }).click({ timeout: 3000 });
        add('鼠标经过节点后仍能正确绑定热键', await p.evaluate(() => window.skills.getLoadout()[3] === 'sk_dash' && window.skills.getLoadout()[0] === null));
        await p.locator('[data-skill=sk_heal]').click();
        add('点击新技能后详情切换', (await details()).includes('治疗祷言'));
        add('无浏览器脚本异常', errors.length === 0);
        return { passed: cases.filter(c => c.passed).length, total: cases.length, cases, errors };
    } catch (e) {
        return { cases, errors, error: String(e), body: await browser.contexts()[0]?.pages()[0]?.locator('body').innerText() };
    } finally { await browser.close(); }
}
