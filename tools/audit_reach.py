"""关卡可达性审计（BFS 连通性）：节点=地面段+oneway 平台，边=跳跃/步行。
跳跃模型：rise 取下降支到目标高度时刻 × walkSpeed；ascent 须 ≤ 跳高-8px；边间距须 ≤ reach-24px。
步行边：两地面段之间无深渊且水平相邻/重叠。落地边：平台→下方地面（descent reach）。
用法：python tools/audit_reach.py；退出码 1 = 存在不可达节点或终点断开。"""
import ast, math, sys, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULTS = (ROOT / 'src/game/data/playerDefaults.ts').read_text(encoding='utf-8')

def movement_value(name: str) -> float:
    match = re.search(r'\b' + re.escape(name) + r'\s*:\s*(\d+(?:\.\d+)?)', DEFAULTS)
    if match is None:
        raise ValueError(f'playerDefaults 中缺少数值字段: {name}')
    return float(match.group(1))

V, G, WALK = (movement_value(name) for name in ('jumpVelocity', 'gravity', 'walkSpeed'))
H = V * V / (2 * G)
MARGIN = 24.0

def reach_px(dy_px: float) -> float:
    disc = V * V - 2 * G * dy_px
    if disc < 0:
        return -1.0
    return ((V + math.sqrt(disc)) / G) * WALK

def edge_gap_px(a, b) -> float:
    if b[0] > a[2]:
        return (b[0] - a[2] - 1) * 32
    if a[0] > b[2]:
        return (a[0] - b[2] - 1) * 32
    return 0.0

def jump_ok(a, b) -> bool:
    dy = (a[1] - b[1]) * 32  # 正 = b 更高
    if dy > H - 8:
        return False
    return edge_gap_px(a, b) <= reach_px(dy) - MARGIN

def main() -> int:
    src = (ROOT / 'tools/gen_levels.py').read_text(encoding='utf-8')
    tree = ast.parse(src)
    bad = 0
    for node in ast.walk(tree):
        if not (isinstance(node, ast.FunctionDef) and node.name.startswith('build_')):
            continue
        grounds, plats, pits, spawn, goal = [], [], [], None, None
        for c in ast.walk(node):
            if not isinstance(c, ast.Call):
                continue
            fn = getattr(c.func, 'attr', '')
            a = [ast.literal_eval(x) for x in c.args]
            if fn == 'solid_rect' and a[1] >= 25:
                grounds.append((a[0], a[1], a[2]))
            elif fn == 'oneway_rect':
                plats.append((a[0], a[1], a[2]))
            elif fn == 'death_plane':
                pits.append((a[0], a[2]))
            elif fn == 'spawn':
                spawn = a[0]
            elif fn == 'goal':
                goal = a[0]
        nodes = [('G', g) for g in grounds] + [('P', p) for p in plats]
        def in_pit(x0, x1):
            return any(p0 <= x0 and x1 <= p1 + 0 for p0, p1 in pits) or any(p0 < x1 and x0 < p1 for p0, p1 in pits)
        adj = {i: [] for i in range(len(nodes))}
        for i, (ti, a) in enumerate(nodes):
            for j, (tj, b) in enumerate(nodes):
                if i == j:
                    continue
                if ti == 'G' and tj == 'G' and edge_gap_px(a, b) <= 0:
                    lo, hi = min(a[2], b[2]) + 1, max(a[0], b[0]) - 1
                    if hi < lo or not in_pit(lo, hi):
                        adj[i].append(j)  # 步行边：水平相邻且中间无深渊
                elif jump_ok(a, b):
                    adj[i].append(j)  # 跳跃边（含跨渊地面段）
        def node_at(x):
            for i, (t, n) in enumerate(nodes):
                if n[0] <= x <= n[2]:
                    return i
            return None
        s, g = node_at(spawn), node_at(goal)
        seen, stack = set(), [s]
        while stack:
            cur = stack.pop()
            if cur in seen or cur is None:
                continue
            seen.add(cur)
            stack.extend(adj[cur])
        unreach = [nodes[i] for i in range(len(nodes)) if i not in seen]
        if g not in seen:
            print(f'{node.name}: GOAL 不可达 (spawn node {s})'); bad += 1
        for u in unreach:
            print(f'{node.name}: 不可达节点 {u}')
            bad += 1
    print(f'movement: jump={V:g}, gravity={G:g}, walk={WALK:g}, height={H:.1f}px')
    print('violations:', bad)
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
