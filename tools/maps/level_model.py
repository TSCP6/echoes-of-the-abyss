"""Tiled 地图公共构造模型（DR-03 / DEC-7），由 level_layouts 定义十二关布局。

地形 32px，图集 22 列；三区域保持 GID 一致。地图以 JSON 数字数组保存，
CSV 是层编码，不是要导出为丢失对象层的独立 CSV 文件。
"""

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
    def boss_arena(self, tx, ty, tw, th): self.obj("boss_arena", "boss_arena", tx, ty, tw, th)

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
        order = ["spawn", "enemies", "checkpoints", "shards", "pickups", "hazards", "goal", "hints", "mechanisms"]
        if any(name == "boss_arena" for name, _ in self.objects):
            order.append("boss_arena")
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
