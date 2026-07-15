# 低打扰更新提醒 → 更新日志页

## 背景

v0.0.6 发版后，新版本提醒以顶部横幅形式出现在设置窗口**每一个**页面的主内容顶部，同时「设置」导航项带小圆点。对用户打扰过大。

本设计在保留「检查 GitHub Release + 忽略版本」能力的前提下，把提醒收敛到侧边栏独立「更新日志」入口，并提供时间线式历史摘要。

## 与既有设计的关系

- 承接并**部分取代** `2026-07-07-update-notification-design.md` 中的 **UI 呈现**（顶部横幅 + 设置角标）。
- **保留**：`checkForUpdates`、`UpdateScheduler`、`dismissUpdate` / `update.dismissed_tag`、版本比较、关于页「检查更新」入口（反馈改为 toast + 侧栏高亮，不再出横幅）。
- **新增**：Release 列表拉取 + Changelog 页。

## 目标与非目标

**目标**

1. 去掉跨页顶部 `UpdateBanner`。
2. 去掉「设置」导航上的更新小圆点。
3. 侧边栏「设置」下方新增「更新日志」Tab；有未忽略新版本时仅该入口高亮。
4. 页面按时间线展示最近若干 GitHub Release 摘要，并提供跳转链接。
5. 「忽略此版本」仅出现在更新日志页、且仅针对比当前版本新的条目。

**非目标**

- 应用内静默下载 / 安装 / electron-updater。
- 改发版流程或 Release notes 写作规范。
- 展示 draft / prerelease（默认跳过）。

## 信息架构

| 位置 | 行为 |
|------|------|
| 侧栏「更新日志」 | 新 Tab，在「设置」下方 |
| 侧栏高亮 | `hasUpdate && !dismissed` 时显示小圆点（样式复用现有 `settings-nav__badge`） |
| 顶部横幅 | 删除 |
| 设置角标 | 删除 |
| 关于 · 检查更新 | 保留按钮；结果用 toast；有未忽略新版本时点亮侧栏，不渲染大卡/横幅 |
| 忽略 | 仅 Changelog 页、新于当前版本的那条 |

点进「更新日志」**不会**自动清除高亮；必须点「忽略此版本」。

## 数据流

### Release 列表

- 新增主进程能力（建议函数名 `listReleases`）：
  - `GET https://api.github.com/repos/WINDGAND/Bailin/releases?per_page=15`
  - Headers 与现有 checker 一致：`Accept: application/vnd.github+json`、`User-Agent: Bailin-Desktop-UpdateChecker`
  - 超时 10s；失败返回 `{ ok: false, error }` 或等价结构，不抛异常
- 过滤：跳过 `draft`；跳过 `prerelease`
- 映射为：
  ```ts
  interface ReleaseSummary {
    version: string;       // tag 去 v 前缀
    tag: string;           // 原始 tag_name
    title: string;         // name，空则回退 tag
    publishedAt: string;   // ISO
    url: string;           // html_url
    notesMarkdown: string; // body
  }
  ```
- IPC：例如 `app.listReleases(): Promise<{ ok: true; releases: ReleaseSummary[] } | { ok: false; error: string }>`
- 缓存：进程内短缓存（建议 TTL 30–60 分钟，或会话内首次成功后复用，打开页时可强制刷新）；避免每次切 Tab 都打 GitHub

### 新版本检测（沿用）

- `checkForUpdates` / `UpdateScheduler` / `EventUpdateAvailable` 逻辑不变。
- 渲染层 `update-context`：收到 `updateAvailable` 仍写入 `updateInfo`，但**不再**驱动横幅；仅驱动侧栏「更新日志」角标 + Changelog 页上的「忽略」按钮可见性。
- `dismissUpdate`：写入 `update.dismissed_tag`，清空 `updateInfo`，角标熄灭；列表历史条目仍保留。

### 前端页面

新增 `ChangelogPanel`（或同等命名），挂到 `SettingsApp` 新 Tab `changelog`：

1. 页头：eyebrow `CHANGELOG` + 标题 + 一句说明（i18n）。
2. 按 `publishedAt` 的**本地日历日**分组；日期标题形如「2026 年 7 月 13 日 周一」（中/英随 locale）。
3. 条目：左栏时间 + 「更新」标记；右栏标题、Markdown 摘要（复用 `ChatMarkdown`）、「查看 Release」外链。
4. 若 `isNewerVersion(entry.version, currentVersion)` 且该版本未被忽略：显示「忽略此版本」。
5. 加载 / 错误 / 空列表三态。

视觉对齐参考稿（时间线、日标题+分隔线、左右两栏），并遵循现有设置页 token（`--ink` / `display` / `eyebrow` 等），不做第二套设计系统。

### 关于小节收敛

`AboutSection` 去掉 `update-announce--inline` 大卡；只保留当前版本 +「检查更新」。`checkNow` 行为：

| 结果 | UI |
|------|-----|
| 有更新且未忽略 | toast 提示有新版本 + `setUpdateInfo`（侧栏亮） |
| 有更新且已忽略 | toast 说明有该版本但不重新点亮（保持现语义） |
| 已最新 | success toast |
| 失败 | error toast |

## 类型与导航扩展

- `SettingsTab` / 渲染 `Tab` 增加 `"changelog"`。
- `pet.openSettings("changelog")` 可导航到该页（可选但建议一并加上，成本低）。
- i18n：`nav.changelog`、页头文案、空/错态、「忽略」「查看 Release」等；中英同步。

## 删除 / 停用

- 移除 `SettingsApp` 主内容区的 `<UpdateBanner />`。
- 删除或内联废弃 `UpdateBanner.tsx`（无引用后删除）。
- `UpdateNavBadge` 从「设置」移到「更新日志」。
- 相关 CSS（`.update-announce` 等）若无其它引用则清理；Changelog 用新的 timeline 类名，避免继续叫 announce。

## 错误与边界

- GitHub 限流 / 离线：Changelog 页内错误 + 重试；不影响其它 Tab。
- 列表为空：空状态文案。
- 外链：仅 `openExternal(https…)`。
- 忽略只绑定具体版本号；更高版本再次高亮。

## 测试要点

- 无更新：无角标；时间线仍能列出历史 Release（若网络可用）。
- 有更新未忽略：仅 changelog 导航有角标；各 Tab 顶部无横幅。
- 忽略后：角标灭；该条仍在时间线，不再显示忽略按钮。
- 关于「检查更新」各分支 toast + 角标行为符合上表。
- `listReleases` 失败不崩溃。

## 涉及文件（预期）

**新增**

- `apps/desktop/src/main/update/release-list.ts`（或并入 update-checker）
- `apps/desktop/src/renderer/settings/changelog/ChangelogPanel.tsx`（+ 少量 CSS）

**修改**

- `ipc-contract.ts` / `preload` / `register.ts` / `use-bailin.ts`
- `SettingsApp.tsx`（Tab、角标、去掉 Banner）
- `update-context.tsx`（注释与 checkNow 文案语义；去掉横幅假设）
- `AboutSection.tsx`
- `zh.ts` / `en.ts`
- 设置页样式表中 timeline / 清理 announce

**删除**

- `UpdateBanner.tsx`（若完全无用）
