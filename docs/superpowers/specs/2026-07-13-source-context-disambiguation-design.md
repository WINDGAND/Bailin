# 创建角色：可选「出处 / 身份」消歧义字段

## 背景

用户创建小众或同名角色时，Bailin 容易创建成「最广为人知」的同名实体，产物不符合预期。

## 根因（现状）

深度创建在调研前调用 `resolveResearchContext`：

1. 从 `userHint` / `userMaterial` 抠《XX》或括号上下文（用户很少知道要这么写）
2. 否则用 LLM **不联网**猜测，且 prompt 明确要求：「有多个常见身份时选最广为人知的一个」

快速创建没有消歧步骤，人格卡 / 外貌 prompt 只吃角色名，同名更易漂移。

外貌调研 prompt 也倾向「用最广为人知的版本」，会放大错误锚点。

## 目标

用**最小改动**让用户能主动锁定消歧锚点：可选填「出处 / 身份」；有填则全链路优先使用，跳过「选最广为人知」猜测。

非目标（本次不做）：

- 候选实体列表 / 联网消歧搜索
- 开跑前身份确认弹窗
- 改 6 Agent / Checkpoint / 质量自检主流程

## 功能设计

### UI（创建页）

在 `CreateCharacter.tsx` 角色名输入下方新增可选字段：

| 项 | 约定 |
|----|------|
| 字段 | `sourceContext`（本地 state） |
| 标签 | 出处 / 身份（可选） |
| Placeholder | 如：进击的巨人 / Berkshire 副董事长 |
| Hint | 同名易混时建议填写，帮助锁定正确对象 |
| 上限 | UI 40 字（与后端 `sourceContext` max 对齐） |
| 可见性 | 三种 `sourceType` 均显示（原创也可作设定锚点） |

提交时：`sourceContext.trim()` 非空则随 `create` / `createDeep` 一并传入。

### 数据契约

新增可选字段 `sourceContext?: string`（max 40）：

| 位置 | 用途 |
|------|------|
| `DistillationJobConfigSchema` | 深度 job 配置 |
| `CreateCharacterInput` | 快速创建 IPC |
| `OrchestrateInput` | 快速编排入参 |

命名统一用 `sourceContext`，与调研管线已有参数同名，避免再引入 `disambiguation` 等别名。

### 后端：`resolveResearchContext` 优先级

改为：

1. **显式 `config.sourceContext`**（trim 后非空）→ 直接返回，**不调用**「最广为人知」LLM
2. 现有从 hint/material 抠《XX》/括号
3. 原创且无显式上下文 → 返回空（与现逻辑一致）
4. 否则才 LLM 猜测「最广为人知」

有显式字段时，进度文案仍可展示「已锁定调研对象：名 / 英文（出处）」。

### 快速创建

`createCharacter` / `runCardStep` / 外貌路径传入 `sourceContext`：

- `buildCharacterCardPrompt`：user 侧注明「所属作品 / 身份锚点：…，必须基于此实体，禁止换成同名其它实体」
- 外貌相关 prompt 入参：有 `sourceContext` 时拼进调研对象描述（可与现有 `sourceName` 并列，或写入 subject 行）；避免只改深度、快速仍认错人

深度路径：`runResearchAgents` 已支持 `sourceContext`，只需保证 `resolveResearchContext` 优先采用用户字段即可；无需改 6 Agent 编排结构。

### i18n

`zh.ts` / `en.ts` 的 `forge.*` 增加：

- `sourceContextLabel`
- `sourceContextPlaceholder`
- `sourceContextHint`

### 测试建议

- 单元：`resolveResearchContext` 在显式 `sourceContext` 时不触发 LLM（可用 mock）
- 手工：同名角色分别填 / 不填出处，深度进度应显示不同锁定上下文；快速产物人格背景应对齐出处

## 涉及文件

**改动**：

- `apps/desktop/src/renderer/settings/create/CreateCharacter.tsx` — 表单字段 + submit 传参
- `apps/desktop/src/renderer/shared/i18n/locales/zh.ts` / `en.ts` — 文案
- `packages/character-protocol/src/distillation-job.ts` — Zod 字段
- `apps/desktop/src/shared/ipc-contract.ts` — `CreateCharacterInput`
- `apps/desktop/src/main/orchestration/bailin-orchestrator.ts` — `OrchestrateInput` + `resolveResearchContext` + 快速路径传参
- `packages/prompts/src/templates/character-creation.ts` — 快速人格卡消歧
- `packages/prompts/src/templates/appearance-research.ts` — 外貌 prompt 带上出处（最小拼接）

**不改**：research-pipeline 结构、Checkpoint UI、materialMode、参考图逻辑。

## 验收标准

1. 创建页角色名下可见可选「出处 / 身份」输入
2. 深度：填写后跳过「最广为人知」猜测，调研锚点为用户填写内容
3. 快速：填写后人格卡 / 外貌生成以该出处为准
4. 不填：行为与改前基本一致（仍可走 hint 抠词 + LLM 猜测）
