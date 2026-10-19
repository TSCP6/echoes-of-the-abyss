"""关卡地图生成器（选项 B：代码生成 Tiled 兼容 CSV JSON，DR-03 / DEC-7）。

产出 public/assets/levels/<id>.json，格式与 Tiled 导出一致：
- orientation=orthogonal、tilewidth/tileheight=32、encoding=csv 明文
- 瓦片层：collision（solid 属性）/ oneway / decor_back / decor_front
- 对象层：spawn / enemies / checkpoints / shards / pickups / hazards / goal / hints（DD-05）

瓦片 GID（terrain32.png，22 列）：草顶 7/8/9（左/中/右），泥土 51/52/53，木板(oneway) 41/42/43。
tileset 内为 solid 瓦片写入自定义属性 solid=true（LevelLoader 以 setCollisionByProperty 读取）。

用法：python tools/gen_levels.py [level_id ...]（缺省生成 LEVEL_SPECS 全部已定义关卡）
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "assets", "levels")

TILE = 32
W, H = 120, 30  # 1-1 尺寸：3840x960 px（SRS FR-11 常规关 3200~6400 x 768~1536 内）

GRASS_L, GRASS_M, GRASS_R = 7, 8, 9
DIRT_L, DIRT_M, DIRT_R = 51, 52, 53
WOOD_L, WOOD_M, WOOD_R = 41, 42, 43
SOLID_GIDS = {GRASS_L, GRASS_M, GRASS_R, DIRT_L, DIRT_M, DIRT_R}


class Level:
    def __init__(self, level_id: str, w: int = W, h: int = H):
        self.id = level_id
        self.w, self.h = w, h
        self.collision = [0] * (w * h)
        self.oneway = [0] * (w * h)
        self.decor_back = [0] * (w * h)
        self.decor_front = [0] * (w * h)
        self.objects = []  # (layer, dict)
        self._oid = 1

    def _put(self, layer, x, y, gid):
        if 0 <= x < self.w and 0 <= y < self.h:
            layer[y * self.w + x] = gid

    def solid_rect(self, x0, y0, x1, y1):
        """实心块：顶行草皮（左/中/右），其余泥土。"""
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
        """tx/ty 为瓦片坐标；w/h=0 表示点对象，否则矩形（像素）。"""
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

    # ---- 语义对象快捷方式 ----
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
    lv = Level("1-1")
    # 地面三段（顶行 row 26），两处深渊缺口 45-48 / 70-73
    lv.solid_rect(0, 26, 44, 29)
    lv.solid_rect(49, 26, 69, 29)
    lv.solid_rect(74, 26, 119, 29)
    lv.death_plane(45, 27, 4, 3)
    lv.death_plane(70, 27, 4, 3)
    # 教学跳跃：单向平台阶梯
    lv.oneway_rect(14, 23, 17)
    lv.oneway_rect(20, 20, 23)
    # 碎片 a 高台路线
    lv.oneway_rect(28, 17, 31)
    lv.shard("a", 29, 16)
    # 两格台阶（可跳过）
    lv.solid_rect(36, 24, 39, 25)
    lv.checkpoint(1, 42, 25)
    # 第二段：单向平台 + 隐藏碎片 b（石柱后凹角）
    lv.oneway_rect(52, 22, 55)
    lv.oneway_rect(58, 19, 61)
    lv.solid_rect(63, 22, 63, 25)
    lv.shard("b", 65, 24)
    lv.checkpoint(2, 80, 25)
    # 碎片 c 高路线
    lv.oneway_rect(95, 20, 98)
    lv.oneway_rect(100, 17, 103)
    lv.shard("c", 101, 16)
    # 金币堆 / 宝箱 / 终点
    lv.coin_cluster(1, 10, 25, 5)
    lv.coin_cluster(2, 30, 16, 3)
    lv.coin_cluster(3, 55, 18, 4)
    lv.coin_cluster(4, 85, 25, 6)
    lv.coin_cluster(5, 101, 16, 3)
    lv.chest(1, 88, 25)
    lv.goal(115, 23)
    # 教学提示触发区（FR-17 五区：移动/跳跃/攻击/拾取/交互）
    lv.hint(1, "move", 4, 24, 4, 2)
    lv.hint(2, "jump", 12, 21, 4, 5)
    lv.hint(3, "attack", 24, 24, 4, 2)
    lv.hint(4, "pickup", 50, 24, 4, 2)
    lv.hint(5, "interact", 86, 23, 4, 3)
    # 敌人（P2 生成；P1 仅数据）
    lv.enemy("enm_patrol", 33, 25)
    lv.enemy("enm_patrol", 60, 25)
    lv.spawn(3, 24)
    return lv


LEVEL_BUILDERS = {"1-1": build_1_1}


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
