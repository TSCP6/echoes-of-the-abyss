import { beforeEach, describe, expect, it } from 'vitest';
import { ShopService } from './shopService';
import { economyService } from './economyService';
import { inventoryStore } from './inventoryStore';
import { validateAll, markValidated } from './configRegistry';
beforeEach(()=>{ expect(validateAll().ok).toBe(true); markValidated(); economyService.fromSnapshot({coins:100,materials:{}}); inventoryStore.fromSnapshot({capacity:20,slots:[],equipped:{main:null,sub:null}}); });
describe('购买完成后的保存通知',()=>{
    it('只有完整扣款入包后通知，失败不发通知',()=>{
        const shop=new ShopService(); const states:Array<{coins:number;arrows:number}>=[];
        shop.onDirty(()=>states.push({coins:economyService.getCoins(),arrows:inventoryStore.countItem('itm_arrow')}));
        expect(shop.buy('gds_arrow').ok).toBe(true);
        expect(states).toEqual([{coins:82,arrows:10}]);
        economyService.fromSnapshot({coins:0,materials:{}});
        expect(shop.buy('gds_arrow').ok).toBe(false);
        expect(states).toHaveLength(1);
    });
});
