# 三个 Boss 独立技能配置

日期：2026-10-27。依据：本轮用户已认可的独立技能方案、`docs/superpowers/plans/2026-10-27-boss-identities.md`、FR-03 规则 4、DR-01 与 DD-06。

## 调整与保留项

旧三个 Boss 共用冲撞、弹幕、召唤和通用危险区。本次为每个 Boss 配置独立技能集，使读招与应对方式具有区别。

| Boss | 第一阶段 | 第二、三阶段 |
| --- | --- | --- |
| 石像守卫者 | 裂地重锤、地面震波 | 加入岩甲冲撞 |
| 深渊蛛后 | 减速蛛网、吊顶俯袭 | 加入可破坏蛛卵 |
| 回响之影 | 标记换位、三段剑舞 | 加入延迟回响 |

三者 HP 分别保持 600、900、1400；接触伤害均为 5，移动速度、侦测范围、碰撞体、掉落与玩家击退参数不改。阶段阈值仍为 1 / 0.66 / 0.33，切阶段保护仍为 1500ms。

按已确认的具体阶段技能集，守卫第一阶段不施放冲撞，因此不再配置第一阶段旧冲撞的 0.9 秒前摇；第二、三阶段分别保留当前的 0.8 / 0.7 秒前摇。

## 配置接口

`src/game/domain/types.ts` 导出 `BOSS_SKILL_KINDS` 与派生的 `BossSkillKind`，`BossSkillDef.kind` 使用该类型。九种实际技能为：

```text
guardianHammer / guardianStomp / charge
spiderWeb / spiderEggs / spiderDrop
echoStep / echoDance / echoReplay
```

保留 `summon`、`projectileSpread`、`arenaHazard` 三个历史枚举，连同 `charge` 保持旧四种名称的类型兼容；三个 Boss 的实际配置已移除前三种通用招式。

所有实际技能的 `params` 显式提供 `windupSec`、`activeSec`、`recoverySec`。时长单位为游戏内秒；范围、位移、速度单位分别为 px、px、px/s。`cooldownSec` 由 AI 冷却逻辑消费，与动作持续时长分别配置，不将长时间恢复效果误写为施招冷却。

| kind | 生效时间 | 收招时间 | 专属参数 |
| --- | --- | --- | --- |
| `guardianHammer` | 0.25 | 1.1 | `reach: 180` |
| `guardianStomp` | 0.3 | 0.9 | `waveSpeed: 230`、`waveHeight: 24` |
| `charge` | 2.4 | 1.4 | `distance: 1600`；运行时撞墙提前进入收招 |
| `spiderWeb` | 0.25 | 0.8 | `width: 150`、`durationSec: 5`、`slowFactor: 0.65` |
| `spiderEggs` | 0.3 | 0.8 | `count: 2`、`hatchSec: 3` |
| `spiderDrop` | 0.4 | 1.2 | `liftHeight: 260`、`width: 140` |
| `echoStep` | 0.8 | 0.7 | `shiftDistance: 100`（2026-10-28修正原站位无法命中的间隙） |
| `echoDance` | 1.85 | 1.0 | `reach: 130` |
| `echoReplay` | 0.25 | 1.25 | `reach: 130`、`echoDelaySec: 0.95` |

蛛卵同时最多两枚、孵化小蜘蛛同时最多三只，以及回响剑痕最多一道待触发记录，是领域模型中的并存数量约束；`count: 2` 只表示单次尝试布置的数量，不能代替这些运行时上限。取消、重试、暂停、Boss 死亡和阶段转换的处理由独立技能模型与系统负责。

## 各阶段节奏

下表三列数值均按第一 / 第二 / 第三阶段排列，破折号表示该阶段不使用。

| kind | 前摇秒 | 单次技能伤害 | 冷却秒 |
| --- | --- | --- | --- |
| `guardianHammer` | 0.95 / 0.9 / 0.85 | 22 / 24 / 26 | 2.4 / 2.1 / 1.9 |
| `guardianStomp` | 0.9 / 0.85 / 0.8 | 18 / 20 / 22 | 2.6 / 2.3 / 2.1 |
| `charge` | — / 0.8 / 0.7 | — / 25 / 25 | — / 2.7 / 2.4 |
| `spiderWeb` | 0.85 / 0.8 / 0.75 | 12 / 14 / 16 | 2.4 / 2.2 / 2.0 |
| `spiderDrop` | 1.0 / 0.95 / 0.9 | 20 / 22 / 24 | 2.8 / 2.6 / 2.4 |
| `spiderEggs` | — / 1.0 / 0.95 | — / 10 / 10 | — / 2.8 / 2.6 |
| `echoStep` | 0.75 / 0.7 / 0.65 | 14 / 16 / 18 | 2.0 / 1.8 / 1.6 |
| `echoDance` | 0.95 / 0.9 / 0.85 | 20 / 22 / 24 | 2.6 / 2.4 / 2.2 |
| `echoReplay` | — / 1.0 / 0.95 | — / 20 / 22 | — / 2.8 / 2.5 |

数值均由 `src/game/data/enemies.ts` 提供。生效时间、持续效果时间与延迟触发时间各有独立含义，例如蛛网保留五秒、蛛卵三秒孵化、回响延迟 0.95 秒，不能在收招结束时误当作普通攻击区域直接删除。

## 启动校验与验证

`configRegistry.ts` 沿用 V2/V6 与 `CONFIG_INVALID` 错误汇总，错误字段使用 `skill.kind`、`skill.params.<参数名>`，不引入 Phaser：

- 枚举来自共享 `BOSS_SKILL_KINDS`，技能伤害仍要求 5~30，冷却仍要求 0.5~8 秒。
- 所有参数必须是有限数值；九种实际技能必须提供共同前摇、生效与收招时间，以及对应的距离、范围或持续时间参数。
- 前摇范围为 0.6~1 秒、生效时间 0.05~3 秒、收招时间 0.1~3 秒；实际配置冷却为 1.6~2.8 秒。
- 蛛网减速因子须大于零且不超过一；蛛卵单次数量须为 1~2 的整数。位移、范围、波速和持续时间须通过各自正数范围校验。
- 保留的三个历史通用技能继续使用旧参数约定，但其参数也不允许 NaN 或 Infinity。

本分工新增 `src/game/data/bossSkills.test.ts`：先在旧实现观察到 35 项预期失败，再实现至 37 项通过；与原 `configRegistry.test.ts` 两项合计 39 项通过。命令：

```powershell
npx.cmd --no-install vitest run src/game/data/bossSkills.test.ts src/game/domain/configRegistry.test.ts --maxWorkers=2
```

配置单测不能代替实际战斗验证。整合任务已完成后的全套单测、生产构建、浏览器技能与三场 Boss 结算结果，统一记录在 `docs/Boss技能差异化改造.md`。
