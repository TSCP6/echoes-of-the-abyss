import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AUDIO_FILES, BGM, SFX, SKILL_SFX, WEAPON_SFX, regionBgm } from '../../../src/game/data/audioCatalog';
import { WEAPONS } from '../../../src/game/data/weapons';
import { SKILLS } from '../../../src/game/data/skills';
import { LEVELS } from '../../../src/game/data/levels';

describe('发布音频完整性', () => {
    it('所有武器和主动技能有对应音色，被动不会误播施放音效', () => {
        expect(Object.keys(WEAPON_SFX).sort()).toEqual(WEAPONS.map(w => w.id).sort());
        expect(Object.keys(SKILL_SFX).sort()).toEqual(SKILLS.filter(s => s.kind === 'active').map(s => s.id).sort());
        for (const key of [...Object.values(WEAPON_SFX), ...Object.values(SKILL_SFX)]) { expect(SFX[key]).toBeDefined(); }
    });
    it('发布清单与加载清单一致，两种格式均存在且校验值匹配', () => {
        const manifest = JSON.parse(readFileSync('public/assets/audio/audio-manifest.json', 'utf8'));
        expect(Object.keys(manifest).sort()).toEqual([...AUDIO_FILES].sort());
        for (const key of AUDIO_FILES) {
            for (const ext of ['ogg', 'm4a']) {
                const data = readFileSync(`public/assets/audio/${key}.${ext}`);
                expect(createHash('sha256').update(data).digest('hex')).toBe(manifest[key][`${ext}_sha256`]);
                expect(ext === 'ogg' ? data.subarray(0, 4).toString() : data.subarray(4, 8).toString()).toBe(ext === 'ogg' ? 'OggS' : 'ftyp');
            }
            expect(manifest[key].peak_dbfs).toBeLessThan(-0.1);
            expect(manifest[key].rms_dbfs).toBeGreaterThan(-65);
        }
    });
    it('配乐使用完整长曲，十二关配置引用实际发布资源', () => {
        const manifest = JSON.parse(readFileSync('public/assets/audio/audio-manifest.json', 'utf8'));
        for (const key of Object.values(BGM)) { expect(manifest[key].duration).toBeGreaterThan(60); }
        for (const level of LEVELS) {
            expect(level.bgmId).toBe(level.isBossLevel ? BGM.boss : BGM[regionBgm(level.sceneId)]);
        }
    });
});
