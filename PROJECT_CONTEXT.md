# PROJECT_CONTEXT.md —— 《深渊回响》(SEAPP) 开发上下文

> 更新时点：提交 `f0c576a` 之后（M4 收尾 + 手感方案 C 完成）。
> 面向：后续会话/接手者。基线文档：`docs/需求分析文档.md`(SRS v1.0)、`docs/设计文档.md`(SDD v1.0)、
> `docs/M4验收记录.md`（AT-52~75 实测）、`docs/素材许可清单.md`（CC0 登记）。
> 2026-10-26 画幅调整：采用 `Scale.EXPAND` 等比铺满窗口；共享布局见 `systems/viewportLayout.ts`。
> 2026-10-26 修复：P1-01~04 均已提交；本轮剩余问题及新增缺陷详见 `docs/剩余问题修复记录.md`。最终单测 150/150，类型检查和生产构建通过；浏览器 53 项检查及 20 次切关回归通过。
> 2026-10-27 Boss 锁场调整：三个 Boss 地图用 `boss_arena` 对象统一驱动平滑取景与左右物理封锁；击败、重试和切关时解除。实现见 `systems/bossArena.ts`，原因与验证见 `docs/Boss战场镜头与边界修复.md`。
> 2026-10-27 1-1 手工地图修复：保留用户布局，为四个瓦片层补齐 CSV 编码声明，并为新增 GID 29/30/31 补齐 solid；见 `docs/1-1手工地图加载修复.md`。

## 1. 项目概述

- 产品：桌面浏览器单人 2D 横版平台跳跃动作游戏，12 关 + 3 Boss，纯前端无服务端。
- 技术栈：Phaser 4.0.0 + Vue 3.5 + TypeScript 5.7（strict）+ Vite 6；Vitest 单测； Arcade Physics。
- 1024×768 为最小逻辑视野，`Scale.EXPAND` 等比铺满浏览器，宽屏扩展水平视野、窄长窗口扩展垂直视野；瓦片 32px；地图为 Tiled 兼容 CSV JSON（`public/assets/levels/*.json`）。
- 里程碑：M1~M4 全部完成并提交；M4 自动化验收项全过，剩 4 组人工项（见 §6）。

## 2. 仓库结构与职责

```
src/game/
  main.ts                 GameConfig；★世界重力读 PLAYER_DEFAULTS.gravity（单一数值源，main.ts:24）
  events.ts / EventBus.ts DR-04 十二事件类型化门面（emitEvent/onEvent/offEvent）；禁止事件发命令
  data/                   ★数值配置表（DR-01）：playerDefaults / enemies / weapons / skills /
                          items / goods / lootTables / levels。改数值只改这里（±20% 内免改校验）
  domain/                 领域层（Node 可测，不碰 Phaser 值导入）：
    configRegistry.ts     ★启动校验闸 validateAll()；玩家运动数值为基线 ±20% 容差（309~320 行）
    saveSystem.ts         双键写入/checksum/迁移/EX-01 内存模式/EX-02 备份；参与者注册见 saveBootstrap.ts
    resourceSystem / economyService / skillService / weaponService / shopService /
    recordStore / settingsStore / progressService / hudViewModel / devProbe(DEV 探针)
  systems/                呈现/物理层：
    playerController.ts   移动跳跃状态机（土狼/缓冲/可变跳高）；update 守卫（sprite.body/场景活动，~104 行）
    levelLoader.ts        Tiled JSON → LevelContext + 进关校验；onewayProcess 委托 onewaySeparation
    onewaySeparation.ts   ★单向平台扫掠分离纯函数（prevBottom <= top+2；含单测 levelLoader.test.ts）
    enemyAI.ts            4 brain（patrol/chaser/flyer/boss 三阶段+DD-06 技能循环）
    combatResolver.ts     命中/击退/i-frame/areaDamage；钩子 onAttackBegan/onEnemyHit
    cameraRig.ts          插值跟随/沉降/lockTo/shake（震屏开关旁路）
    pickupSystem.ts       金币三阶段/检查点/碎片/宝箱/hints 触发区；钩子 onCoinPicked/onChestOpened
    audioDirector.ts      MOD-08：50ms 合并/0.8s 交叉淡化(tick 驱动)/Boss 变体/三路音量/EX-08 挂起队列
    tutorialDirector.ts   MOD-09：队列模型（入队→队首显示→动作钩子完成→8s 超时消费→5/5 入存档）
    sceneDirector.ts      ★MOD-11：fadeTo(DOM setTimeout 定时 + rAF 轮询目标 active 收尾) +
                          单槽 pending 排队（防连点不吞点击）；gotoLevel/gotoMenu/gotoCamp
    worldFxLayer.ts / projectilePool.ts / inputGateway.ts / tutorialDirector / audioDirector
  scenes/                 Boot(attachGame+AppLifecycle) / Preloader(校验→加载→读档；EX-03 loaderror UI) /
                          Menu / Level(ARCH-13 十阶段管线 + ready 闸 + TT-06 打点 + EX-11 救援) / Camp
  adapters/               audioAdapter(手势 unlock/EX-05) / fullscreenAdapter(IF-X03) /
                          appLifecycle(EX-04/05/07 + EXD-4 全局兜底) / storageAdapter
src/ui/                   Vue DOM UI：UiLayer(状态机+导航+音频解锁) / HudOverlay(画布锚定 rAF 双通道) /
                          MainMenu/LevelSelect/Pause/Result/Inventory/Shop/SkillTree/Settings/Records/
                          Help/TutorialHints；i18n.ts 文案；tokens.css 设计令牌
tools/
  gen_levels.py           ★12 关生成器 → public/assets/levels/*.json（Tiled 兼容）
  audit_reach.py          ★BFS 可达性审计（节点=地面+平台；边=弹道跳跃/步行；GOAL 可达断言）
  extract_art.py          CC0 美术抽取（源包在 tools/source-packs/）
  kenney-source/          Kenney 音频源包 zip（CC0 归档）
public/assets/            art/ audio/(ogg+m4a 双格式) gen/(程序化纹理) levels/ bg.png
docs/                     SRS / SDD / M4验收记录 / 素材许可清单 / AI协作记录 / 人工核实说明
```

## 3. 已完成工作（提交线）

| 提交                    | 内容                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| e16c279/116a64c/9516f71 | P1：地图管线、1-1 全流程可玩                                                          |
| (P2)                    | 战斗与成长：近战/远程、敌人 AI、掉落、背包                                            |
| 473984d                 | P3：12 关/Boss 三阶段/技能树/商店/营地/双键存档                                       |
| a18ebbe                 | P4：CC0 素材+许可清单；AudioDirector/三个适配层/教学/震屏/粒子/挥击死亡动画           |
| 7173de9                 | M4-fix：场景切换稳定性、EX-03、构建瘦身（2.87MB / gzip 401KB）、saveSystem 覆盖 84.3% |
| 43d3895                 | M4-feat：字号 ≥14px、HUD 画布锚定、EX-11、TT-06 打点                                  |
| 2a6cf0f                 | docs：M4 验收记录                                                                     |
| e19a377                 | 结算页重试竞态根治 + AT-64 闭环                                                       |
| f0c576a                 | ★手感方案 C + oneway 扫掠分离 + 全关可达性审计                                        |

验收状态：AT-01~51（P1~P3 冒烟）、AT-52~75 中可自动化项全过（见 M4验收记录）；88 单测绿；vue-tsc 零错误。

## 4. 关键技术决策

1. **数值单一源**：`data/playerDefaults.ts` 为权威；`main.ts` 世界重力读它；`configRegistry` 以 SRS 附录 A 基线 ±20% 容差校验（实现期调整合法区间）。当前值：gravity **1040**（−20.0%）、jumpVelocity **560**（+16.7%）→ 跳高 ≈151px（4 格台阶）、reach ≈7 格、walkSpeed 210。
2. **oneway 扫掠分离**：`bottom - deltaY() <= tileTop + 2` 才分离。旧容差模型在帧穿透 >4px 时穿透平台（用户报"跳不上平台"真因之一）；纯函数化 + 3 单测。
3. **场景切换**：fadeTo 用 DOM `setTimeout`（源场景 pause/shutdown 不丢定时器）+ rAF 轮询目标进入 active 列表收尾；切换期新请求入单槽 pending（覆盖旧意图），目标 active 后消费。曾两次吞点击/静默丢弃的根因均已根治（6/6 回归）。
4. **HUD 双通道**：文本 ≤10Hz 事件；条形/扇形/Boss 血条经 HudOverlay 单一 rAF 直写 CSS（scaleX/conic-gradient），且 HUD 根节点每帧锚定 canvas 矩形（Scale.FIT 黑边不承载 HUD）。
5. **音频**：双格式 ogg+m4a（Safari ≥17 不解 Vorbis）；交叉淡化 tick 驱动（场景停止不中断）；未解锁挂起队列解锁后冲刷；destroyed sound 的 `volume` getter 会触 `volumeNode.gain` 空引用 → `safeVolume`/tick 守卫。
6. **教学**：队列模型（FR-17"按顺序"）；完成钩子链式保留（音效等先注册者不被覆盖）。
7. **地图管线**：代码生成 Tiled 兼容 JSON（DEC-7）；Tiled 可直接打开编辑保存；`audit_reach.py` 作为改图后的可达性门禁（当前 12 关 0 违规）。
8. **EXD-4 兜底**：window error/unhandledrejection/Vue errorHandler → console + 横幅 + gotoMenu（1 分钟去重）。场景切换期残留 update 经 ready 闸/body 守卫防未捕获异常。

## 5. 调参/改图操作手册

- 手感：改 `src/game/data/playerDefaults.ts`（±20% 内无需动校验）；重力只改这一处。
- 敌人/Boss：`src/game/data/enemies.ts`（校验仅 kind 枚举/id 前缀/Boss 技能 damage 5~30、cooldown 0.5~8）。
- 地图：Tiled 打开 `public/assets/levels/<id>.json` 保存；或改 `tools/gen_levels.py` 后
  `python tools/gen_levels.py [id]` + `python tools/audit_reach.py`（必须 0 违规）。
  图层/对象命名规则见 levelLoader 校验：player_spawn 恰 1、goal 恰 1、cp_N（常规 ≥2）、碎片恰 3 唯一、
  敌人对象名 ∈ EnemyDef、hints 属性 action。
- 命令：`npm run dev-nolog`（dev，勿用 `dev`——log.js 外发遥测）；`npm run build-nolog`；
  `npx vue-tsc --noEmit`；`npx vitest run [--coverage]`。

## 6. 当前问题与未决事项（勿遗漏）

**人工验收（todo blocked，清单见 docs/M4验收记录.md §四）**

1. AT-60/AT-72：3 名未接触测试者 5 分钟通关 1-1 + 求助次数（需真人）。
2. AT-69：2h 长稳 + ≥20 次切关堆快照（TT-08 已给无累积代理证据）。
3. AT-71：Firefox/Safari/Edge × 3 视口 + 禁用 WebGL 目视兼容模式提示。
4. AT-63/AT-66：真机全屏开关；真机 10min Performance 录制（headed 自动化采样：空闲 p50 16.7/p95 17.2ms、>33.3ms 0.8%；输入注入期尖峰为 harness 开销）。

**环境/工具链陷阱（后续会话必读）** 5. 端口 8086 已被用户机器上的 CEF/Steam 远程调试端点占用（`curl :8086` 返回 "CEF remote debugging" 页）；dev 服务请用其他端口：`npx vite --config vite/config.dev.mjs --port <新>`（**必须带 config**，否则 .vue 解析 500）。会话内曾以 8084 后台 job 运行，可能已死，按需重启。6. 浏览器自动化伪影（非游戏 bug）：隐藏/被遮挡标签页 rAF 冻结（headed 多标签会 occlusion 冻结；headless 空闲也可能塌缩）→ 测量需页内 rAF 探针 + 等待期 keepalive ping；`tab.keyDown` 的 JustDown 采样要求按键跨帧（press 太快读不到）；自动化注入输入期间的帧尖峰不代表游戏性能。7. 键盘链式台阶跳的"游戏内自动化验证"始终受上述伪影污染；oneway/跳高的可靠证据 = 落体穿透测试（200/400px 落体停 top=736）+ onewaySeparation 单测 + 页内 vy 轨迹（oneway 上起跳初速 -560 正常）。**手感最终确认需用户真人试玩**。8. WSL 壳内 `npm` 受 localhost 代理配置损坏（supervised service 启动失败）；后台服务用 async bash job（Windows 壳）启动。9. 覆盖率整体 58.5%（NFR-08 只要求核心数值模块 ≥80%：damageCalculator/checksum 100%、economy 87.2%、saveSystem 84.3%——已满足）；若课程要求整体覆盖率需补 UI/系统层测试。

**已知设计边界（非缺陷）** 10. SceneDirector pending 为单槽（连点取最后意图）；EX-12 由架构满足（Boss 进度不入存档）。11. `tools/source-packs/`、`tools/kenney-source/` 仅溯源不随构建分发；构建产物只引用 art/audio/gen/levels。

## 7. 重要代码位置速查

| 位置                                                 | 内容                                            |
| ---------------------------------------------------- | ----------------------------------------------- |
| src/game/data/playerDefaults.ts:14-24                | 玩家物理数值（gravity/jumpVelocity/walkSpeed…） |
| src/game/main.ts:24                                  | Arcade 世界重力（读配置）                       |
| src/game/domain/configRegistry.ts:309-322            | ±20% 容差校验（within20）                       |
| src/game/systems/onewaySeparation.ts                 | 单向平台扫掠判定                                |
| src/game/systems/levelLoader.ts:150-153              | onewayProcess 委托点                            |
| src/game/systems/playerController.ts:104-107,150-166 | update 守卫 / 起跳与可变跳高                    |
| src/game/scenes/LevelScene.ts:57-94,354-470          | ready 闸/EX-11/TT-06；十阶段管线                |
| src/game/systems/sceneDirector.ts:35-77              | fadeTo/awaitTarget/request(pending)             |
| src/game/systems/audioDirector.ts:86-108,136-174     | tick 淡化/safeVolume/playBgm                    |
| src/game/systems/tutorialDirector.ts                 | 教学队列模型                                    |
| src/ui/HudOverlay.vue:43-54                          | 画布锚定 rAF                                    |
| src/ui/UiLayer.vue:178-186                           | 手势解锁 AudioContext                           |
| tools/gen_levels.py / tools/audit_reach.py           | 地图生成 / 可达性门禁                           |
| docs/M4验收记录.md                                   | AT 实测证据与人工项清单                         |
