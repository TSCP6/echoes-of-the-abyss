/** 单点奖励集成验证：隔离页面、真实E；瞬移仅用于交互夹具，路线由rewards.check.mjs另测。 */
export async function checkRewardInteractions(browser, {url='http://127.0.0.1:8100'}={}) {
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
await page.goto(url);await page.waitForFunction(()=>window.__SEAPP_UI__?.booted&&window.__SEAPP_DOMAIN__);
await page.evaluate(()=>document.querySelector('.ui-layer').__vueParentComponent.exposed.enterLevel('2-3'));
await page.waitForFunction(()=>window.__SEAPP__.game.scene.getScene('Level').ready&&window.__SEAPP_UI__.state==='none'&&!window.__SEAPP_DIRECTOR__.director.isTransitioning);
const result=await page.evaluate(()=>{
const dev=window.__SEAPP__.game,g=dev.__v_raw??dev,s=g.scene.getScene('Level'),d=window.__SEAPP_DOMAIN__,p=s.player,ch=s.ctx.chests[0];g.loop.stop();let clock=g.loop.lastTime;
const tick=(n=2)=>{for(let i=0;i<n;i++){clock+=1000/60;g.step(clock,1000/60)}};
p.teleportTo(ch.x,ch.y);p.iFrameUntil=Number.MAX_SAFE_INTEGER;tick();
const key=down=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:'e',code:'KeyE',keyCode:69,which:69,bubbles:true}));
const interact=()=>{key(true);tick();key(false);tick()};
const before=d.economy.toSnapshot();interact();const first=d.economy.toSnapshot();interact();const repeat=d.economy.toSnapshot();
const upgraded=d.weapons.levelUp('wpn_shortsword','main');const upgrade=d.economy.toSnapshot();
const random=Math.random;Math.random=()=>0;d.emit('enemy:killed',{enemyId:'enm_elite',coins:0,position:{x:p.sprite.x,y:p.sprite.y}});Math.random=random;tick(3);const loot=d.economy.toSnapshot();
d.inventory.fromSnapshot({capacity:20,slots:Array.from({length:20},(_,slot)=>({slot,itemId:'wpn_daggers',count:1})),equipped:{main:null,sub:null}});
s.pickups.spawnItemDrop({x:p.sprite.x,y:p.sprite.y},'itm_potion_hp_s',2);tick(3);const pending=s.pickups.itemDrops.map(v=>({itemId:v.itemId,count:v.count}));
d.inventory.fromSnapshot({capacity:20,slots:[],equipped:{main:null,sub:null}});tick(65);
const retained=d.inventory.countItem('itm_potion_hp_s'), empty=s.pickups.itemDrops.length===0;
const cases=[['E gives chapter2 materials',first.materials.itm_relic_shard===2],['E gives 60 coins once',first.coins-before.coins===60],['repeat E is idempotent',JSON.stringify(first)===JSON.stringify(repeat)],['real upgrade consumes 60 coins and 1 material',upgraded.ok&&upgrade.coins===first.coins-60&&upgrade.materials.itm_relic_shard===1],['elite fixed+configured material loot reaches balance',loot.materials.itm_relic_shard===4],['full inventory preserves drop',pending.length===1&&pending[0].count===2],['free space collects preserved drop',retained===2&&empty]];
return{passed:cases.every(c=>c[1]),cases,before,first,repeat,upgrade,loot,pending,retained};
});return {...result, passed:result.passed && errors.length===0, errors};
}finally{await page.close()}

}
