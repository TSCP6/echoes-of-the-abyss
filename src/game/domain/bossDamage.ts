/** Boss 抗性规则，保持领域层可在 Node 环境运行。 */
import { getBossCombatProfile } from '../data/bossCombatProfiles';

export function bossWeaponFactor(bossId: string, weaponId: string, armorBroken = false): number {
    const profile = getBossCombatProfile(bossId);
    const factor = profile && Object.prototype.hasOwnProperty.call(profile.weaponFactors, weaponId)
        ? profile.weaponFactors[weaponId] ?? 1
        : 1;
    return bossId === 'enm_boss_guardian' && armorBroken && factor < 1 ? 1 : factor;
}
