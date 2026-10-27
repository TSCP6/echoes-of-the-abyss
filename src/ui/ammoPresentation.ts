import { ConfigRegistry } from '../game/domain/configRegistry';
import { settingsStore } from '../game/domain/settingsStore';
import { effectiveKeys } from '../game/domain/keymap';

export function ammoWeaponNames(itemId: string): string {
    return Object.values(ConfigRegistry.weapons()).filter(w => w.ammoItemId === itemId)
        .map(w => ConfigRegistry.items()[w.id]?.name ?? w.id).join('、');
}

export function ammoGuide(itemId: string, equipped: { main: string | null; sub: string | null }): string {
    const weapons = Object.values(ConfigRegistry.weapons()).filter(w => w.ammoItemId === itemId);
    if (weapons.length === 0) { return ''; }
    const used = weapons.find(w => w.id === equipped.main || w.id === equipped.sub);
    const prefix = `${ConfigRegistry.items()[itemId]?.name}用于${ammoWeaponNames(itemId)}，不同弹药不会自动互换。`;
    if (used) {
        const main = used.id === equipped.main;
        const keys = effectiveKeys(main ? 'attackMain' : 'attackSub', settingsStore.getSnapshot().keymap).join('/');
        return `${prefix}已装在${main ? '主手' : '副手'}，${keys} / 鼠标${main ? '左键' : '右键'}发射，每次普通射击消耗 1。`;
    }
    const routes = weapons.map(w => {
        const goods = ConfigRegistry.goods().find(g => g.refId === w.id);
        return goods ? `${ConfigRegistry.items()[w.id]?.name}：第 ${goods.unlockScene} 区域营地商店，${goods.price} 金币` : ConfigRegistry.items()[w.id]?.name;
    }).join('；');
    return `${prefix}当前未装备对应武器。${routes}。购买后在背包选中武器，点击装主手或装副手。`;
}
