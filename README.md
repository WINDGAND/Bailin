# 百灵 Bailin

> 桌面上的百变魂灵——把灵魂蒸馏成伴你身边的小灵，常驻 Windows 桌面、随手唤起。

一个开源的 Windows 桌面「人格容器」：输入任意人物或角色名，系统受 [女娲 Skill](https://github.com/alchaincyf/nuwa-skill) 启发，蒸馏出「受其启发」的视角助手，并具象成程序化像素桌宠。实用线（马斯克 / 张雪峰）给见解；情感线（艾伦 / 科比 / 二次元角色）做陪伴。

---

## 这是什么

| 能力 | 说明 |
|------|------|
| **百变魂灵** | 快速切换不同人格与视角，积累你自己的「思维顾问董事会」或「桌面陪伴宇宙」 |
| **伴灵在场** | 桌宠常驻右下角，降低召唤成本；`Ctrl + Shift + P` 或点击即可对话 |
| **自带模型** | 零云服务、零订阅；贴自己的 OpenAI / Anthropic 兼容 API Key，调用从本机发出，Key 用 Windows DPAPI 加密 |
| **深度 + 快速造人** | 快速模式约 60–120 秒；深度模式 6 路并行调研 → 用户确认 → 框架提炼 → 外貌 → 质量自检 |
| **Vision-first 外貌** | 上传参考图 + 多模态读图 → `AppearanceSpec` → 程序化 sprite；支持重生形象 |
| **像素是代码** | `SpriteProgram` DSL + Web Worker 沙箱渲染；内置精品手写 sprite，用户角色由 `sprite-builder` 生成 |
| **完全本地** | 角色、会话、用户画像存本机 SQLite；不上报遥测 |

完整规格见 [`docs/product/PRD.md`](docs/product/PRD.md) 及配套文档。

---

## 与女娲 Skill 的关系

- **[女娲 Skill](https://github.com/alchaincyf/nuwa-skill)**：在 Cursor / CLI 里用的「造人术」，产出 SKILL 文件，做思维顾问。
- **百灵 Bailin**：同一套蒸馏理念的产品化落地——造出来的不是文件，而是**可上桌、可对话、可记忆**的桌宠。
- 仓库内 `.agents/skills/huashu-nuwa/` 仅供开发参考；**运行时**使用 `packages/nuwa-prompts/` 的产品化 prompt，不读取 `.agents/`。

详见 [`docs/skills/README.md`](docs/skills/README.md)。

---

## 仓库结构

```
bailin/                             # monorepo 根目录（pnpm workspace）
├── apps/
│   └── desktop/                    # Electron 应用（main / preload / renderer）
├── packages/
│   ├── character-protocol/         # CharacterCard / AppearanceSpec / SpriteProgram schema
│   ├── sprite-runtime/             # DSL 渲染器 + 状态机 + guard 沙箱
│   ├── nuwa-prompts/               # 造人 / 调研 / 外貌 vision / 对话 prompt
│   └── starter-library/            # 6 个内置示例角色
├── docs/
│   ├── product/                    # PRD、技术路线、协议、路线图
│   └── skills/                     # 与女娲 Skill 的关系说明
└── scripts/                        # verify-sprite-builder、verify-llm-multimodal 等
```

> 内部 npm 包作用域仍为 `@nuwa-pet/*`（历史命名），计划在 v0.1 统一为 `@bailin/*`。

---

## 开发

### 环境要求

- Windows 10 / 11
- Node.js ≥ 20.10
- pnpm 9（`corepack enable` 自动管理）

### 安装

```bash
pnpm install
```

`pnpm install` 会构建 `better-sqlite3` 并下载对应平台 Electron。

### 完整构建

```bash
pnpm build
```

输出：

- `packages/*/dist/` — 各 package 的 ESM 产物
- `apps/desktop/dist/main/main/` — 主进程 CJS
- `apps/desktop/dist/preload/preload/` — preload CJS
- `apps/desktop/dist/renderer/` — pet / chat / settings 三入口

### 开发模式

```bash
pnpm dev
```

`apps/desktop/scripts/dev.mjs` 并行启动：

- Vite dev server（`http://localhost:5173`）
- 主进程 / preload 的 `tsc --watch`
- 约 4 秒后启动 Electron，注入 `VITE_DEV_SERVER`

### 验证脚本

```bash
node scripts/verify-sprite-builder.mjs    # sprite-builder + starter 兼容
node scripts/verify-llm-multimodal.mjs    # LLM 多模态 adapter（需配置 Key）
node scripts/verify-starters.mjs          # 内置角色 bundle 校验
```

### 首次运行

1. 打开应用 → Setup Wizard
2. 免责声明 → 选 LLM 提供商 → 贴 Key → 测试连通（可选实测 vision / 联网）
3. 选内置示例角色或跳过，稍后自己造
4. 桌面右下角出现像素桌宠
5. `Ctrl + Shift + P` 或点击桌宠 → 对话窗口

### 造人要点

- **快速模式**：一次 LLM 蒸馏人格 + 外貌（有参考图时走 vision 管道）
- **深度模式**：6 Agent 调研 → 两次用户确认 → 合成 → vision-first 外貌 → sprite → 质量自检
- **参考图**：CreateCharacter 支持上传 / 拖拽 / URL；角色详情可「换参考图重生」或「仅重画 sprite」
- **不支持 vision 时**：降级纯文本外貌，QualityReport 与 UI 会明示警告

### 数据目录

用户数据位于：

```
%APPDATA%/Bailin/
├── vault.db              # 角色、设置、会话、记忆
└── research/<charId>/    # 深度蒸馏调研 Markdown 存档
```

从旧版 `NuwaPet` 目录首次启动时会自动迁移到 `Bailin`。

### 卸载与清理

- 设置 →「记忆 / 用户画像」→「清空全部数据」：删除 vault、清除 Key
- 完全卸载：删除 `%APPDATA%/Bailin/` 文件夹

---

## 关键设计

- **协议优先**：`packages/character-protocol` 定义角色长什么样、怎么思考、怎么动；字段变更须升 `schemaVersion` + 迁移器。
- **沙箱大于自由**：SpriteProgram 在 Web Worker 中执行，guard 表达式走白名单 AST 校验。见 [`docs/product/TECH-ROUTE.md`](docs/product/TECH-ROUTE.md)。
- **内置 vs 生成**：`starter-library` 为手写精品 sprite；用户新建走 `sprite-builder`（chibi / shoujo 比例、眼色、服装模板、符号库）。
- **外貌管道**：参考图 → vision 读图 → JSON 结构化 → vision 自检 → `buildSpriteFromAppearance`。

---

## 路线图

见 [`docs/product/ROADMAP.md`](docs/product/ROADMAP.md)。当前 v0.x 聚焦「造人 → 上桌 → 唤起聊天」；后续依次铺开多角色同桌、关系养成、主动陪伴、角色市场（`.bailin` 角色包）、跨端等。

---

## 贡献

仓库处于 v0.0.1。欢迎 fork 扩展角色、调色板与 sprite DSL。

---

## 致谢

- 设计灵感与协议骨架来自 [花叔（@AlchainHust）的女娲 Skill](https://github.com/alchaincyf/nuwa-skill)
- 6 个内置示例角色基于女娲 examples 与社区 perspective skill 精简改编
- 字体：Fraunces (display) + Inter (body) + JetBrains Mono (code)

## License

MIT
