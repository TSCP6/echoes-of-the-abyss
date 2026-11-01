# 代码结构整理实施计划

目标：按用户已确认方案归类目录、分离测试，并有限拆分 LevelScene、EnemyAI 与 UiLayer；保持玩法、数值、帧顺序、事件及存档兼容行为。

设计依据：本聊天已确认的目录方案。data 保持集中；domain 按 combat/player/progression/economy/persistence/shared 分类；systems 按 player/enemies/boss/combat/world/presentation/flow 分类；ui 按 views/panels/components/composables/presentation 分类。测试对应迁入 tests，工具按地图、素材及浏览器专题归类。不新增依赖或通用框架。

## 执行顺序

- [x] 记录原始测试基线，用映射脚本迁移源文件和测试，并统一修改静态/动态引用及 Vitest 发现配置。
- [x] 工具迁入 tools/maps、tools/assets、tools/browser 专题目录；地图审计测试迁入 tests/tools，核实工作目录、资源定位、入口命令和浏览器加载路径。
- [x] EnemyEntity 与 EnemyAI 集合分离，共用契约放 enemyTypes，Boss 行为移至 bossBehavior，保持所有对外调用与状态语义。
- [x] UiLayer 的存档操作与面板导航提取为 composables，保留场景就绪、胜利及生命周期协调。
- [x] LevelScene 技能执行移至 playerSkillExecutor，通关奖励/纪录/数据组装移至 levelSettlement；场景保留死亡重生、物理暂停、事件与切场景顺序。
- [x] 运行单测、Python 工具回归、类型检查、生产构建及隔离浏览器检查；修复路径和行为回归。
- [x] 更新代码导读、符号索引、旧新路径对照、项目索引和当前开发命令；审查差异，只提交本任务文件，不推送。

## 验证标准

原有测试语义不因迁移改变；源目录没有测试文件；各目录职责明确；新旧源码模块与工具路径均有可追溯映射；存档不清空、地图和素材不重建。浏览器重点检查启动、菜单、背包/技能、存档、战斗与切关；测试存储隔离。
