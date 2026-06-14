# Skills 与项目的关系

> 本目录是**指针文档**，不是 skill 源码副本。

百灵 Bailin 在产品代码层面消费「角色人格 + 像素桌宠」的协议化数据；这些数据是受到 [女娲 · Skill 造人术](https://github.com/alchaincyf/nuwa-skill) 启发的产品化精简版。

## 项目中实际依赖的 skill

| Skill | 在仓库中的位置 | 项目如何使用 |
| --- | --- | --- |
| `huashu-nuwa` 女娲 | `.agents/skills/huashu-nuwa/`（由 Cursor 通过 `skills-lock.json` 管理） | 作为**设计灵感与提示词来源**。产品代码里在 `packages/nuwa-prompts/` 中以「产品化快速版」重写女娲流程，不在运行时引用 `.agents/`。 |
| starter 角色：`elon-musk / trump / zhangxuefeng / mrbeast` | `.agents/skills/huashu-nuwa/examples/*` | 由 `packages/starter-library/` 在源码里**重新人工编排为 CharacterBundle**，作为内置示例发放。不在用户机上读 `.agents/`。 |
| starter 角色：`eren-yeager / kobe-bryant` | `.agents/skills/*` | 同上。 |

## 为什么不在运行时读 `.agents/`

- `.agents/` 是开发者本机 Cursor 用的目录，**普通用户安装百灵时不会有这个目录**。
- 产品分发包必须自包含：内置角色作为 TS 数据文件嵌进 `packages/starter-library/dist/`。
- 这样做也避免了把 skill 的 380 行 markdown 全文搬进 LLM 上下文，造成 token 浪费。

## 设计 → 实现 的映射

- 女娲 SKILL 的「心智模型 / 决策启发式 / 表达 DNA / 反模式 / 诚实边界」→ `packages/character-protocol/src/character-card.ts` 的 `CharacterCard` 字段
- 女娲 SKILL 的「Phase 1~3 快速流程」→ `packages/nuwa-prompts/src/templates/` 的产品化版本
- 女娲示例角色 → `packages/starter-library/src/bundles/`

## 品牌与命名

- **百灵 Bailin**：产品正式名称，与女娲 Skill 独立，避免用户混淆。
- **女娲 Skill**：上游造人方法论与灵感来源；百灵负责「让人格活在桌面」。
