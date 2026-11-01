import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../../src/game/data/weapons';
import { SKILLS } from '../../../src/game/data/skills';
import { combatIconUrl, COMBAT_ICON_IDS } from '../../../src/ui/presentation/combatIcons';

describe('战斗图标资源契约', () => {
    it('覆盖当前全部武器与技能，各自使用独立的本地 SVG', () => {
        const configured = [...WEAPONS, ...SKILLS].map(def => def.id);
        expect([...COMBAT_ICON_IDS].sort()).toEqual(configured.sort());
        const artwork = configured.map(id => {
            expect(combatIconUrl(id)).toBe(`${import.meta.env.BASE_URL}assets/art/combat-icons/${id}.svg`);
            const svg = readFileSync(`public/assets/art/combat-icons/${id}.svg`, 'utf8');
            expect(svg).toContain('viewBox="0 0 64 64"');
            expect(svg).toMatch(/<title id="title">[^<]+<\/title>/);
            expect(svg).not.toMatch(/<script|<foreignObject|href=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
            return svg.slice(svg.indexOf('<g '));
        });
        expect(new Set(artwork).size).toBe(27);
    });

    it('空槽和未知 ID 不请求不存在的图标', () => {
        for (const id of [null, undefined, '', 'itm_arrow', 'sk_unknown']) {
            expect(combatIconUrl(id)).toBeNull();
        }
    });
});
