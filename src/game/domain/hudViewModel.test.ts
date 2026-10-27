import { beforeEach, describe, expect, it } from 'vitest';
import { HudViewModel } from './hudViewModel';
import { validateAll, markValidated } from './configRegistry';
import { inventoryStore } from './inventoryStore';
import { weaponService } from './weaponService';
import { skillService } from './skillService';
import { economyService } from './economyService';

beforeEach(() => {
    expect(validateAll().ok).toBe(true);
    markValidated();
    inventoryStore.initNewGame();
    weaponService.initNewGame();
    skillService.fromSnapshot({ unlocked: [], loadout: [null, null, null, null] });
    skillService.syncEarned(0);
    economyService.fromSnapshot({ coins: 0, materials: {} });
});

describe('HUD 资源区分与弹药余量', () => {
    it('主手显示武器名且无弹药，副手显示箭矢真实库存，射击和耗尽立即反映', () => {
        const hud = new HudViewModel();
        expect(hud.getPerFrame().weaponIcons).toMatchObject({
            mainName: '遗迹短剑', mainAmmo: null, subName: '轻弩', subAmmo: { itemId: 'itm_arrow', name: '箭矢', count: 20 }
        });
        expect(weaponService.consumeAmmo('wpn_crossbow').ok).toBe(true);
        expect(hud.getPerFrame().weaponIcons.subAmmo?.count).toBe(19);
        inventoryStore.consumeItem('itm_arrow', 19);
        expect(hud.getPerFrame().weaponIcons.subAmmo?.count).toBe(0);
    });

    it('金币和强化材料不增加技能点；学习后显示可用余额', () => {
        const hud = new HudViewModel();
        economyService.addCoins(100);
        economyService.addMaterial('itm_relic_shard', 3);
        expect(hud.getPerFrame().skillPoints).toBe(0);
        skillService.grantShardSkp();
        skillService.grantShardSkp();
        expect(hud.getPerFrame().skillPoints).toBe(2);
        expect(skillService.unlock('sk_blade_focus').ok).toBe(true);
        expect(hud.getPerFrame().skillPoints).toBe(0);
        expect(economyService.getMaterials()['itm_relic_shard']).toBe(3);
    });

    it('换装后依配置区分两手弹药，卸下武器不残留旧提示', () => {
        const snapshot = inventoryStore.toSnapshot();
        inventoryStore.addItem('itm_dart', 7);
        inventoryStore.fromSnapshot({ ...inventoryStore.toSnapshot(), equipped: { main: 'wpn_crossbow', sub: 'wpn_dartgun' } });
        const hud = new HudViewModel();
        expect(hud.getPerFrame().weaponIcons.mainAmmo?.count).toBe(20);
        expect(hud.getPerFrame().weaponIcons.subAmmo).toMatchObject({ itemId: 'itm_dart', count: 7 });
        inventoryStore.fromSnapshot({ ...snapshot, equipped: { main: null, sub: null } });
        expect(hud.getPerFrame().weaponIcons).toMatchObject({ mainAmmo: null, subAmmo: null });
    });
});
