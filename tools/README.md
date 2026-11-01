# 开发工具

以下命令在仓库根目录运行。工具按用途拆分；旧根目录脚本入口已迁移，不保留兼容壳。

| 目录 | 用途 |
| --- | --- |
| `maps/` | 地图生成、公共构造模型、十二关布局、实际 JSON 可达性审计及 1-1 手工基线 |
| `assets/` | 图片与音频预处理、敌人美术帧校验 |
| `browser/combat/` | 玩家攻击、敌人表现与行为、Boss 战斗检查 |
| `browser/progression/` | 商店、经济存档、重玩、奖励与胜利检查 |
| `browser/ui/` | 输入映射、面板、HUD、提示与音频检查 |
| `browser/world/` | 平台与拾取、重生、场景生命周期、机关与路线检查 |
| `../tests/tools/` | Python 工具回归测试 |

`source-packs/`、`kenney-source/` 保持原位置，是本地源素材输入；不得将受限原包加入公开分发。

## 地图与回归测试

```powershell
python -X utf8 -m unittest discover -s tests/tools
python -X utf8 tools/maps/audit_reach.py
python -X utf8 tools/maps/audit_reach.py 2-3 --json output/world-audit-rewards.json
python -X utf8 tools/maps/gen_levels.py 2-1
```

审计读取 `public/assets/levels/` 的实际地图及 `src/game/data/playerDefaults.ts` 的运动配置，不会重建地图。省略 `--json` 时仅输出结果；指定报告文件时先确保父目录存在。

生成器必须显式指定一个或多个关卡 ID。执行前对比目标 JSON 和生成逻辑，保留 Tiled 手工修改；`maps/1-1-authored.json` 是 1-1 手工基线。不要为了验证路径迁移而运行重建命令。地图修改后仍须在浏览器试玩。

测试通过 `tools.maps` 命名空间导入工具；生成器同时支持 `python -X utf8 -m tools.maps.gen_levels <level_id>`。

## 素材处理

```powershell
python -X utf8 tools/assets/check_enemy_art.py
python -X utf8 tools/assets/build_assets.py
python -X utf8 tools/assets/extract_art.py
python -X utf8 tools/assets/prepare_region_art.py
python -X utf8 tools/assets/prepare_enemy_art.py <golem.zip>
python -X utf8 tools/assets/prepare_normal_enemy_art.py <sunny-land-files.zip>
python -X utf8 tools/assets/prepare_remaining_boss_art.py <spider.zip> <executioner.zip>
python -X utf8 tools/assets/prepare_game_audio.py --check
python -X utf8 tools/assets/prepare_game_audio.py
```

图片工具需要 Pillow；音频工具需要 numpy 和 FFmpeg（PATH、`--ffmpeg <路径>` 或 `imageio_ffmpeg`）。`check_enemy_art.py` 和音频的 `--check` 只做校验，其余处理命令会写入资源。音频重建默认复用 `output/audio-source/` 的输入，明确需要下载时才加 `--download`。各工具从自身文件位置确定仓库根目录，源包继续从 `tools/source-packs/`、`tools/kenney-source/` 读取。

## 浏览器检查

先使用 `npm.cmd run dev-nolog` 启动开发服务；端口占用时传 `-- --port <端口>`，以终端实际地址为准。浏览器脚本是由 Playwright 调用的检查函数，并非直接执行的 CLI。仓库未新增 Playwright 依赖；使用已有测试环境提供的 Playwright 和 Chrome，并在每次调用时传入实际地址。动态 `/src/` 模块地址依赖 Vite 开发服务。

已有导出的脚本可直接导入，示例（在具备 Playwright 的 Node ESM 环境执行）：

```javascript
import { chromium } from 'playwright';
import { checkLevelSelectTooltip } from './tools/browser/ui/level_select_tooltip.check.mjs';
const result = await checkLevelSelectTooltip(chromium, 'http://127.0.0.1:8123');
console.log(JSON.stringify(result, null, 2));
```

部分历史脚本保留顶层函数调用方式，没有 ES module 导出；可读取后提取函数，例如：

```javascript
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const source = await readFile('tools/browser/combat/boss_arena.check.mjs', 'utf8');
const checkBossArena = new Function(source + '\nreturn checkBossArena;')();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage();
    const result = await checkBossArena(page, { url: 'http://127.0.0.1:8123' });
    console.log(JSON.stringify(result, null, 2));
} finally {
    await browser.close();
}
```

各脚本首行函数签名保留原调用方式：首参数可能是 `chromium`、`browser` 或 `page`，地址参数可能是字符串或选项对象；奖励路线还需要传入审计报告。调用前查看对应签名，不要仅执行 `node <文件>` 并把无输出误认为检查通过。使用隔离浏览器上下文，不连接真实用户存档；结束后关闭浏览器。检查返回的 `cases`、`errors` 和 `passed`（部分脚本为通过数量），并留意隐藏页暂停与短按键未采样的自动化影响。
