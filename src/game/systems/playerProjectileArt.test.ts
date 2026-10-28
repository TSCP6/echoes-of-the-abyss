import { expect, it } from 'vitest';
import { playerProjectileTexture, playerProjectileTint } from './playerProjectileArt';

it('三把远程武器使用独立弹体，技能保留武器弹体并区分色彩', () => {
    expect(new Set(['wpn_crossbow', 'wpn_dartgun', 'wpn_firestaff'].map(playerProjectileTexture)).size).toBe(3);
    expect(playerProjectileTexture('unknown')).toBe('projectile_player');
    expect(new Set(['sk_multishot', 'sk_bolt_volley', 'sk_bolt_rain'].map(playerProjectileTint)).size).toBe(3);
});
