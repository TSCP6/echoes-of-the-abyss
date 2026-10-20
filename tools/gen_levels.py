"""关卡地图生成器（选项 B：代码生成 Tiled 兼容 CSV JSON，DR-03 / DEC-7）。

产出 public/assets/levels/<id>.json，格式与 Tiled 导出一致：
- orientation=orthogonal、tilewidth/tileheight=32、encoding=csv 明文
- 瓦片层：collision（solid 属性）/ oneway / decor_back / decor_front
- 对象层：spawn / enemies / checkpoints / shards / pickups / hazards / goal / hints（DD-05）

瓦片 GID（terrain32.png，22 列）：草顶 7/8/9（左/中/右），泥土 51/52/53，木板(oneway) 41/42/43。
12 关布局为参数化手工设计（附录 B 机制表）：每关给出长度/深渊/平台/敌人/碎片/检查点/金币堆。
用户后期可用 Tiled 打开微调（DEC-7 管线：Tiled 编辑 → CSV 导出 → 本目录）。

用法：python tools/gen_levels.py [level_id ...]（缺省生成全部 12 关）
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "assets", "levels")

TILE = 32
GRASS_L, GRASS_M, GRASS_R = 7, 8, 9
DIRT_L, DIRT_M, DIRT_R = 51, 52, 53
WOOD_L, WOOD_M, WOOD_R = 41, 42, 43
SOLID_GIDS = {GRASS_L, GRASS_M, GRASS_R, DIRT_L, DIRT_M, DIRT_R}


class Level:
    def __init__(self, level_id: str, w: int, h: int = 30):
        self.id = level_id
        self.w, self.h = w, h
        self.collision = [0] * (w * h)
        self.oneway = [0] * (w * h)
        self.decor_back = [0] * (w * h)
        self.decor_front = [0] * (w * h)
        self.objects = []
        self._oid = 1

    def _put(self, layer, x, y, gid):
        if 0 <= x < self.w and 0 <= y < self.h:
            layer[y * self.w + x] = gid

    def solid_rect(self, x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if y == y0:
                    gid = GRASS_M
                    if x == x0:
                        gid = GRASS_L
                    elif x == x1:
                        gid = GRASS_R
                else:
                    gid = DIRT_M
                    if x == x0:
                        gid = DIRT_L
                    elif x == x1:
                        gid = DIRT_R
                self._put(self.collision, x, y, gid)

    def oneway_rect(self, x0, y, x1):
        for x in range(x0, x1 + 1):
            gid = WOOD_M
            if x == x0:
                gid = WOOD_L
            elif x == x1:
                gid = WOOD_R
            self._put(self.oneway, x, y, gid)

    def obj(self, layer, name, tx, ty, w_tiles=0, h_tiles=0, props=None, obj_type=""):
        o = {
            "id": self._oid, "name": name,
            "x": tx * TILE, "y": ty * TILE,
            "width": w_tiles * TILE, "height": h_tiles * TILE,
            "rotation": 0, "type": obj_type, "visible": True,
            "properties": [{"name": k, "type": "string", "value": v} for k, v in (props or {}).items()],
        }
        self._oid += 1
        self.objects.append((layer, o))
        return o

    def spawn(self, tx, ty): self.obj("spawn", "player_spawn", tx, ty)
    def checkpoint(self, n, tx, ty): self.obj("checkpoints", f"cp_{n}", tx, ty)
    def shard(self, key, tx, ty): self.obj("shards", f"shard_{key}", tx, ty)
    def coin_cluster(self, n, tx, ty, count): self.obj("pickups", f"coin_cluster_{n}", tx, ty, props={"count": str(count)})
    def chest(self, n, tx, ty): self.obj("pickups", f"chest_{n}", tx, ty)
    def death_plane(self, tx0, ty0, tw, th): self.obj("hazards", f"death_{tx0}_{ty0}", tx0, ty0, tw, th, obj_type="death_plane")
    def goal(self, tx, ty): self.obj("goal", "goal", tx, ty, 2, 3)
    def hint(self, n, action, tx, ty, tw, th): self.obj("hints", f"hint_{n}", tx, ty, tw, th, props={"action": action})
    def enemy(self, def_id, tx, ty): self.obj("enemies", def_id, tx, ty)

    def to_json(self):
        def tile_layer(name, data, lid):
            return {
                "data": data, "encoding": "csv", "height": self.h, "width": self.w,
                "id": lid, "name": name, "opacity": 1, "type": "tilelayer",
                "visible": True, "x": 0, "y": 0,
            }
        layers = [
            tile_layer("decor_back", self.decor_back, 1),
            tile_layer("collision", self.collision, 2),
            tile_layer("oneway", self.oneway, 3),
            tile_layer("decor_front", self.decor_front, 4),
        ]
        order = ["spawn", "enemies", "checkpoints", "shards", "pickups", "hazards", "goal", "hints"]
        lid = 5
        for name in order:
            objs = [o for (ln, o) in self.objects if ln == name]
            layers.append({
                "draworder": "topdown", "id": lid, "name": name, "objects": objs,
                "opacity": 1, "type": "objectgroup", "visible": True, "x": 0, "y": 0,
            })
            lid += 1
        tiles_props = [
            {"id": g - 1, "properties": [{"name": "solid", "type": "bool", "value": True}]}
            for g in sorted(SOLID_GIDS)
        ]
        return {
            "compressionlevel": -1,
            "height": self.h, "width": self.w, "infinite": False,
            "layers": layers,
            "nextlayerid": lid, "nextobjectid": self._oid,
            "orientation": "orthogonal", "renderorder": "right-down",
            "tiledversion": "1.11.2", "tileheight": TILE, "tilewidth": TILE,
            "tilesets": [{
                "columns": 22, "firstgid": 1,
                "image": "../gen/terrain32.png", "imagewidth": 704, "imageheight": 352,
                "margin": 0, "name": "terrain", "spacing": 0,
                "tilecount": 242, "tileheight": TILE, "tilewidth": TILE,
                "tiles": tiles_props,
            }],
            "type": "map", "version": "1.10",
        }


def build_1_1() -> Level:
    lv = Level("1-1", 120)
    lv.solid_rect(0, 26, 44, 29)
    lv.solid_rect(49, 26, 69, 29)
    lv.solid_rect(74, 26, 119, 29)
    lv.death_plane(45, 27, 4, 3)
    lv.death_plane(70, 27, 4, 3)
    lv.oneway_rect(14, 23, 17)
    lv.oneway_rect(20, 20, 23)
    lv.oneway_rect(28, 17, 31)
    lv.shard("a", 29, 16)
    lv.solid_rect(36, 24, 39, 25)
    lv.checkpoint(1, 42, 25)
    lv.oneway_rect(52, 22, 55)
    lv.oneway_rect(58, 19, 61)
    lv.solid_rect(63, 22, 63, 25)
    lv.shard("b", 65, 24)
    lv.checkpoint(2, 80, 25)
    lv.oneway_rect(95, 20, 98)
    lv.oneway_rect(100, 17, 103)
    lv.shard("c", 101, 16)
    lv.coin_cluster(1, 10, 25, 5)
    lv.coin_cluster(2, 30, 16, 3)
    lv.coin_cluster(3, 55, 18, 4)
    lv.coin_cluster(4, 85, 25, 6)
    lv.coin_cluster(5, 101, 16, 3)
    lv.chest(1, 88, 25)
    lv.goal(115, 23)
    lv.hint(1, "move", 4, 24, 4, 2)
    lv.hint(2, "jump", 12, 21, 4, 5)
    lv.hint(3, "attack", 24, 24, 4, 2)
    lv.hint(4, "pickup", 50, 24, 4, 2)
    lv.hint(5, "interact", 86, 23, 4, 3)
    lv.enemy("enm_patrol", 33, 25)
    lv.enemy("enm_patrol", 60, 25)
    lv.spawn(3, 24)
    return lv


def build_1_2() -> Level:
    """藤蔓断崖：移动平台（以 oneway 序列近似）+ 单向平台密集"""
    lv = Level("1-2", 130)
    lv.solid_rect(0, 26, 30, 29)
    lv.solid_rect(38, 26, 60, 29)
    lv.solid_rect(68, 26, 95, 29)
    lv.solid_rect(103, 26, 129, 29)
    lv.death_plane(31, 27, 7, 3)
    lv.death_plane(61, 27, 7, 3)
    lv.death_plane(96, 27, 7, 3)
    lv.oneway_rect(12, 22, 15)
    lv.oneway_rect(20, 19, 23)
    lv.oneway_rect(32, 22, 35)   # 深渊上跳板
    lv.oneway_rect(45, 20, 48)
    lv.oneway_rect(52, 17, 55)
    lv.shard("a", 53, 16)
    lv.oneway_rect(62, 22, 65)
    lv.oneway_rect(75, 21, 78)
    lv.oneway_rect(84, 18, 87)
    lv.shard("b", 85, 17)
    lv.oneway_rect(97, 22, 100)
    lv.oneway_rect(110, 20, 113)
    lv.shard("c", 111, 19)
    lv.checkpoint(1, 40, 25)
    lv.checkpoint(2, 70, 25)
    lv.checkpoint(3, 105, 25)
    lv.coin_cluster(1, 14, 21, 4)
    lv.coin_cluster(2, 46, 19, 4)
    lv.coin_cluster(3, 76, 20, 4)
    lv.coin_cluster(4, 112, 19, 4)
    lv.chest(1, 90, 25)
    lv.goal(125, 23)
    lv.enemy("enm_patrol", 50, 25)
    lv.enemy("enm_patrol", 80, 25)
    lv.enemy("enm_chaser", 115, 25)
    lv.spawn(3, 24)
    return lv


def build_1_3() -> Level:
    """遗迹守卫：巡逻与追击集群 + 首个宝箱"""
    lv = Level("1-3", 140)
    lv.solid_rect(0, 26, 50, 29)
    lv.solid_rect(56, 26, 90, 29)
    lv.solid_rect(96, 26, 139, 29)
    lv.death_plane(51, 27, 5, 3)
    lv.death_plane(91, 27, 5, 3)
    lv.solid_rect(20, 22, 24, 23)
    lv.solid_rect(40, 20, 44, 21)
    lv.shard("a", 42, 19)
    lv.solid_rect(65, 22, 69, 23)
    lv.solid_rect(80, 19, 84, 20)
    lv.shard("b", 82, 18)
    lv.solid_rect(110, 22, 114, 23)
    lv.oneway_rect(120, 18, 123)
    lv.shard("c", 121, 17)
    lv.checkpoint(1, 30, 25)
    lv.checkpoint(2, 70, 25)
    lv.checkpoint(3, 100, 25)
    lv.coin_cluster(1, 22, 21, 5)
    lv.coin_cluster(2, 67, 21, 5)
    lv.coin_cluster(3, 112, 21, 5)
    lv.coin_cluster(4, 125, 25, 6)
    lv.chest(1, 45, 25)
    lv.chest(2, 128, 25)
    lv.goal(135, 23)
    lv.enemy("enm_patrol", 15, 25)
    lv.enemy("enm_patrol", 35, 25)
    lv.enemy("enm_chaser", 60, 25)
    lv.enemy("enm_chaser", 75, 25)
    lv.enemy("enm_patrol", 105, 25)
    lv.enemy("enm_chaser", 120, 25)
    lv.spawn(3, 24)
    return lv


def build_1_4() -> Level:
    """Boss：石像守卫者（竞技场 + 入口检查点）"""
    lv = Level("1-4", 90)
    lv.solid_rect(0, 26, 55, 29)
    lv.solid_rect(56, 26, 89, 29)  # 竞技场地面连续
    lv.checkpoint(1, 50, 25)
    lv.shard("a", 20, 24)
    lv.shard("b", 35, 24)
    lv.shard("c", 45, 24)
    lv.coin_cluster(1, 25, 25, 6)
    lv.coin_cluster(2, 40, 25, 6)
    lv.goal(85, 23)
    lv.enemy("enm_boss_guardian", 72, 24)
    lv.spawn(3, 24)
    return lv


def build_2_1() -> Level:
    """幽暗矿道：尖刺陷阱（death_plane 窄条）+ 深井"""
    lv = Level("2-1", 140)
    lv.solid_rect(0, 26, 40, 29)
    lv.solid_rect(46, 26, 80, 29)
    lv.solid_rect(86, 26, 139, 29)
    lv.death_plane(41, 27, 5, 3)
    lv.death_plane(81, 27, 5, 3)
    # 尖刺（地面窄即死条）
    lv.solid_rect(25, 25, 27, 25)
    lv.death_plane(25, 24, 3, 1)
    lv.solid_rect(60, 25, 62, 25)
    lv.death_plane(60, 24, 3, 1)
    lv.solid_rect(100, 25, 102, 25)
    lv.death_plane(100, 24, 3, 1)
    lv.oneway_rect(15, 21, 18)
    lv.oneway_rect(30, 18, 33)
    lv.shard("a", 31, 17)
    lv.oneway_rect(50, 21, 53)
    lv.oneway_rect(70, 18, 73)
    lv.shard("b", 71, 17)
    lv.oneway_rect(90, 21, 93)
    lv.oneway_rect(110, 18, 113)
    lv.shard("c", 111, 17)
    lv.checkpoint(1, 35, 25)
    lv.checkpoint(2, 65, 25)
    lv.checkpoint(3, 95, 25)
    lv.coin_cluster(1, 16, 20, 4)
    lv.coin_cluster(2, 51, 20, 4)
    lv.coin_cluster(3, 91, 20, 4)
    lv.coin_cluster(4, 120, 25, 6)
    lv.chest(1, 75, 25)
    lv.goal(135, 23)
    lv.enemy("enm_patrol", 20, 25)
    lv.enemy("enm_chaser", 55, 25)
    lv.enemy("enm_patrol", 70, 25)
    lv.enemy("enm_chaser", 105, 25)
    lv.spawn(3, 24)
    return lv


def build_2_2() -> Level:
    """熔岩裂隙：熔岩即死区（宽）+ 崩塌平台（以窄 oneway 跳板表达）"""
    lv = Level("2-2", 140)
    lv.solid_rect(0, 26, 25, 29)
    lv.solid_rect(40, 26, 60, 29)
    lv.solid_rect(75, 26, 95, 29)
    lv.solid_rect(110, 26, 139, 29)
    lv.death_plane(26, 26, 14, 4)   # 熔岩湖 1
    lv.death_plane(61, 26, 14, 4)   # 熔岩湖 2
    lv.death_plane(96, 26, 14, 4)   # 熔岩湖 3
    lv.oneway_rect(28, 22, 30)
    lv.oneway_rect(33, 20, 35)
    lv.oneway_rect(48, 21, 50)
    lv.shard("a", 49, 20)
    lv.oneway_rect(63, 22, 65)
    lv.oneway_rect(68, 20, 70)
    lv.oneway_rect(83, 21, 85)
    lv.shard("b", 84, 20)
    lv.oneway_rect(98, 22, 100)
    lv.oneway_rect(103, 20, 105)
    lv.oneway_rect(120, 18, 123)
    lv.shard("c", 121, 17)
    lv.checkpoint(1, 20, 25)
    lv.checkpoint(2, 50, 25)
    lv.checkpoint(3, 85, 25)
    lv.coin_cluster(1, 30, 19, 4)
    lv.coin_cluster(2, 65, 19, 4)
    lv.coin_cluster(3, 100, 19, 4)
    lv.chest(1, 55, 25)
    lv.goal(135, 23)
    lv.enemy("enm_patrol", 45, 25)
    lv.enemy("enm_chaser", 80, 25)
    lv.enemy("enm_chaser", 115, 25)
    lv.spawn(3, 24)
    return lv


def build_2_3() -> Level:
    """蛛巢深处：飞行敌人 + 垂直爬升段"""
    lv = Level("2-3", 130, 40)
    lv.solid_rect(0, 36, 30, 39)
    lv.solid_rect(36, 36, 60, 39)
    lv.solid_rect(66, 36, 129, 39)
    lv.death_plane(31, 37, 5, 3)
    lv.death_plane(61, 37, 5, 3)
    # 垂直爬升：交错 oneway 阶梯
    lv.oneway_rect(10, 32, 13)
    lv.oneway_rect(16, 28, 19)
    lv.oneway_rect(10, 24, 13)
    lv.oneway_rect(16, 20, 19)
    lv.shard("a", 17, 19)
    lv.oneway_rect(40, 32, 43)
    lv.oneway_rect(46, 28, 49)
    lv.oneway_rect(40, 24, 43)
    lv.shard("b", 41, 23)
    lv.oneway_rect(75, 32, 78)
    lv.oneway_rect(81, 28, 84)
    lv.oneway_rect(87, 24, 90)
    lv.shard("c", 88, 23)
    lv.checkpoint(1, 25, 35)
    lv.checkpoint(2, 50, 35)
    lv.checkpoint(3, 90, 35)
    lv.coin_cluster(1, 12, 31, 4)
    lv.coin_cluster(2, 42, 31, 4)
    lv.coin_cluster(3, 77, 31, 4)
    lv.coin_cluster(4, 100, 35, 6)
    lv.chest(1, 55, 35)
    lv.goal(125, 33)
    lv.enemy("enm_flyer", 20, 26)
    lv.enemy("enm_flyer", 45, 26)
    lv.enemy("enm_flyer", 70, 26)
    lv.enemy("enm_flyer", 95, 26)
    lv.enemy("enm_patrol", 50, 35)
    lv.enemy("enm_chaser", 100, 35)
    lv.spawn(3, 34)
    return lv


def build_2_4() -> Level:
    """Boss：深渊蛛后（召唤/蛛网减速区以竞技场表达）"""
    lv = Level("2-4", 90)
    lv.solid_rect(0, 26, 55, 29)
    lv.solid_rect(56, 26, 89, 29)
    lv.checkpoint(1, 50, 25)
    lv.shard("a", 20, 24)
    lv.shard("b", 35, 24)
    lv.shard("c", 45, 24)
    lv.coin_cluster(1, 25, 25, 6)
    lv.coin_cluster(2, 40, 25, 6)
    lv.goal(85, 23)
    lv.enemy("enm_boss_spider", 72, 24)
    lv.spawn(3, 24)
    return lv


def build_3_1() -> Level:
    """浮空阶梯：强风（以窄平台+大间距表达）+ 限时消失平台（oneway 跳板）"""
    lv = Level("3-1", 140)
    lv.solid_rect(0, 26, 20, 29)
    lv.solid_rect(35, 26, 50, 29)
    lv.solid_rect(65, 26, 80, 29)
    lv.solid_rect(95, 26, 110, 29)
    lv.solid_rect(125, 26, 139, 29)
    lv.death_plane(21, 27, 14, 3)
    lv.death_plane(51, 27, 14, 3)
    lv.death_plane(81, 27, 14, 3)
    lv.death_plane(111, 27, 14, 3)
    lv.oneway_rect(24, 22, 26)
    lv.oneway_rect(29, 20, 31)
    lv.oneway_rect(40, 21, 42)
    lv.shard("a", 41, 20)
    lv.oneway_rect(54, 22, 56)
    lv.oneway_rect(59, 20, 61)
    lv.oneway_rect(70, 21, 72)
    lv.shard("b", 71, 20)
    lv.oneway_rect(84, 22, 86)
    lv.oneway_rect(89, 20, 91)
    lv.oneway_rect(100, 21, 102)
    lv.oneway_rect(114, 22, 116)
    lv.oneway_rect(119, 19, 121)
    lv.shard("c", 120, 18)
    lv.checkpoint(1, 15, 25)
    lv.checkpoint(2, 45, 25)
    lv.checkpoint(3, 75, 25)
    lv.checkpoint(4, 105, 25)
    lv.coin_cluster(1, 26, 19, 4)
    lv.coin_cluster(2, 56, 19, 4)
    lv.coin_cluster(3, 86, 19, 4)
    lv.coin_cluster(4, 116, 18, 4)
    lv.chest(1, 78, 25)
    lv.goal(135, 23)
    lv.enemy("enm_flyer", 30, 20)
    lv.enemy("enm_flyer", 60, 20)
    lv.enemy("enm_flyer", 90, 20)
    lv.enemy("enm_chaser", 45, 25)
    lv.enemy("enm_chaser", 100, 25)
    lv.spawn(3, 24)
    return lv


def build_3_2() -> Level:
    """神殿回廊：远程敌人 + 可破坏掩体（以实心柱表达）"""
    lv = Level("3-2", 140)
    lv.solid_rect(0, 26, 139, 29)
    lv.solid_rect(25, 22, 26, 25)   # 掩体柱 1
    lv.solid_rect(50, 22, 51, 25)   # 掩体柱 2
    lv.solid_rect(75, 22, 76, 25)   # 掩体柱 3
    lv.solid_rect(100, 22, 101, 25) # 掩体柱 4
    lv.oneway_rect(30, 19, 33)
    lv.shard("a", 31, 18)
    lv.oneway_rect(55, 19, 58)
    lv.shard("b", 56, 18)
    lv.oneway_rect(80, 19, 83)
    lv.oneway_rect(105, 19, 108)
    lv.shard("c", 106, 18)
    lv.checkpoint(1, 20, 25)
    lv.checkpoint(2, 60, 25)
    lv.checkpoint(3, 90, 25)
    lv.coin_cluster(1, 35, 25, 5)
    lv.coin_cluster(2, 62, 25, 5)
    lv.coin_cluster(3, 88, 25, 5)
    lv.coin_cluster(4, 115, 25, 6)
    lv.chest(1, 45, 25)
    lv.goal(135, 23)
    lv.enemy("enm_chaser", 35, 25)
    lv.enemy("enm_flyer", 45, 18)
    lv.enemy("enm_chaser", 65, 25)
    lv.enemy("enm_flyer", 85, 18)
    lv.enemy("enm_chaser", 110, 25)
    lv.spawn(3, 24)
    return lv


def build_3_3() -> Level:
    """星辉祭坛：精英混编 + 机关顺序谜题（以高台+窄道表达）"""
    lv = Level("3-3", 140)
    lv.solid_rect(0, 26, 45, 29)
    lv.solid_rect(52, 26, 90, 29)
    lv.solid_rect(97, 26, 139, 29)
    lv.death_plane(46, 27, 6, 3)
    lv.death_plane(91, 27, 6, 3)
    lv.solid_rect(15, 20, 19, 21)
    lv.solid_rect(30, 16, 34, 17)
    lv.shard("a", 32, 15)
    lv.solid_rect(60, 20, 64, 21)
    lv.solid_rect(75, 16, 79, 17)
    lv.shard("b", 77, 15)
    lv.solid_rect(105, 20, 109, 21)
    lv.solid_rect(120, 16, 124, 17)
    lv.shard("c", 122, 15)
    lv.checkpoint(1, 25, 25)
    lv.checkpoint(2, 70, 25)
    lv.checkpoint(3, 100, 25)
    lv.coin_cluster(1, 17, 19, 5)
    lv.coin_cluster(2, 62, 19, 5)
    lv.coin_cluster(3, 107, 19, 5)
    lv.coin_cluster(4, 130, 25, 6)
    lv.chest(1, 40, 25)
    lv.chest(2, 85, 25)
    lv.goal(135, 23)
    lv.enemy("enm_elite", 20, 24)
    lv.enemy("enm_chaser", 35, 25)
    lv.enemy("enm_elite", 65, 24)
    lv.enemy("enm_flyer", 70, 18)
    lv.enemy("enm_elite", 110, 24)
    lv.enemy("enm_chaser", 125, 25)
    lv.spawn(3, 24)
    return lv


def build_3_4() -> Level:
    """最终 Boss：回响之影"""
    lv = Level("3-4", 90)
    lv.solid_rect(0, 26, 55, 29)
    lv.solid_rect(56, 26, 89, 29)
    lv.checkpoint(1, 50, 25)
    lv.shard("a", 20, 24)
    lv.shard("b", 35, 24)
    lv.shard("c", 45, 24)
    lv.coin_cluster(1, 25, 25, 6)
    lv.coin_cluster(2, 40, 25, 6)
    lv.goal(85, 23)
    lv.enemy("enm_boss_echo", 72, 24)
    lv.spawn(3, 24)
    return lv


LEVEL_BUILDERS = {
    "1-1": build_1_1, "1-2": build_1_2, "1-3": build_1_3, "1-4": build_1_4,
    "2-1": build_2_1, "2-2": build_2_2, "2-3": build_2_3, "2-4": build_2_4,
    "3-1": build_3_1, "3-2": build_3_2, "3-3": build_3_3, "3-4": build_3_4,
}


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    ids = sys.argv[1:] or list(LEVEL_BUILDERS.keys())
    for level_id in ids:
        builder = LEVEL_BUILDERS.get(level_id)
        if builder is None:
            print(f"skip {level_id}: 未定义生成器")
            continue
        lv = builder()
        path = os.path.join(OUT_DIR, f"{level_id}.json")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(lv.to_json(), f, ensure_ascii=False)
        size = os.path.getsize(path)
        print(f"  levels/{level_id}.json {lv.w}x{lv.h} tiles, {size} bytes")


if __name__ == "__main__":
    main()
