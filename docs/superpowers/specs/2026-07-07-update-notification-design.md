# 新版本提醒功能设计

## 背景

Bailin 通过 GitHub Releases 分发 NSIS 安装包，用户手动下载安装，应用内没有任何机制告诉用户"有新版本发布了"。用户需要自己记得去 GitHub 页面看有没有更新。

## 现状（调研结论）

- 当前版本号只存在 `package.json`（0.0.3+），运行时从未读取、也没有 IPC 暴露给渲染进程；设置页侧栏 UI 硬编码显示 `"Bailin · 0.0.1"`，与实际版本不符——这是一个已存在的独立 bug，本次一并修复。
- 打包用 electron-builder + NSIS，**未签名**，**未接入** `electron-updater`。因此本次只做"检查 + 提醒 + 引导手动下载"，不做静默自动更新（那需要代码签名和更新服务器基础设施，超出范围）。
- 主进程网络请求统一用全局 `fetch`（`llm-adapter.ts`/`image-generation-adapter.ts` 已有先例：`AbortSignal.timeout` 超时、无自定义代理）。
- IPC 新增遵循三处改动的既有模式：`shared/ipc-contract.ts`（类型 + 通道常量）→ `main/ipc/register.ts`（handler）→ `preload/index.ts`（暴露）。主进程主动推送用已有的 `broadcast()`/`broadcastToAllWindows()` 机制（`EventLocaleChanged` 等已有先例）。
- 定时任务参考 `AmbientMonitor`（`setInterval` + `start()`/`stop()`，`will-quit` 时清理）。
- `LocalVault.getSetting`/`setSetting` 是简单字符串 key-value，用于记录"用户已忽略的版本号"。
- 无 `electron-updater`、无 `semver` 依赖；版本号都是简单 `x.y.z`，自己写一个十几行的比较函数即可，不引入新依赖。

## 功能设计

### 检查逻辑

- 主进程调用 GitHub API `GET https://api.github.com/repos/WINDGAND/Bailin/releases/latest`（公开仓库、免鉴权，需带 `User-Agent` 和 `Accept: application/vnd.github+json`，10s 超时）。
- 解析 `tag_name`（去掉开头的 `v`）、`html_url`、`body`（更新说明 Markdown 原文，前端按纯文本展示，不做完整渲染）、`published_at`。
- 用自写的简单版本比较（按 `.` 分段转数字逐段比较）判断 latest 是否比当前版本新。
- 网络失败 / 限流 / 解析失败：返回 `hasUpdate: false` + `error` 字段，**不抛异常**，调用方决定要不要提示用户。

### 触发时机

- 应用启动后延迟 ~8 秒做一次检查（避开启动关键路径的资源竞争）。
- 之后每 24 小时自动检查一次（`setInterval`，`will-quit` 时清理，模式与 `AmbientMonitor` 一致）。
- 设置页新增"检查更新"按钮，随时手动触发。

### 通知与去重

- 自动检查发现新版本时，**先检查这个版本是否已被用户忽略过**（`LocalVault` 里的 `update.dismissed_tag`），没被忽略才通过 `broadcast(EventUpdateAvailable, result)` 推给所有窗口。
- 手动点"检查更新"按钮：**绕过忽略判断**，总是把真实检查结果返回给调用方（用户主动触发，理应看到真实状态，即使之前忽略过这个版本）；如果发现新版本，同样会广播，让横幅出现。
- 用户点横幅上的"忽略此版本"：调用 IPC 把这个版本号存进 `update.dismissed_tag`，横幅消失；下次出现**更新**的版本时依然会提醒（不是永久关闭提醒）。

### UI 呈现（对应用户选择：横幅 + 侧栏红点，都可关闭/查看）

1. **顶部横幅**（新增 `UpdateBanner.tsx`，视觉参照已有的 `DistillationJobBanner`）：挂在 `SettingsApp.tsx` 的 `<main>` 里，跨 tab 常驻，直到用户点击"下载"或"忽略"。内容：标题"发现新版本 vX.X.X"、更新说明（纯文本，过长时用 `<details>` 折叠展开）、"查看/下载新版本"（`openExternal` 跳浏览器）、"忽略此版本"两个按钮。
2. **侧栏"设置" tab 小红点**：有未处理的新版本时亮起，用户点开"设置"或忽略/查看后消失。
3. **设置页"关于"小节**（新增到 `GeneralSettingsPanel.tsx`）：显示当前版本号（顺带修正硬编码 bug）+ "检查更新"按钮 + 检查结果反馈（成功无更新 → toast"已是最新版本"；失败 → toast"检查失败，请检查网络后重试"；有更新 → 同样触发横幅）。

### 数据流

```
app.whenReady() → UpdateScheduler.start()
  → 延迟 8s 首次检查 → checkForUpdates(currentVersion)
    → GitHub API → 解析 + 版本比较
    → 有新版本 且 未被忽略 → broadcast(EventUpdateAvailable)
      → 渲染进程 update-context 收到 → UpdateBanner 出现 + 侧栏红点亮起
        → 用户点"下载" → openExternal(releaseUrl)（横幅保留，直到用户忽略或版本号变化）
        → 用户点"忽略此版本" → IPC dismissUpdate(tag) → 横幅消失 + 红点熄灭
  → 24h 后重复检查
```

## 涉及文件

**新增**：
- `apps/desktop/src/main/update/version-compare.ts` — 纯函数 `isNewerVersion(a, b)`
- `apps/desktop/src/main/update/update-checker.ts` — `checkForUpdates(currentVersion)`，调用 GitHub API
- `apps/desktop/src/main/update/update-scheduler.ts` — `UpdateScheduler` 类，定时 + 去重触发
- `apps/desktop/src/renderer/settings/app/update-context.tsx` — Provider + `useUpdateInfo()` hook
- `apps/desktop/src/renderer/settings/app/UpdateBanner.tsx` — 横幅组件
- `scripts/verify/verify-update-checker.mjs` — mock fetch 的回归测试（版本比较、GitHub 响应解析、错误分支、去重判断）

**修改**：
- `apps/desktop/src/shared/ipc-contract.ts` — 新增 `UpdateCheckResult` 类型、`AppGetVersion`/`AppCheckForUpdates`/`AppDismissUpdate`/`EventUpdateAvailable`
- `apps/desktop/src/main/ipc/register.ts` — 三个新 handler + `SETTING_UPDATE_DISMISSED_TAG` 常量
- `apps/desktop/src/preload/index.ts` — 暴露对应方法 + 事件订阅
- `apps/desktop/src/main/index.ts` — 实例化并启动/停止 `UpdateScheduler`
- `apps/desktop/src/renderer/settings/app/SettingsApp.tsx` — 挂载 Provider、渲染横幅、侧栏红点、修正硬编码版本号
- `apps/desktop/src/renderer/settings/general/GeneralSettingsPanel.tsx` — 新增"关于"小节
- `apps/desktop/src/renderer/styles/design-system.css` — 侧栏红点样式（横幅复用已有 `.card`/`DistillationJobBanner` 的内联样式模式）
- `apps/desktop/src/renderer/shared/i18n/locales/{zh,en}.ts` — 新增 `update.*` 文案

## 测试计划

- `version-compare.ts` 的 `isNewerVersion`：多组用例（相等、patch 差异、minor 差异、major 差异、带 `v` 前缀、位数不一致如 `0.0.4` vs `0.0.4.0`）。
- `update-checker.ts` 的 `checkForUpdates`：mock `global.fetch`，覆盖：有新版本、无新版本、网络异常、超时、404（无 release）、JSON 解析失败、`tag_name` 缺失。
- 去重判断（是否应该广播）：有新版本但已被忽略 → 不广播；有新版本且未被忽略 → 广播；手动检查即使已忽略也返回真实结果。
- 全部走仓库现有的 `scripts/verify/*.mjs` 约定（require 编译后的 dist，mock fetch，不需要真实网络）。

## 明确不做的部分

- 不做 `electron-updater` 静默自动下载安装（未签名安装包 + 无更新服务器）。
- 不做完整 Markdown 渲染，更新说明按纯文本展示。
- 不加"关闭更新检查"的用户开关（GitHub 请求不含用户信息，与现有 ambient/proactive 后台任务性质一致）。
