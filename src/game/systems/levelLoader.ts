/**
 * MOD-05 LevelLoader（Phaser 呈现层，IF-M14 / DD-04）—— DR-03 地图 → 可游玩内容 + 进关校验。
 * load(levelId)：tilemapTiledJSON 解析 → 图层映射（7.2.2）→ validate() → Result<LevelContext>。
 * 校验清单（DR-03 加载校验，任一失败中止进关，EX-03）：
 * player_spawn 恰 1；goal 恰 1；checkpoints 常规 ≥2 / Boss ≥1；shards 恰 3 且唯一；
 * enemies 对象名 ∈ EnemyDef；tilewidth/tileheight=32、orientation=orthogonal、encoding=csv。
 * 单向平台：oneway 层全瓦片碰撞 + collider processCallback（body.vy>0 且 bottom ≤ tileTop+4 才分离，7.2.2 容差 4px）。
 */
import { Geom, Physics, Tilemaps, type Scene } from 'phaser';
import type { Result } from '../domain/result';
import { ok, fail } from '../domain/result';
import { ConfigRegistry } from '../domain/configRegistry';

export interface LevelContext {
    levelId: string;
    spawn: { x: number; y: number };
    collisionGroup: Tilemaps.TilemapLayer | Tilemaps.TilemapGPULayer;
    onewayGroup: Tilemaps.TilemapLayer | Tilemaps.TilemapGPULayer;
    decorBack: Tilemaps.TilemapLayer | Tilemaps.TilemapGPULayer | null;
    decorFront: Tilemaps.TilemapLayer | Tilemaps.TilemapGPULayer | null;
    checkpoints: Array<{ id: string; x: number; y: number }>;
    shards: Array<{ id: string; x: number; y: number }>;
    enemySpawns: Array<{ defId: string; x: number; y: number }>;
    coinClusters: Array<{ x: number; y: number; count: number }>;
    chests: Array<{ id: string; x: number; y: number }>;
    hazards: Geom.Rectangle[];
    goal: Geom.Rectangle;
    hints: Array<{ id: string; action: string; x: number; y: number; w: number; h: number }>;
    bossArena: Geom.Rectangle | null;
    bossId: string | null;
    bgmId: string;
    mapWidth: number;
    mapHeight: number;
}

const ONEWAY_TOLERANCE = 4; // 7.2.2 设计参数：防高速穿透

export class LevelLoader {
    constructor(private scene: Scene) {}

    load(levelId: string): Result<LevelContext, 'MAP_INVALID' | 'ASSET_MISSING' | 'LEVEL_NOT_FOUND'> {
        const def = ConfigRegistry.levels().find((l) => l.id === levelId);
        if (def === undefined) {
            return fail('LEVEL_NOT_FOUND', `关卡不存在：${levelId}`);
        }
        const cacheKey = `map_${levelId}`;
        // Phaser 4 的 tilemapTiledJSON 存入 cache.tilemap，值为 { format, data } 包装
        const stored = this.scene.cache.tilemap.get(cacheKey) as { format: number; data: Record<string, unknown> } | undefined;
        const raw = stored?.data;
        if (raw === undefined) {
            return fail('ASSET_MISSING', `地图资源未加载：${levelId}`);
        }

        // ---- DR-03 结构校验（原始 JSON）----
        const errors: string[] = [];
        if (raw.orientation !== 'orthogonal') { errors.push(`orientation=${String(raw.orientation)}（须 orthogonal）`); }
        if (raw.tilewidth !== 32 || raw.tileheight !== 32) { errors.push(`tile=${String(raw.tilewidth)}x${String(raw.tileheight)}（须 32x32）`); }
        const layers = (raw.layers ?? []) as Array<Record<string, unknown>>;
        for (const layer of layers) {
            if (layer.type === 'tilelayer' && layer.encoding !== 'csv') {
                errors.push(`图层 ${String(layer.name)} encoding=${String(layer.encoding)}（须 csv）`);
            }
        }

        const map = this.scene.add.tilemap(cacheKey);
        const tileset = map.addTilesetImage('terrain', 'terrain32');
        if (tileset === null) {
            return fail('ASSET_MISSING', `瓦片集纹理缺失：terrain32（关卡 ${levelId}）`);
        }
        const decorBack = map.createLayer('decor_back', tileset) ?? null;
        const collisionLayer = map.createLayer('collision', tileset);
        const onewayLayer = map.createLayer('oneway', tileset);
        const decorFront = map.createLayer('decor_front', tileset) ?? null;
        if (collisionLayer === null || onewayLayer === null) {
            errors.push('缺少 collision/oneway 瓦片层');
        } else {
            collisionLayer.setCollisionByProperty({ solid: true });
            onewayLayer.setCollisionBetween(1, map.tilesets[0]?.total ?? 242);
        }
        decorBack?.setDepth(-10);
        decorFront?.setDepth(20);

        // ---- 对象层提取 ----
        const group = (name: string): Phaser.Types.Tilemaps.TiledObject[] =>
            (map.objects.find((o) => o.name === name)?.objects ?? []);
        const prop = (o: Phaser.Types.Tilemaps.TiledObject, key: string): string => {
            const list = (o.properties ?? []) as Array<{ name: string; value: unknown }>;
            const hit = list.find((p) => p.name === key);
            return hit === undefined ? '' : String(hit.value);
        };

        const spawns = group('spawn').filter((o) => o.name === 'player_spawn');
        if (spawns.length !== 1) { errors.push(`player_spawn 数量=${spawns.length}（须恰 1）`); }
        const goals = group('goal').filter((o) => o.name === 'goal');
        if (goals.length !== 1) { errors.push(`goal 数量=${goals.length}（须恰 1）`); }
        const checkpoints = group('checkpoints').map((o) => ({ id: o.name ?? '', x: (o.x ?? 0), y: (o.y ?? 0) }));
        const minCp = def.isBossLevel ? 1 : 2;
        if (checkpoints.length < minCp) { errors.push(`checkpoints=${checkpoints.length}（${def.isBossLevel ? 'Boss' : '常规'}关须 ≥${minCp}）`); }
        const shards = group('shards').map((o) => ({ id: o.name ?? '', x: (o.x ?? 0), y: (o.y ?? 0) }));
        if (shards.length !== 3) { errors.push(`shards=${shards.length}（须恰 3）`); }
        if (new Set(shards.map((s) => s.id)).size !== shards.length) { errors.push('shards id 关卡内重复'); }
        const enemyNames = new Set(Object.keys(ConfigRegistry.enemies()));
        const enemySpawns = group('enemies').map((o) => ({ defId: o.name ?? '', x: (o.x ?? 0), y: (o.y ?? 0) }));
        for (const e of enemySpawns) {
            if (!enemyNames.has(e.defId)) { errors.push(`敌人 id 不存在于 EnemyDef：${e.defId}`); }
        }
        const hazards = group('hazards')
            .filter((o) => o.type === 'death_plane')
            .map((o) => new Geom.Rectangle(o.x ?? 0, o.y ?? 0, o.width ?? 0, o.height ?? 0));
        const coinClusters = group('pickups')
            .filter((o) => (o.name ?? '').startsWith('coin_cluster_'))
            .map((o) => ({ x: o.x ?? 0, y: o.y ?? 0, count: Number(prop(o, 'count') || '1') }));
        const chests = group('pickups')
            .filter((o) => (o.name ?? '').startsWith('chest_'))
            .map((o) => ({ id: o.name ?? '', x: o.x ?? 0, y: o.y ?? 0 }));
        const hints = group('hints').map((o) => ({
            id: o.name ?? '', action: prop(o, 'action'),
            x: o.x ?? 0, y: o.y ?? 0, w: o.width ?? 0, h: o.height ?? 0
        }));

        if (errors.length > 0) {
            map.destroy();
            return fail('MAP_INVALID', `地图校验失败（${levelId}）：${errors.join('；')}`);
        }

        const spawnObj = spawns[0];
        const goalObj = goals[0];
        const ctx: LevelContext = {
            levelId,
            spawn: { x: (spawnObj.x ?? 0) + 16, y: (spawnObj.y ?? 0) + 16 },
            collisionGroup: collisionLayer as Tilemaps.TilemapLayer,
            onewayGroup: onewayLayer as Tilemaps.TilemapLayer,
            decorBack, decorFront,
            checkpoints, shards, enemySpawns, coinClusters, chests, hazards,
            goal: new Geom.Rectangle(goalObj.x ?? 0, goalObj.y ?? 0, goalObj.width ?? 64, goalObj.height ?? 96),
            hints,
            bossArena: null,
            bossId: def.bossId,
            bgmId: def.bgmId,
            mapWidth: map.widthInPixels,
            mapHeight: map.heightInPixels
        };
        return ok(ctx);
    }

    /**
     * 单向平台碰撞回调（7.2.2）：仅当玩家下落且底边在瓦片顶上方容差内才分离。
     * 注册方式：scene.physics.add.collider(player, ctx.onewayGroup, undefined, process)。
     */
    onewayProcess(body: Physics.Arcade.Body, tile: Tilemaps.Tile): boolean {
        if (body.velocity.y <= 0) { return false; }
        // 图层置于 (0,0)，tile.pixelY 即世界坐标顶边
        return body.bottom <= tile.pixelY + ONEWAY_TOLERANCE;
    }
}
