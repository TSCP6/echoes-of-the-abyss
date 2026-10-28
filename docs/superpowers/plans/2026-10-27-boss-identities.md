# 三个 Boss 独立技能实现计划

用户已认可本轮技能方案，授权实现并验证，不再重复确认设计。

- 石像守卫：裂地重锤、地面震波、岩甲冲撞；前摇明确、撞墙眩晕、收招反击。第一阶段学习重锤与震波；后两阶段加入冲撞，前摇保留0.8/0.7秒。
- 深渊蛛后：限时减速蛛网、可攻击蛛卵（最多两枚、孵化小蜘蛛最多三只）、锁定落点的吊顶俯袭。
- 回响之影：安全标记后换位、两横斩加慢重劈、固定位置延迟回响（最多一道待触发剑痕）。
- 保留当前血量、接触伤害5及玩家击退配置；招式只能依靠基础移动和跳跃躲避，不以特定解锁技能作为前提。

## 文件职责与执行顺序

1. 在 `domain/bossAbilities.ts` 建立不依赖 Phaser 的技能区域、蛛网、蛛卵和动作轨迹模型，先写范围、时序、数量上限、取消与重置测试。
2. 拆分数据与视觉工作：配置在 `data/enemies.ts` 和原类型、校验；视觉在新 `systems/bossAbilityFx.ts`，复用现有动画，预警与伤害直接读取同一模型快照。
3. `EnemyAI` 保留三阶段与锁场事件，补充施招开始接缝、参数化动作时长和撞墙收招；在施招过程中受击不能让招式计时与预警分离。
4. 新 `systems/bossAbilitySystem.ts` 负责领域模型与实际 Boss、玩家运动、伤害及孵化物连接；`CombatResolver` 增加可破坏对象接缝，使蛛卵能被近战、远程与范围技能攻击。
5. `LevelScene` 组装独立技能系统，三个 Boss 改用独立技能；历史通用处理保留兼容。在阶段转换、死亡重试、Boss死亡和退出时取消残留效果与减速。施招开始立即捕获目标，下一帧先结算敌方技能与接触伤害，再结算玩家近战、弹丸和排队的范围技能（K7）；敌人更新之后绘制本帧预警。
6. 逐项执行真实浏览器技能前摇、锁定目标、命中/躲避、蛛卵破坏/孵化、数量限制、换位/残影、暂停和重试回归；再从出生点完成三Boss战斗并触发结算。
7. 类型检查、有限并发全套单测、生产构建、美术帧校验和独立代码审查；更新需求调整记录后只提交本任务文件，不推送。

## 共享接口约定

新技能 kind：`guardianHammer`、`guardianStomp`、保留 `charge`；`spiderWeb`、`spiderEggs`、`spiderDrop`；`echoStep`、`echoDance`、`echoReplay`。

技能参数在既有 `params: Record<string, number>` 中提供 `windupSec`、`activeSec`、`recoverySec`、`reach` 等。独立模型快照使用普通矩形 `{x,y,width,height}`，所有时间为游戏内秒。

`BossAbilitySnapshot`：`now`、`zones`（id/kind/rect/startsAt/endsAt/damage/sourceId/direction）、`webs`（id/rect/expiresAt）、`eggs`（id/rect/hp/hpMax/hatchAt）、`motion`（x/y/alpha/facing）或null。

视觉接口 `BossAbilityFx.render(snapshot, boss)` / `clear()` / `destroy()`；角色技能动画映射继续由 `EnemyVisual` 提供。
