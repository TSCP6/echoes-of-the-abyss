"""实际 Tiled JSON 的静态可达性审计（不读取生成器）。

节点为可容纳完整碰撞体的连续站立区；边为通过体积碰撞检查的满跳或落体。
要求终点、三碎片、检查点、开关及每枚预置金币和宝箱可达；装饰孤台不必全部可达。
运动参数读取 playerDefaults.ts，不借助土狼、跳跃缓冲或受伤位移。
相邻 1/240 秒采样间使用包围盒扫掠，保守拒绝穿实体、即死区和中途平台。

python -X utf8 tools/maps/audit_reach.py [1-1 ...] [--json [报告路径]]
--json 不带路径时只输出 JSON。报告 launch/landing/target.y 是脚底；sprite.y=脚底-32。
静态几何门禁不能替代 Phaser 中的输入、战斗、机关计时和真实落地验证。
"""
import argparse
from collections import deque
from dataclasses import asdict, dataclass
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
EPS, STEP, MARGIN = 1e-5, 1 / 240, 1.0


@dataclass(frozen=True)
class Physics:
    gravity: float
    jumpVelocity: float
    walkSpeed: float
    accelTimeSec: float
    airControlFactor: float
    width: float
    height: float
    spriteFootOffset: float = 32.0

    @property
    def air_accel(self):
        return self.walkSpeed / self.accelTimeSec * self.airControlFactor


def load_physics(path=None):
    source = (path or ROOT / 'src/game/data/playerDefaults.ts').read_text(encoding='utf-8')
    source = re.sub(r'/\*.*?\*/|//[^\n]*', '', source, flags=re.S)

    def value(name, text=source):
        match = re.search(r'\b' + re.escape(name) + r'\s*:\s*(-?\d+(?:\.\d+)?)', text)
        if match is None:
            raise ValueError(f'playerDefaults 中缺少数值字段：{name}')
        return float(match.group(1))

    collider = re.search(r'collider\s*:\s*\{([^}]+)\}', source)
    if collider is None:
        raise ValueError('playerDefaults 中缺少 collider')
    return Physics(*(value(n) for n in ('gravity', 'jumpVelocity', 'walkSpeed',
                                        'accelTimeSec', 'airControlFactor')),
                   value('w', collider.group(1)), value('h', collider.group(1)))


@dataclass(frozen=True)
class Surface:
    id: int
    left: float
    right: float
    y: float
    xMin: float
    xMax: float
    kind: str


def clamp(value, low, high):
    return max(low, min(high, value))


def overlap(a, b):
    return a[0] < b[2] - EPS and a[2] > b[0] + EPS and a[1] < b[3] - EPS and a[3] > b[1] + EPS


def properties(obj):
    return {p['name']: p.get('value') for p in obj.get('properties', [])}


def object_kind(obj):
    return obj.get('class') or obj.get('type', '')


def rect_of(obj):
    x, y = float(obj.get('x', 0)), float(obj.get('y', 0))
    return x, y, x + obj.get('width', 0), y + obj.get('height', 0)


class Geometry:
    def __init__(self, raw, physics):
        self.raw, self.p = raw, physics
        if raw.get('tilewidth') != 32 or raw.get('tileheight') != 32:
            raise ValueError('地图瓦片必须为 32×32')
        if raw.get('orientation') != 'orthogonal':
            raise ValueError('地图必须为 orthogonal')
        self.tile = float(raw['tilewidth'])
        self.width, self.height = raw['width'] * self.tile, raw['height'] * self.tile
        self.layers = {layer['name']: layer for layer in raw.get('layers', [])}
        self.solid, self.oneway, solid_gids = set(), set(), set()
        for tileset in raw.get('tilesets', []):
            if 'source' in tileset:
                raise ValueError('请导出嵌入 tileset 属性的 JSON；尚不支持外部 tileset')
            for tile in tileset.get('tiles', []):
                if properties(tile).get('solid') is True:
                    solid_gids.add(tileset.get('firstgid', 1) + tile['id'])
        for name, cells in (('collision', self.solid), ('oneway', self.oneway)):
            layer = self.layers.get(name)
            if layer is None:
                raise ValueError(f'地图缺少 {name} 层')
            if layer.get('encoding') != 'csv' or not isinstance(layer.get('data'), list):
                raise ValueError(f'{name} 须为 CSV 数组')
            width, height = layer.get('width', raw['width']), layer.get('height', raw['height'])
            if len(layer['data']) != width * height:
                raise ValueError(f'{name} 瓦片数量与宽高不一致')
            if layer.get('offsetx', 0) or layer.get('offsety', 0):
                raise ValueError(f'{name} 的像素 offset 尚未支持')
            ox, oy = layer.get('x', 0), layer.get('y', 0)
            for index, gid in enumerate(layer['data']):
                gid &= 0x0fffffff
                if gid and (name == 'oneway' or gid in solid_gids):
                    cells.add((index % width + ox, index // width + oy))
        self.hazards = [rect_of(o) for o in self.objects('hazards') if object_kind(o) == 'death_plane']
        self.mechanisms = self.objects('mechanisms')
        self.crumble = [o for o in self.mechanisms if object_kind(o) == 'crumble']
        self.surfaces = self.make_surfaces()

    def objects(self, name):
        return self.layers.get(name, {}).get('objects', [])

    def body(self, x, foot):
        return x - self.p.width / 2, foot - self.p.height, x + self.p.width / 2, foot

    def blocked(self, bounds):
        if bounds[0] < -EPS or bounds[2] > self.width + EPS:
            return True
        for y in range(math.floor((bounds[1] + EPS) / self.tile), math.floor((bounds[3] - EPS) / self.tile) + 1):
            for x in range(math.floor((bounds[0] + EPS) / self.tile), math.floor((bounds[2] - EPS) / self.tile) + 1):
                if (x, y) in self.solid:
                    return True
        return any(overlap(bounds, hazard) for hazard in self.hazards)

    def make_surfaces(self):
        runs = []
        for kind, cells in (('solid', self.solid), ('oneway', self.oneway)):
            rows = {}
            for x, y in cells:
                if kind != 'solid' or (x, y - 1) not in self.solid:
                    rows.setdefault(y, []).append(x)
            for y, xs in sorted(rows.items()):
                xs.sort()
                first = previous = xs[0]
                for x in xs[1:] + [None]:
                    if x is not None and x == previous + 1:
                        previous = x
                        continue
                    runs.append((first * self.tile, (previous + 1) * self.tile, y * self.tile, kind))
                    first = previous = x
        runs += [(o['x'], o['x'] + o['width'], o['y'], 'crumble') for o in self.crumble if o.get('width', 0) > 0]
        surfaces = []
        for left, right, y, kind in sorted(runs, key=lambda r: (r[2], r[0], r[3])):
            intervals = [(left + self.p.width / 2 + MARGIN, right - self.p.width / 2 - MARGIN)]
            obstacles = [(x * self.tile, sy * self.tile, (x + 1) * self.tile, (sy + 1) * self.tile)
                         for x, sy in self.solid
                         if sy * self.tile < y - EPS and (sy + 1) * self.tile > y - self.p.height + EPS]
            obstacles += [r for r in self.hazards if r[1] < y - EPS and r[3] > y - self.p.height + EPS]
            for obstacle in obstacles:
                lo, hi = obstacle[0] - self.p.width / 2 - MARGIN, obstacle[2] + self.p.width / 2 + MARGIN
                sliced = []
                for a, b in intervals:
                    if hi <= a or lo >= b:
                        sliced.append((a, b))
                    else:
                        if lo > a:
                            sliced.append((a, lo))
                        if hi < b:
                            sliced.append((hi, b))
                intervals = sliced
            for a, b in intervals:
                if b >= a:
                    surfaces.append(Surface(len(surfaces), left, right, y, a, b, kind))
        return surfaces

    def trajectory_clear(self, samples, target):
        previous = samples[0]
        if self.blocked(self.body(*previous[:2])):
            return False
        for index, current in enumerate(samples[1:], 1):
            a, b = self.body(*previous[:2]), self.body(*current[:2])
            swept = min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])
            if self.blocked(swept):
                return False
            if current[1] > previous[1] + EPS:
                for surface in self.surfaces:
                    if previous[1] < surface.y - EPS and current[1] >= surface.y - EPS:
                        frac = (surface.y - previous[1]) / (current[1] - previous[1])
                        cross_x = previous[0] + (current[0] - previous[0]) * frac
                        if cross_x + self.p.width / 2 > surface.left + EPS and cross_x - self.p.width / 2 < surface.right - EPS:
                            # 同一排平台可能因头顶实体被切成多个站立节点；
                            # 碰撞顶面相同，落点须位于实际目标节点的净空区。
                            landing = (index == len(samples) - 1 and abs(surface.y - target.y) < EPS
                                       and target.xMin - EPS <= cross_x <= target.xMax + EPS)
                            if not landing:
                                return False
            previous = current
        return True


def horizontal(t, held, velocity, direction, p):
    """空中按住方向，再松开；速度线性逼近控制器目标速度。"""
    accel, hold, initial = p.air_accel, min(t, held), abs(velocity)
    ramp = min(hold, max(0, (p.walkSpeed - initial) / accel))
    distance = initial * ramp + accel * ramp * ramp / 2 + p.walkSpeed * (hold - ramp)
    peak = min(p.walkSpeed, initial + accel * hold)
    brake = min(max(0, t - hold), peak / accel)
    distance += peak * brake - accel * brake * brake / 2
    return direction * distance


def samples_for(x, y, velocity, direction, held, duration, jump, p):
    count = max(1, math.ceil(duration / STEP))
    return [(x + horizontal(duration * i / count, held, velocity, direction, p),
             y - (p.jumpVelocity if jump else 0) * duration * i / count + p.gravity * (duration * i / count) ** 2 / 2,
             duration * i / count) for i in range(count + 1)]


def values(candidates, low, high):
    return list(dict.fromkeys(round(clamp(v, low, high), 4) for v in candidates))


def public_edge(edge):
    return {key: value for key, value in edge.items() if not key.startswith('_')}


def find_edge(g, source, destination, aims=(), jump=True):
    p, rise = g.p, source.y - destination.y
    discriminant = p.jumpVelocity ** 2 - 2 * p.gravity * rise
    if jump:
        if discriminant < 2 * p.gravity * 4:
            return None
        duration = (p.jumpVelocity + math.sqrt(discriminant)) / p.gravity
    else:
        if destination.y <= source.y + EPS:
            return None
        duration = math.sqrt(2 * (destination.y - source.y) / p.gravity)
    reach = p.walkSpeed * duration
    if destination.xMin - source.xMax > reach or source.xMin - destination.xMax > reach:
        return None
    middle = (destination.xMin + destination.xMax) / 2
    launches = values([middle, source.xMax, source.xMin, destination.xMin - reach + 4,
                       destination.xMax + reach - 4, middle - reach + 4, middle + reach - 4,
                       (source.xMin + source.xMax) / 2, *aims], source.xMin, source.xMax)
    if not jump:
        launches = [source.right + p.width / 2 + 1, source.left - p.width / 2 - 1]
    for x in launches:
        landings = values([middle, destination.xMin + 4, destination.xMax - 4, x,
                           x - 32, x + 32, x - 64, x + 64, x - 128, x + 128,
                           x - reach / 2, x + reach / 2, *aims], destination.xMin, destination.xMax)
        landings.sort(key=lambda tx: abs(tx - x))
        for tx in landings:
            direction = 1 if tx >= x else -1
            for running in (False, True):
                velocity = direction * p.walkSpeed if running else 0.0
                run_distance = p.walkSpeed * p.accelTimeSec / 2 + 4
                run_start = x - direction * run_distance if running else x
                if running and not source.xMin <= run_start <= source.xMax:
                    continue
                if not jump:
                    direction, velocity = (1 if x > source.right else -1), p.walkSpeed
                    velocity *= direction
                    if (tx - x) * direction < -EPS:
                        continue
                    run_start = clamp(x - direction * run_distance, source.xMin, source.xMax)
                    if any(g.blocked(g.body(run_start + (x - run_start) * n / 16, source.y)) for n in range(17)):
                        continue
                wanted = abs(tx - x)
                max_shift = abs(horizontal(duration, duration, velocity, direction, p))
                min_shift = abs(horizontal(duration, 0, velocity, direction, p))
                if wanted > max_shift + EPS or wanted < min_shift - EPS:
                    continue
                low, high = 0.0, duration
                for _ in range(24):
                    mid = (low + high) / 2
                    if abs(horizontal(duration, mid, velocity, direction, p)) < wanted:
                        low = mid
                    else:
                        high = mid
                held = (low + high) / 2
                samples = samples_for(x, source.y, velocity, direction, held, duration, jump, p)
                if g.trajectory_clear(samples, destination):
                    approach_distance = abs(x - run_start)
                    approach_seconds = (p.accelTimeSec + max(0, approach_distance - p.walkSpeed * p.accelTimeSec / 2)
                                        / p.walkSpeed) if velocity else 0
                    return {'from': source.id, 'to': destination.id, 'kind': 'jump' if jump else 'drop',
                            'launch': {'x': x, 'y': source.y}, 'landing': {'x': round(samples[-1][0], 3), 'y': destination.y},
                            'direction': direction, 'initialVx': velocity, 'runUpStart': {'x': run_start, 'y': source.y},
                            'runUpMs': round(approach_seconds * 1000),
                            'flightSeconds': round(duration, 5),
                            'jumpHoldMs': math.ceil(p.jumpVelocity / p.gravity * 1000 + 34) if jump else 0,
                            'moveMs': round(held * 1000),
                            'quickDeparture': source.kind == 'crumble' or destination.kind == 'crumble', '_samples': samples}
    return None


def make_target(obj, kind):
    x, y = float(obj.get('x', 0)), float(obj.get('y', 0))
    if kind == 'goal':
        bounds = [x, y, x + obj.get('width', 64), y + obj.get('height', 96)]
    else:
        rx, ry = {'shard': (36, 48), 'checkpoint': (40, 60), 'switch': (76, 88), 'chest': (44, 56), 'coin': (96, 96)}[kind]
        bounds = [x - rx, y - ry, x + rx, y + ry]
    return {'id': obj.get('name', ''), 'kind': kind, 'bounds': bounds, 'object': {'x': x, 'y': y},
            **({'properties': properties(obj)} if kind == 'switch' else {})}


def target_hit(target, x, foot, p):
    if target['kind'] == 'coin':
        return math.hypot(x - target['object']['x'], foot - p.spriteFootOffset - target['object']['y']) < 96 - EPS
    left, top, right, bottom = target['bounds']
    return left + EPS < x < right - EPS and top + EPS < foot - p.spriteFootOffset < bottom - EPS


def standing_hit(target, surface, p):
    x = clamp(target['object']['x'] if target['kind'] != 'goal' else (target['bounds'][0] + target['bounds'][2]) / 2,
              surface.xMin, surface.xMax)
    return {'x': x, 'y': surface.y} if target_hit(target, x, surface.y, p) else None


def audit_map(raw, level_id='test', physics=None):
    p = physics or load_physics()
    g = Geometry(raw, p)
    surfaces, errors = g.surfaces, []
    spawn_objects = [o for o in g.objects('spawn') if o.get('name') == 'player_spawn']
    goal_objects = [o for o in g.objects('goal') if o.get('name') == 'goal']
    if len(spawn_objects) != 1 or len(goal_objects) != 1:
        raise ValueError('player_spawn 与 goal 均须恰好一个')
    sx, sy = float(spawn_objects[0].get('x', 0) + 16), float(spawn_objects[0].get('y', 0) + 16)
    spawn_foot, spawn_surface = sy + p.spriteFootOffset, None
    if not g.blocked(g.body(sx, spawn_foot)):
        for surface in sorted(surfaces, key=lambda s: s.y):
            if surface.xMin <= sx <= surface.xMax and surface.y >= spawn_foot - EPS:
                duration = math.sqrt(max(0, 2 * (surface.y - spawn_foot) / p.gravity))
                if g.trajectory_clear(samples_for(sx, spawn_foot, 0, 1, 0, duration, False, p), surface):
                    spawn_surface = surface.id
                    break
    if spawn_surface is None:
        errors.append('出生位置嵌入实体/即死区，或下方没有安全落点')
    goal = make_target(goal_objects[0], 'goal')
    shards = [make_target(o, 'shard') for o in g.objects('shards')]
    checkpoints = [make_target(o, 'checkpoint') for o in g.objects('checkpoints')]
    switches = [make_target(o, 'switch') for o in g.mechanisms if object_kind(o) == 'switch']
    switches.sort(key=lambda t: (str(t['properties'].get('group', '')), int(t['properties'].get('order', 0))))
    if len(shards) != 3:
        errors.append(f'碎片数量={len(shards)}，须恰为3')
    if len({s['id'] for s in shards}) != len(shards):
        errors.append('碎片 id 重复')
    chests = [make_target(o, 'chest') for o in g.objects('pickups') if o.get('name', '').startswith('chest_')]
    coins = []
    for obj in g.objects('pickups'):
        if not obj.get('name', '').startswith('coin_cluster_'):
            continue
        count = int(properties(obj).get('count', 1))
        if not 1 <= count <= 64:
            errors.append(f"金币堆 {obj.get('name')} 数量必须为1至64")
            continue
        for i in range(count):
            coin = {**obj, 'name': f"{obj['name']}/{i + 1}",
                    'x': obj['x'] + (i % 4) * 10 - 15, 'y': obj['y'] - (i // 4) * 10}
            coins.append({**make_target(coin, 'coin'), 'clusterId': obj['name'], 'coinIndex': i})
    for target in [*chests, *coins]:
        x, y = target['object']['x'], target['object']['y']
        # 箱纹理48×40，显示中心y+8；金币64px帧缩半后圆轮廓约27px。
        visual_bounds = (x - 24, y - 12, x + 24, y + 28) if target['kind'] == 'chest' else (x - 14, y - 14, x + 14, y + 14)
        target['visualBounds'] = visual_bounds
        target['clear'] = not g.blocked(visual_bounds)
        if not target['clear']:
            errors.append(f"{'宝箱' if target['kind'] == 'chest' else '金币'} {target['id']} 嵌入实体/即死区或越界")
    targets = [goal, *shards, *checkpoints, *switches, *chests, *coins]
    aims = list(dict.fromkeys(t['object']['x'] for t in targets))
    edges, adjacency = [], {s.id: [] for s in surfaces}

    def add_edge(edge):
        edge['id'] = len(edges)
        edges.append(edge)
        adjacency[edge['from']].append(edge['id'])

    for source in surfaces:
        for destination in surfaces:
            if source.id == destination.id:
                continue
            edge = find_edge(g, source, destination, aims)
            if edge is None and destination.y > source.y:
                edge = find_edge(g, source, destination, aims, jump=False)
            if edge:
                add_edge(edge)
    for source in surfaces:
        for target in targets:
            if target['kind'] in ('switch', 'chest') or standing_hit(target, source, p):
                continue
            x, duration = clamp(target['object']['x'], source.xMin, source.xMax), 2 * p.jumpVelocity / p.gravity
            samples = samples_for(x, source.y, 0, 1, 0, duration, True, p)
            if any(target_hit(target, px, py, p) for px, py, _ in samples) and g.trajectory_clear(samples, source):
                add_edge({'from': source.id, 'to': source.id, 'kind': 'jump',
                          'launch': {'x': x, 'y': source.y}, 'landing': {'x': x, 'y': source.y},
                          'direction': 1, 'initialVx': 0.0, 'runUpStart': {'x': x, 'y': source.y}, 'runUpMs': 0,
                          'flightSeconds': round(duration, 5), 'jumpHoldMs': math.ceil(p.jumpVelocity / p.gravity * 1000 + 34),
                          'moveMs': 0, 'quickDeparture': source.kind == 'crumble', '_samples': samples})
    parents = {spawn_surface: None} if spawn_surface is not None else {}
    queue = deque(parents)
    while queue:
        node = queue.popleft()
        for edge_id in adjacency[node]:
            other = edges[edge_id]['to']
            if other not in parents:
                parents[other] = edge_id
                queue.append(other)

    def node_path(node):
        path = []
        while parents[node] is not None:
            edge_id = parents[node]
            path.append(edge_id)
            node = edges[edge_id]['from']
        return list(reversed(path))

    required = [*shards, *switches]
    predecessors = {}
    for index, target in enumerate(required):
        predecessors[index] = sum(1 << i for i, earlier in enumerate(required)
                                  if target['kind'] == earlier['kind'] == 'switch'
                                  and target['properties'].get('group', '') == earlier['properties'].get('group', '')
                                  and int(earlier['properties'].get('order', 0)) < int(target['properties'].get('order', 0)))

    def acquire(mask, available):
        for index in range(len(required)):
            if available & (1 << index) and mask & predecessors[index] == predecessors[index]:
                mask |= 1 << index
        return mask

    def path_steps(path, target=None, final_hit=None, visit_required=False):
        steps, visited, current_x, current_node = [], 0, sx, spawn_surface

        def walk_to(x, node, objective=None):
            nonlocal current_x
            if abs(x - current_x) > 1 or objective:
                steps.append({'kind': 'walk', 'surface': node, 'fromX': round(current_x, 3),
                              'target': {'x': round(x, 3), 'y': surfaces[node].y},
                              'direction': 1 if x >= current_x else -1,
                              'moveMs': round(abs(x - current_x) / p.walkSpeed * 1000), 'objective': objective,
                              'quickDeparture': surfaces[node].kind == 'crumble'})
            current_x = x

        def visit(node):
            nonlocal visited
            if not visit_required:
                return
            for index, objective in enumerate(required):
                hit = standing_hit(objective, surfaces[node], p)
                if not visited & (1 << index) and hit and visited & predecessors[index] == predecessors[index]:
                    walk_to(hit['x'], node, objective['id'])
                    if objective['kind'] == 'switch':
                        steps.append({'kind': 'interact', 'target': hit, 'objective': objective['id'],
                                      'group': objective['properties'].get('group', ''), 'order': objective['properties'].get('order', 0)})
                    visited |= 1 << index

        for edge_id in path:
            edge = edges[edge_id]
            visit(current_node)
            walk_to(edge['runUpStart']['x'], current_node)
            steps.append(public_edge(edge))
            current_x, current_node = edge['landing']['x'], edge['to']
            for index, objective in enumerate(required):
                if objective['kind'] == 'shard' and any(target_hit(objective, x, y, p) for x, y, _ in edge['_samples']):
                    visited |= 1 << index
        if current_node is not None:
            visit(current_node)
            if final_hit:
                walk_to(final_hit['x'], current_node, target['id'] if target else None)
        return steps

    # 奖励的独立路线需要真实的机关前置；长表面上的步行同样可能穿过关闭的门。
    gate_rects = [(rect_of(obj), properties(obj).get('group', ''))
             for obj in g.mechanisms if object_kind(obj) == 'gate']
    group_masks = {group: sum(1 << i for i, switch in enumerate(switches)
                              if switch['properties'].get('group', '') == group)
                   for _, group in gate_rects}
    switch_predecessors = [sum(1 << j for j, earlier in enumerate(switches)
                               if earlier['properties'].get('group', '') == target['properties'].get('group', '')
                               and int(earlier['properties'].get('order', 0)) < int(target['properties'].get('order', 0)))
                           for target in switches]

    def gate_mask(bounds):
        mask = 0
        for gate_bounds, group in gate_rects:
            if overlap(bounds, gate_bounds):
                # 没有配套开关的门不能被静态路线假设为已开启。
                mask |= group_masks[group] or (1 << len(switches))
        return mask

    def walk_mask(x, tx, node):
        return gate_mask((min(x, tx) - p.width / 2, surfaces[node].y - p.height,
                          max(x, tx) + p.width / 2, surfaces[node].y))

    def walk_step(x, tx, node, objective=None):
        return {'kind': 'walk', 'surface': node, 'fromX': round(x, 3),
                'target': {'x': round(tx, 3), 'y': surfaces[node].y},
                'direction': 1 if tx >= x else -1, 'moveMs': round(abs(tx - x) / p.walkSpeed * 1000),
                'objective': objective, 'quickDeparture': surfaces[node].kind == 'crumble'}

    edge_gate_masks = {}
    if gate_rects:
        for edge in edges:
            needed = walk_mask(edge['runUpStart']['x'], edge['launch']['x'], edge['from'])
            samples = edge['_samples']
            for previous, current in zip(samples, samples[1:]):
                a, b = g.body(*previous[:2]), g.body(*current[:2])
                needed |= gate_mask((min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])))
            edge_gate_masks[edge['id']] = needed
    reward_start = (spawn_surface, round(sx, 4), 0)
    reward_states = {reward_start: None} if spawn_surface is not None and gate_rects else {}
    queue = deque(reward_states)
    while queue:
        state = queue.popleft()
        node, x, mask = state

        def remember(other, steps):
            if other not in reward_states:
                reward_states[other] = (state, steps)
                queue.append(other)

        for index, switch in enumerate(switches):
            if mask & (1 << index) or mask & switch_predecessors[index] != switch_predecessors[index]:
                continue
            hit = standing_hit(switch, surfaces[node], p)
            if hit and walk_mask(x, hit['x'], node) & ~mask == 0:
                remember((node, round(hit['x'], 4), mask | (1 << index)), [
                    walk_step(x, hit['x'], node, switch['id']),
                    {'kind': 'interact', 'target': hit, 'objective': switch['id'],
                     'group': switch['properties'].get('group', ''), 'order': switch['properties'].get('order', 0)}])
        for edge_id in adjacency[node]:
            edge = edges[edge_id]
            needed = edge_gate_masks[edge_id] | walk_mask(x, edge['runUpStart']['x'], node)
            if needed & ~mask == 0:
                remember((edge['to'], round(edge['landing']['x'], 4), mask),
                         [walk_step(x, edge['runUpStart']['x'], node), public_edge(edge)])

    def reward_path(state):
        chunks = []
        while reward_states[state] is not None:
            previous, steps = reward_states[state]
            chunks.append(steps)
            state = previous
        steps = [step for chunk in reversed(chunks) for step in chunk]
        edge_ids = [step['id'] for step in steps if step['kind'] in ('jump', 'drop')]
        return steps, edge_ids

    def reward_route(target):
        for state in reward_states:
            node, x, mask = state
            hit = standing_hit(target, surfaces[node], p)
            if hit and walk_mask(x, hit['x'], node) & ~mask == 0:
                steps, edge_ids = reward_path(state)
                steps.append(walk_step(x, hit['x'], node, target['id']))
                if target['kind'] == 'chest':
                    steps.append({'kind': 'interact', 'target': hit, 'objective': target['id']})
                return {**target, 'reachable': True, 'surface': node, 'hit': hit, 'edgeIds': edge_ids, 'steps': steps}
        if target['kind'] == 'coin':
            for state in reward_states:
                node, x, mask = state
                for edge_id in adjacency[node]:
                    edge = edges[edge_id]
                    if (edge_gate_masks[edge_id] | walk_mask(x, edge['runUpStart']['x'], node)) & ~mask:
                        continue
                    hit = next(({'x': px, 'y': py, 'time': t} for px, py, t in edge['_samples']
                                if target_hit(target, px, py, p)), None)
                    if hit:
                        steps, edge_ids = reward_path(state)
                        return {**target, 'reachable': True, 'surface': edge['to'], 'hit': hit,
                                'edgeIds': [*edge_ids, edge_id],
                                'steps': [*steps, walk_step(x, edge['runUpStart']['x'], node), public_edge(edge)]}
        return {**target, 'reachable': False, 'edgeIds': [], 'steps': []}

    def target_route(target):
        if target.get('clear') is False:
            return {**target, 'reachable': False, 'edgeIds': [], 'steps': []}
        if gate_rects and target['kind'] in ('coin', 'chest'):
            return reward_route(target)
        for surface in surfaces:
            hit = standing_hit(target, surface, p)
            if surface.id in parents and hit:
                path = node_path(surface.id)
                return {**target, 'reachable': True, 'surface': surface.id, 'hit': hit, 'edgeIds': path,
                        'steps': path_steps(path, target, hit) + ([{'kind': 'interact', 'target': hit, 'objective': target['id']}] if target['kind'] == 'chest' else [])}
        if target['kind'] not in ('switch', 'chest'):
            for edge in edges:
                if edge['from'] in parents:
                    hit = next(({'x': x, 'y': y, 'time': t} for x, y, t in edge['_samples'] if target_hit(target, x, y, p)), None)
                    if hit:
                        path = node_path(edge['from']) + [edge['id']]
                        return {**target, 'reachable': True, 'surface': edge['to'], 'hit': hit, 'edgeIds': path,
                                'steps': path_steps(path)}
        return {**target, 'reachable': False, 'edgeIds': [], 'steps': []}

    routes = {'goal': target_route(goal), 'shards': [target_route(t) for t in shards],
              'checkpoints': [target_route(t) for t in checkpoints], 'switches': [target_route(t) for t in switches],
              'coins': [target_route(t) for t in coins], 'chests': [target_route(t) for t in chests]}
    labelled = [(routes['goal'], '终点')]
    for name, label in (('shards', '碎片'), ('checkpoints', '检查点'), ('switches', '开关'), ('coins', '金币'), ('chests', '宝箱')):
        labelled += [(r, f"{label} {r['id']}") for r in routes[name]]
    errors += [f'{label} 不可达' for route, label in labelled if not route['reachable']]
    node_masks = {s.id: sum(1 << i for i, t in enumerate(required) if standing_hit(t, s, p)) for s in surfaces}
    edge_masks = {e['id']: sum(1 << i for i, t in enumerate(required) if t['kind'] == 'shard'
                               and any(target_hit(t, x, y, p) for x, y, _ in e['_samples'])) for e in edges}
    start = (spawn_surface, acquire(0, node_masks.get(spawn_surface, 0)))
    states, final_state = ({start: None} if spawn_surface is not None else {}), None
    queue = deque(states)
    while queue:
        node, mask = queue.popleft()
        if mask == (1 << len(required)) - 1 and standing_hit(goal, surfaces[node], p):
            final_state = node, mask
            break
        for edge_id in adjacency[node]:
            e = edges[edge_id]
            next_state = e['to'], acquire(mask | edge_masks[edge_id], node_masks[e['to']])
            if next_state not in states:
                states[next_state] = ((node, mask), edge_id)
                queue.append(next_state)
    path = []
    if final_state is not None:
        cursor = final_state
        while states[cursor] is not None:
            previous, edge_id = states[cursor]
            path.append(edge_id)
            cursor = previous
        path.reverse()
        routes['main'] = {'reachable': True, 'edgeIds': path, 'required': [t['id'] for t in required],
                          'steps': path_steps(path, goal, standing_hit(goal, surfaces[final_state[0]], p), True)}
    else:
        routes['main'] = {'reachable': False, 'edgeIds': [], 'steps': [], 'required': [t['id'] for t in required]}
        errors.append('不存在收集全部碎片、按序访问全部开关后抵达终点的连续安全路线')
    gates = []
    for obj in g.mechanisms:
        if object_kind(obj) == 'gate':
            group = properties(obj).get('group', '')
            gates.append({'id': obj.get('name', ''), 'bounds': rect_of(obj), 'group': group,
                          'switches': [t['id'] for t in switches if t['properties'].get('group', '') == group]})
    return {'id': level_id, 'ok': not errors, 'errors': errors,
            'spawn': {'sprite': {'x': sx, 'y': sy}, 'foot': {'x': sx, 'y': spawn_foot}, 'surface': spawn_surface},
            'surfaces': [asdict(s) for s in surfaces], 'edges': [public_edge(e) for e in edges],
            'reachableSurfaces': sorted(parents), 'routes': routes,
            'mechanisms': {'gates': gates, 'gateStateMode': 'reward_routes_checked',
                           'crumble': [{'id': o.get('name', ''), 'bounds': rect_of(o),
                                        'note': '静态顶面；坍塌计时与快速通过须浏览器验证'} for o in g.crumble]},
            'limitations': ['静态几何不包含敌人、战斗伤害和机关计时',
                            '奖励路线按关闭门体积和有序开关校验；主路线机关时序仍须实测',
                            '连续加速模型近似实际逐帧输入，须浏览器验证窄边缘和落地']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('levels', nargs='*', help='关卡 id；缺省审计全部实际 JSON')
    parser.add_argument('--json', nargs='?', const='-', dest='json_path', metavar='PATH')
    args, p = parser.parse_args(argv), load_physics()
    paths = [ROOT / 'public/assets/levels' / f'{level}.json' for level in args.levels]
    paths = paths or sorted((ROOT / 'public/assets/levels').glob('*.json'))
    reports = []
    for path in paths:
        try:
            report = audit_map(json.loads(path.read_text(encoding='utf-8-sig')), path.stem, p)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            report = {'id': path.stem, 'ok': False, 'errors': [str(exc)]}
        reports.append(report)
    result = {'schemaVersion': 1, 'physics': asdict(p), 'levels': reports, 'ok': bool(reports) and all(r['ok'] for r in reports)}
    if args.json_path:
        encoded = json.dumps(result, ensure_ascii=False, indent=2)
        if args.json_path == '-':
            print(encoded)
        else:
            Path(args.json_path).write_text(encoded, encoding='utf-8')
    if args.json_path != '-':
        print(f'movement: jump={p.jumpVelocity:g}, gravity={p.gravity:g}, walk={p.walkSpeed:g}, height={p.jumpVelocity ** 2 / (2 * p.gravity):.1f}px')
        for report in reports:
            if report['ok']:
                print(f"{report['id']}: 通过；可达表面 {len(report['reachableSurfaces'])}/{len(report['surfaces'])}，主路线 {len(report['routes']['main']['edgeIds'])} 次跳跃/落体")
            else:
                for error in report['errors']:
                    print(f"{report['id']}: {error}")
        print('violations:', sum(len(r['errors']) for r in reports))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
