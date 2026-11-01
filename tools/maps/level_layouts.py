"""关卡布局权威数据；1-1 保留用户手工地图作为基线。坐标单位为 32px 格。"""
import json
from pathlib import Path
if __package__:
    from .level_model import Level
else:
    from level_model import Level

ROOT = Path(__file__).resolve().parents[2]


def platforms(lv, rows, solid=False, filled=False):
    for x0, y, x1 in rows:
        if solid: lv.solid_rect(x0, y, x1, lv.h-1 if filled else min(y+1, lv.h-1))
        else: lv.oneway_rect(x0, y, x1)


def device(lv, kind, name, x, y, w=1, h=1, group='', order=0, label=''):
    lv.obj('mechanisms', name, x, y, w, h,
           props={'group':group, 'order':str(order), 'label':label}, obj_type=kind)


def sign(lv, name, x, y, label): device(lv,'sign',name,x,y,label=label)


def finish(lv, title, subtitle, spawn, cps, shards, coins, enemies, goal, chests=()):
    lv.title, lv.subtitle = title, subtitle
    lv.spawn(*spawn)
    for n,(x,y) in enumerate(cps,1): lv.checkpoint(n,x,y)
    for k,(x,y) in zip('abc',shards): lv.shard(k,x,y)
    for n,(x,y) in enumerate(coins,1): lv.coin_cluster(n,x,y,5)
    for kind,x,y in enemies: lv.enemy(kind,x,y)
    for n,(x,y) in enumerate(chests,1): lv.chest(n,x,y)
    lv.goal(*goal)
    lv.death_plane(0,lv.h-1,lv.w,1)
    return lv


def build_1_1():
    data=json.loads((ROOT/'tools/maps/1-1-authored.json').read_text(encoding='utf-8'))
    lv=Level('1-1',data['width'],data['height'])
    for layer in data['layers']:
        if layer['type']=='tilelayer': setattr(lv,layer['name'],layer['data'][:])
        else: lv.objects.extend((layer['name'],o) for o in layer['objects'])
    lv._oid=max(o['id'] for _,o in lv.objects)+1
    # 手工基线布局保留；第二枚晶体由贴墙侧边移到双格石墙顶面中央。
    for group, obj in lv.objects:
        if group == 'shards' and obj['name'] == 'shard_b': obj.update(x=64*32, y=20*32)
    platforms(lv,[(19,22,21),(26,19,28),(48,24,51),(55,21,58),(92,22,94),(98,19,100)])
    sign(lv,'intro',5,24,'觉醒回廊  →  金币指引主路，晶体藏在高处')
    sign(lv,'canopy',17,22,'↑ 树冠支路 · 回响碎片')
    sign(lv,'pillar',55,24,'↑ 沿木台越过遗迹石墙')
    lv.title,lv.subtitle='觉醒回廊','熟悉遗迹，寻找树冠中的回响'
    return lv


def build_1_2():
    lv=Level('1-2',144,38)
    platforms(lv,[(0,28,12),(15,25,26),(29,22,42),(45,19,57),(60,22,74),(77,25,90),(93,22,106),(109,19,122),(125,16,143)],True)
    platforms(lv,[(20,22,24),(33,19,38),(49,16,54),(81,22,86),(114,16,119)])
    sign(lv,'route',7,26,'藤蔓断崖  →  沿树冠向上，宽台上再迎战')
    sign(lv,'rest',79,23,'高低路线在此交汇  →')
    return finish(lv,'藤蔓断崖','穿过起伏树冠与断桥，登上古树之巅',(3,26),
        [(35,21),(83,24),(116,18)],[(22,21),(51,15),(117,15)],
        [(11,27),(25,24),(41,21),(66,21),(89,24),(105,21),(132,15)],
        [('enm_patrol',35,21),('enm_chaser',66,21),('enm_patrol',99,21),('enm_flyer',115,14)],(138,13),[(86,21)])


def build_1_3():
    lv=Level('1-3',180,44)
    platforms(lv,[(0,34,20),(23,31,45),(48,34,76),(79,31,100),(103,28,126),(129,31,153),(156,34,179)],True,True)
    platforms(lv,[(27,28,32),(33,25,40),(60,31,65),(66,28,72),(104,25,109),(110,22,115),(116,19,124)])
    device(lv,'switch','ruin_rune',120,18,group='ruin',label='点亮树冠符文')
    device(lv,'gate','ruin_seal',149,21,1,10,group='ruin',label='树冠符文封印')
    sign(lv,'intro',6,32,'遗迹守卫  →  上层找符文，下层穿庭院')
    sign(lv,'rune_route',105,26,'↑ 符文位于三层木台尽头')
    return finish(lv,'遗迹守卫','探索双层庭院，点亮符文打开遗迹封印',(3,32),
        [(38,30),(88,30),(137,30)],[(36,24),(120,18),(166,33)],
        [(14,33),(39,24),(57,33),(70,27),(95,30),(120,18),(141,30),(169,33)],
        [('enm_patrol',30,30),('enm_chaser',60,33),('enm_elite',90,30),('enm_patrol',116,27),('enm_chaser',165,33)],(174,31),[(70,27),(144,30)])


def boss_level(key,title,boss_id,fy,height,note):
    lv=Level(key,110,height)
    platforms(lv,[(0,fy,109)],True,True)
    platforms(lv,[(13,fy-3,20),(23,fy-6,31),(39,fy-3,47),(50,fy-6,58)])
    sign(lv,'intro',6,fy-2,note)
    sign(lv,'arena',63,fy-2,'前方为首领战场 · 先激活旗帜')
    lv.boss_arena(70,fy-17,40,17)
    return finish(lv,title,'收集战前补给，穿过封锁战场',(3,fy-2),[(62,fy-1)],
        [(17,fy-4),(28,fy-7),(54,fy-7)],[(9,fy-1),(43,fy-4)],[(boss_id,92,fy-1)],(105,fy-3),[(59,fy-1)])


def build_1_4():
    lv=boss_level('1-4','古树守卫庭院','enm_boss_guardian',30,38,'古树守卫庭院  →  木台上有战前碎片')
    platforms(lv,[(74,27,79),(100,27,105)])
    return lv


def build_2_1():
    lv=Level('2-1',124,64)
    platforms(lv,[(0,18,24),(43,30,64),(20,42,41),(58,54,86),(89,51,101),(104,48,123)],True)
    platforms(lv,[(26,21,31),(32,24,37),(38,27,43),(35,33,41),(41,36,47),(42,39,48),(42,45,47),(46,48,51),(52,51,57)])
    device(lv,'switch','mine_rune',79,53,group='mine',label='启动矿道封印')
    device(lv,'gate','mine_gate',115,39,1,9,group='mine',label='矿道封印')
    sign(lv,'down',9,16,'幽暗矿道  →  跟随矿灯逐层下潜')
    sign(lv,'left',54,28,'下层矿道在左下方  ↙')
    sign(lv,'right',26,40,'沿木台向右下方  ↘')
    lv=finish(lv,'幽暗矿道','折返下潜至矿井深处，再打开离矿通道',(3,16),
        [(52,29),(29,41),(70,53)],[(18,17),(27,41),(79,53)],
        [(23,17),(34,23),(52,29),(45,35),(35,41),(49,47),(75,53),(96,50)],
        [('enm_patrol',53,29),('enm_flyer',50,34),('enm_chaser',30,41),('enm_patrol',76,53)],(119,45),[(22,41)])
    # 增员放在宽阔实体地面；末尾追加保留既有地图对象 ID。
    lv.enemy('enm_patrol',110,47)
    return lv


def build_2_2():
    lv=Level('2-2',176,42)
    platforms(lv,[(0,30,18),(35,30,54),(73,30,92),(113,30,134),(153,27,175)],True,True)
    for n,x,y,w in [(1,22,28,5),(2,29,28,4),(3,58,27,5),(4,66,28,4),(5,96,27,5),(6,104,28,6),(7,138,27,5),(8,146,27,4)]:
        device(lv,'crumble',f'crumble_{n}',x,y,w,0.5)
    platforms(lv,[(8,27,12),(13,24,17),(119,27,123),(125,24,129)])
    for x,w in [(19,16),(55,18),(93,20),(135,18)]: lv.death_plane(x,34,w,7)
    sign(lv,'intro',5,28,'熔岩裂隙  →  脆石踩踏 1 秒后崩塌，3 秒后复原')
    sign(lv,'wait',40,28,'宽台可休息，等石桥复原再出发')
    lv=finish(lv,'熔岩裂隙','把握脆石桥节奏，在熔岩孤岛之间前进',(3,28),
        [(42,29),(82,29),(123,29)],[(15,23),(84,29),(127,23)],
        [(17,29),(38,29),(60,26),(78,29),(99,26),(119,29),(149,26),(165,26)],
        [('enm_patrol',45,29),('enm_flyer',80,25),('enm_chaser',124,29),('enm_patrol',165,26)],(170,24),[(130,23)])
    # 增员放在宽阔实体地面；末尾追加保留既有地图对象 ID。
    lv.enemy('enm_patrol',86,29)
    lv.enemy('enm_chaser',159,26)
    return lv


def build_2_3():
    lv=Level('2-3',68,82)
    platforms(lv,[(0,74,13),(49,56,65),(0,38,13),(49,23,65),(0,8,14)],True)
    platforms(lv,[(15,71,22),(23,68,30),(31,65,38),(39,62,46),(45,59,48),
        (41,53,49),(33,50,41),(25,47,33),(17,44,25),(14,41,19),
        (15,35,23),(23,32,31),(31,29,39),(39,26,47),
        (41,20,49),(33,17,41),(25,14,33),(17,11,25)])
    for name,x,y,text in [('up',5,72,'蛛巢深处  ↗  沿矿灯折返攀升'),('turn1',56,54,'↖ 上层在左侧'),
                           ('turn2',6,36,'↗ 继续向右上方'),('turn3',55,21,'↖ 顶层出口在左侧')]: sign(lv,name,x,y,text)
    lv=finish(lv,'蛛巢深处','穿过四层回折竖井，抵达蛛巢顶端',(3,72),
        [(56,55),(6,37),(57,22)],[(59,55),(5,37),(58,22)],
        [(19,70),(35,64),(53,55),(37,49),(21,43),(19,34),(35,28),(45,19),(29,13)],
        [('enm_flyer',40,62),('enm_patrol',57,55),('enm_flyer',30,45),('enm_flyer',38,29),('enm_patrol',57,22)],(7,5),[(61,55),(8,37)])
    # 增员放在宽阔实体地面；末尾追加保留既有地图对象 ID。
    lv.enemy('enm_patrol',4,37)
    return lv


def build_2_4():
    lv=boss_level('2-4','深渊蛛巢','enm_boss_spider',38,48,'深渊蛛巢  →  水晶矿台通往蛛后巢室')
    platforms(lv,[(74,34,79),(101,34,106)])
    return lv


def build_3_1():
    lv=Level('3-1',178,64)
    platforms(lv,[(0,54,16),(19,51,32),(35,48,47),(50,45,64),(67,42,81),(84,39,96),
                   (99,36,112),(115,33,126),(129,30,142),(145,27,157),(160,24,177)],True)
    platforms(lv,[(23,48,29),(56,42,62),(104,33,110),(151,24,156)])
    sign(lv,'intro',6,52,'浮空阶梯  ↗  每座浮岛都是一次安全落脚')
    sign(lv,'rest',101,34,'云海驿台 · 先收集再继续攀登')
    lv=finish(lv,'浮空阶梯','从云海低处逐岛攀升，登上天际神殿',(3,52),
        [(56,44),(105,35),(151,26)],[(26,47),(108,32),(154,23)],
        [(13,53),(42,47),(61,44),(77,41),(92,38),(121,32),(137,29),(170,23)],
        [('enm_patrol',58,44),('enm_flyer',77,37),('enm_patrol',106,35),('enm_flyer',141,25),('enm_chaser',169,23)],(172,21),[(61,41)])
    # 增员放在宽阔实体地面；末尾追加保留既有地图对象 ID。
    lv.enemy('enm_patrol',41,47)
    return lv


def build_3_2():
    lv=Level('3-2',170,54)
    platforms(lv,[(0,44,105),(108,41,117),(120,38,129),(132,35,169)],True,True)
    platforms(lv,[(19,41,24),(25,38,30),(31,35,36),(37,32,52),(55,29,61),(64,26,70),(73,23,88),
                   (111,38,116),(122,35,128),(139,32,145),(148,29,156)])
    for x in (45,63,81): lv.solid_rect(x,41,x+2,43)
    device(lv,'switch','temple_rune',80,22,group='hall',label='唤醒回廊符文')
    device(lv,'gate','hall_gate',103,30,1,14,group='hall',label='上层符文封印')
    sign(lv,'intro',7,42,'神殿回廊  →  下层迎敌，上层寻找封印符文')
    sign(lv,'stairs',20,42,'↗ 沿金色踏台进入上层回廊')
    lv=finish(lv,'神殿回廊','穿梭上下回廊，解除金色神殿的封印',(3,42),
        [(40,43),(97,43),(143,34)],[(47,31),(79,22),(152,28)],
        [(15,43),(29,37),(47,31),(66,25),(81,22),(102,43),(125,34),(154,28)],
        [('enm_chaser',34,43),('enm_flyer',60,29),('enm_patrol',78,22),('enm_elite',96,43),('enm_flyer',144,29)],(164,32),[(86,22),(156,28)])
    # 增员放在宽阔实体地面；末尾追加保留既有地图对象 ID。
    lv.enemy('enm_patrol',55,43)
    lv.enemy('enm_patrol',153,34)
    return lv


def build_3_3():
    lv=Level('3-3',172,48)
    platforms(lv,[(0,38,171)],True,True)
    platforms(lv,[(31,35,38),(40,32,46),(54,35,59),(60,32,65),(66,29,71),(72,26,77),(78,23,87),
                   (107,35,113),(114,32,119),(120,29,130),(157,35,164)])
    for name,x,y,order in [('star_1',23,37,1),('star_2',83,22,2),('star_3',125,28,3)]:
        device(lv,'switch',name,x,y,group='stars',order=order,label=['','Ⅰ · 晨星','Ⅱ · 月辉','Ⅲ · 日冕'][order])
    device(lv,'gate','star_seal',151,24,1,14,group='stars',label='依次点亮 Ⅰ → Ⅱ → Ⅲ')
    sign(lv,'intro',6,36,'星辉祭坛  →  依次激活 Ⅰ 晨星 → Ⅱ 月辉 → Ⅲ 日冕')
    sign(lv,'up',55,36,'Ⅱ 在高塔上方  ↗')
    lv=finish(lv,'星辉祭坛','探索三处星盘，按序点亮通往祭坛的道路',(3,36),
        [(45,37),(100,37),(142,37)],[(43,31),(82,22),(125,28)],
        [(20,37),(35,34),(58,34),(69,28),(84,22),(101,37),(116,31),(127,28),(163,34)],
        [('enm_elite',35,37),('enm_flyer',66,27),('enm_chaser',98,37),('enm_elite',136,37)],(166,35),[(87,22),(144,37)])
    # 增员放在宽阔实体地面；末尾追加保留既有地图对象 ID。
    lv.enemy('enm_patrol',50,37)
    lv.enemy('enm_chaser',75,37)
    lv.enemy('enm_patrol',111,37)
    lv.enemy('enm_patrol',159,37)
    return lv


def build_3_4():
    lv=boss_level('3-4','回响终庭','enm_boss_echo',26,36,'回响终庭  →  星阶尽头迎战回响之影')
    platforms(lv,[(75,23,81),(99,23,105)])
    return lv


LEVEL_BUILDERS={f'{r}-{n}':globals()[f'build_{r}_{n}'] for r in range(1,4) for n in range(1,5)}


def main():
    import sys
    ids=sys.argv[1:]
    if not ids: raise SystemExit('请明确指定目标关卡，避免覆盖 Tiled 手改：python tools/maps/gen_levels.py 2-1')
    for key in ids:
        if key not in LEVEL_BUILDERS: raise SystemExit(f'未知关卡：{key}')
        lv=LEVEL_BUILDERS[key]()
        data=lv.to_json()
        data['properties']=[{'name':'title','type':'string','value':lv.title},{'name':'subtitle','type':'string','value':lv.subtitle}]
        data['tilesets'][0]['image']=f"../art/regions/{['forest','cavern','temple'][int(key[0])-1]}_tiles.png"
        if key=='1-1':
            existing={t['id'] for t in data['tilesets'][0]['tiles']}
            data['tilesets'][0]['tiles'].extend({'id':g-1,'properties':[{'name':'solid','type':'bool','value':True}]}
                                              for g in (29,30,31) if g-1 not in existing)
        (ROOT/'public/assets/levels'/f'{key}.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
        print(f'{key}: {lv.title} {lv.w}x{lv.h}, {len(lv.objects)} 个对象')
