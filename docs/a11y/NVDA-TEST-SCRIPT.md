# 百灵 Bailin · NVDA 手测脚本

> **目的**：30 分钟内手工验证全产品键盘可达性 + 屏幕阅读器朗读语义。
> 这是 axe-core 自动扫描的补集 —— axe 能扫静态 DOM/ARIA/对比度，但**测不了焦点流转 / 实际朗读 / 键盘交互**，必须人工测。

---

## 准备

| 工具 | 推荐版本 | 备注 |
|---|---|---|
| **NVDA** | 2024.1+ | Windows 免费屏幕阅读器，[官网下载](https://www.nvaccess.org/) |
| 替代：**Narrator** | Win 11 内置 | Win + Ctrl + Enter 启动；ARIA 支持略弱于 NVDA |
| 替代：**VoiceOver** | macOS 内置 | Cmd + F5 启动；如果你在 Mac 上测 |

**NVDA 速记**：
- `Insert` 是 NVDA 的「NVDA 键」，简称 `N`
- `N + Q` 退出 NVDA
- `N + Up/Down` 朗读上/下一行
- `Tab` / `Shift+Tab` 在可聚焦元素间移动
- `Esc` 通常关闭弹层

---

## 测试流程（按窗口）

### 🪟 Window 1 — Pet 桌宠（约 5 分钟）

**启动**：`pnpm dev` → 桌宠出现在屏幕右下角。

| 步骤 | 操作 | 期望 NVDA 朗读 / 期望视觉 |
|---|---|---|
| 1 | 按 `Alt+Tab` 切到桌宠窗口，按 `Tab` 聚焦 | 「桌宠角色 〈名字〉；回车唤起对话，Shift+F10 打开菜单，按钮，已折叠」 |
| 2 | 桌宠四周出现什么 | 4px offset 的洋红色焦点环 ✓ |
| 3 | 按 `Enter` 或 `Space` | 桌宠播 click 动画，420ms 后聊天窗弹出 |
| 4 | 关闭聊天窗 → 重新 `Tab` 聚焦桌宠 → 按 `Shift+F10` | 右键菜单弹出；NVDA 朗读「唤起对话，按钮，菜单项」 |
| 5 | 按 `↓` | 焦点移到第二项「安静 30 分钟」，NVDA 朗读 |
| 6 | 按 `Home` | 焦点跳回首项 |
| 7 | 按 `End` | 焦点跳到末项「隐藏到托盘」 |
| 8 | 按 `Tab` / `Shift+Tab` | 等同于 ↓/↑，焦点**不跳出**菜单 |
| 9 | 按 `→` 展开「切换角色」子菜单 | submenu 出现，NVDA 朗读子项 |
| 10 | 在子菜单里观察 active 角色 | 名字前有洋红小圆点（SVG，不是 ● 字符）；NVDA 朗读「〈角色名〉，当前」 |
| 11 | 按 `Esc` | 菜单关闭，焦点**回到桌宠**；按 Tab 还能继续 |
| 12 | 鼠标点击 / 拖动桌宠 | 焦点环**不出现**（`:focus-visible` 仅响应键盘） |

**通过条件**：12 项全 ✓。如果第 11 项焦点没回到桌宠，是 bug。

---

### 🪟 Window 2 — Chat 聊天窗口（约 7 分钟）

**前置**：Pet 窗口里点桌宠唤起聊天窗。

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 聊天窗打开 | textarea 自动聚焦（autoFocus）；NVDA 朗读「对话输入框」**一次** |
| 2 | 不输入任何文字，按 `Enter` | form 抖动 0.45 秒（CSS shake-once 动画）；NVDA 朗读「请先输入内容」 |
| 3 | 连按两次 `Enter` | 第二次也能再抖动（rAF reset） |
| 4 | 输入一个字符然后 `Backspace` 清空，再 `Enter` | 同 step 2 抖动 |
| 5 | 输入「hello」按 `Enter` | 真正发送，等流式响应 |
| 6 | 流式响应中按 `Esc` | 关闭聊天窗 |
| 7 | 重新打开聊天窗，`Tab` 到 history 按钮 | NVDA 朗读「对话历史，按钮，已折叠，按下可打开对话框」 |
| 8 | 按 `Enter` 打开 history panel | panel 滑入；焦点自动落「新对话」按钮 |
| 9 | 按 `Tab` 在 panel 内多次 | 焦点循环在 panel 内（新对话 → 会话项 → 三点按钮 → ...）**不跳到 backdrop** |
| 10 | 按 `Shift+Tab` | 反向循环 |
| 11 | 按 `Esc` | panel 关闭，焦点**回到 header 上的 history 按钮** |
| 12 | 重新打开 panel，`Tab` 到某条会话的三点按钮 | NVDA 朗读「更多操作，按钮，已折叠」 |
| 13 | 按 `Enter` 打开菜单 | 焦点自动落「重命名」 |
| 14 | 按 `↓` / `↑` / `Home` / `End` | 在「重命名 / 删除」间循环 |
| 15 | 按 `Tab` | 同 ↓，菜单内 trap |
| 16 | 按 `Esc` | 菜单关闭，焦点**回到三点按钮** |
| 17 | 点角色名旁边的 `(i)` 按钮 | popover 出现 |
| 18 | **关键测试**：用鼠标点 popover 内的文字（如 mental model 名字） | popover **不应关闭**（之前的 bug 已修） |
| 19 | 按 `Esc` | popover 关闭，焦点回 (i) 按钮 |
| 20 | 助手消息出现后，hover 消息气泡 | 下方出现操作栏（复制 / 引用 / 重新生成 / 删除） |
| 21 | `Tab` 到「复制」按钮，按 `Enter` | NVDA 朗读「已复制」 |
| 22 | **断网测试**：关闭网络，模拟剪贴板权限错误 | NVDA 朗读「复制失败，请手动选中文本」（**之前会假成功，data loss bug**） |

**通过条件**：22 项全 ✓。重点关注 step 2/3/18/22 — 这些是 Phase 3 修复的核心。

---

### 🪟 Window 3 — Settings 设置窗口（约 10 分钟）

**启动**：托盘右键 → 打开设置；或按 `Ctrl+Shift+P` 调出桌宠菜单 → 「打开设置」。

#### 侧栏导航
| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | `Tab` 到侧栏的「角色仓库」 | NVDA 朗读「角色仓库，按钮，当前页面」 |
| 2 | `Tab` 在 6 个 nav 按钮间移动 | 焦点正确流转 |
| 3 | 按 `1` ~ `6` 快捷键 | 直达对应 tab |

#### Settings → 通用 → 外观（OptionGroup 验证）
| 步骤 | 操作 | 期望 |
|---|---|---|
| 4 | `Tab` 聚焦「外观」选项组 | 焦点落当前选中项；NVDA 朗读「外观，单选按钮组」 |
| 5 | 按 `→` / `↓` | 切换到下一项 + **立即应用主题** + NVDA 朗读「跟随系统，单选按钮，已选中，3 of 3」 |
| 6 | 按 `Home` / `End` | 跳首/末项并应用 |
| 7 | 按 `Space` | 在当前 active 上不变；非 active 时选中 |

#### Settings → 桌面伴侣
| 步骤 | 操作 | 期望 |
|---|---|---|
| 8 | `Tab` 到「桌宠大小」range | NVDA 朗读「桌宠大小，滑块，桌宠大小 75%」（注意是 valuetext 不是裸 75） |
| 9 | 按 `←` / `→` 调节 | NVDA 实时朗读「桌宠大小 80%」 |
| 10 | `Tab` 到「频率」下拉（BlSelect） | NVDA 朗读「频率，combobox」 |
| 11 | 按 `↓` 或 `Enter` | listbox 弹出 + 高亮当前选中 |
| 12 | 按 `↓` / `↑` | 高亮跟着移动 |
| 13 | 按字母 `l`（如 light） | 立即跳到 light 项 |
| 14 | 500ms 内连按 `s` + `t` | 跳到 standard |
| 15 | 等 500ms 后按 `a` | 跳到 active（**不会拼成 sta...a**） |
| 16 | 按 `Esc` | 关闭，**不提交** |
| 17 | `Tab` 离开 trigger | 焦点正常移到下一元素 |
| 18 | 重新打开 listbox 选个值，按 `Tab` | 提交当前高亮 + 继续向下移焦点 |
| 19 | 「启用安静时段」未勾时观察起止时间 input | 明显变淡（opacity 0.55）；可见 disabled |
| 20 | `Tab` 到 scenario 复选框 | 点 label 文字也能切换 ✓ |
| 21 | 屏幕阅读器在每个复选框上 | 朗读「{label}，复选框，未选中」 |

#### Settings → 用户画像（Memory）
| 步骤 | 操作 | 期望 |
|---|---|---|
| 22 | 后台让一次自动学习触发（聊一会儿）→ 切回 Memory panel | pendingAutoBanner 出现 + NVDA 朗读 banner 文字 |
| 23 | 「自动学习」复选框 | 点 label 文字也能切换 |
| 24 | 「+ 添加事实」按钮 | NVDA 朗读「+ 添加事实，按钮，已折叠」；按 Enter 展开后变 expanded |
| 25 | 事实行最右 × 按钮 | hover 显示；点击删除该行；NVDA 朗读 aria-label「移除这一行」 |

#### Settings → 模型与 Key
| 步骤 | 操作 | 期望 |
|---|---|---|
| 26 | 切到「自定义配置」模式 → 「重用 LLM 服务商」复选框 | 点 label 也能切换 |
| 27 | 「默认 tier」segmented 控件 | OptionGroup 行为同步骤 4-7 |

#### SetupWizard（首次启动）
| 步骤 | 操作 | 期望 |
|---|---|---|
| 28 | 首次启动 Bailin（清掉 localStorage 模拟） | SetupWizard 出现 |
| 29 | **Mac 用户**：左侧 kbd 提示 | 显示「⌘ Shift P」 |
| 30 | **Win 用户**：左侧 kbd 提示 | 显示「Ctrl Shift P」 |
| 31 | Provider 步骤验证 OK，**500ms 内立刻点 Back** | 不会被无声 push 到下一步（之前的 race condition bug） |

---

### 🪟 Window 4 — Proactive Bubble 主动气泡（约 5 分钟）

**触发**：托盘右键 → 「试一次主动气泡」；或等待自然触发（取决于频率设置）。

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 气泡出现 | 4.5 秒后自动消失 |
| 2 | NVDA 朗读 | 「关闭气泡，按钮。{气泡文字}」（aria-live="polite"，不打断当前任务） |
| 3 | 鼠标 hover 气泡 | timer 暂停，鼠标离开恢复 |
| 4 | **Tab 聚焦气泡内的按钮** | timer 暂停（Phase 3 新行为，之前没有） |
| 5 | 焦点离开气泡 | timer 恢复 |
| 6 | 关闭按钮 hover | 背景变 magenta-tint + scale 1.08（不再是浅米色） |
| 7 | 开启系统 reduce motion 后再触发 | timer 延长到 9 秒；入场动画消失（不再震入） |

---

### 🌐 全局横切验证（约 3 分钟）

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | **断网启动测试**：飞行模式下重启 app | 无白屏闪烁（Google Fonts @import 已删，无网络阻塞） |
| 2 | 整 app 切换 light / dark mode | 4 个窗口全部跟随切换，**无视觉穿帮**（重点看 Pet 菜单阴影、Chat history backdrop、modal-backdrop） |
| 3 | DevTools Network 面板看请求 | **不再请求 fonts.googleapis.com** |
| 4 | DevTools Console | 无 React state warning / 无 a11y 警告（注：React 不会主动 warn a11y，但应无报错） |

---

## 测试结果记录

| 窗口 | 通过/总数 | 失败步骤号 | 备注 |
|---|---|---|---|
| Pet | __/12 | | |
| Chat | __/22 | | |
| Settings | __/31 | | |
| Bubble | __/7 | | |
| 全局 | __/4 | | |

如有失败，记下具体行为与预期差异，可以发回给我针对性补丁。

---

## 替代方案：仅用键盘 + 视觉测试（不装 NVDA）

如果不想装屏幕阅读器，**至少要测**：
- 所有「Tab 流转 + Esc 焦点还原 + 弹层 ArrowKeys 导航」（约 60% 的修复点）
- Dark mode 整产品切换无穿帮
- 断网启动不白屏

NVDA 朗读测试是补充验证，但**键盘测试不可省略**。
