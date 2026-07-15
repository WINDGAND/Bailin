# 低打扰更新日志页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉跨页更新横幅与设置角标，改为侧栏「更新日志」时间线 + 仅该入口高亮提醒。

**Architecture:** 主进程新增 `listReleases`（GitHub `/releases` + 短缓存）；保留现有 `checkForUpdates` / dismiss / `EventUpdateAvailable`。渲染层新增 `ChangelogPanel` Tab；`updateInfo` 只驱动侧栏角标与「忽略」按钮，不再渲染 `UpdateBanner`。

**Tech Stack:** Electron IPC、React、现有 `ChatMarkdown`、CSS design-system tokens、`node:test` + `tsx`（纯函数单测）

## Global Constraints

- 不引入 electron-updater / 静默下载。
- Release 数据源：`WINDGAND/Bailin` GitHub API；跳过 draft 与 prerelease。
- 高亮仅在「忽略此版本」后熄灭；进入 Changelog 页不自动 dismiss。
- 「忽略」只出现在 Changelog 页、且仅 `isNewerVersion(entry, current)` 的条目。
- UI 对齐时间线参考稿，复用现有 `--ink` / `eyebrow` / `display` / `btn`，不新建第二套主题。
- Spec：`docs/superpowers/specs/2026-07-15-changelog-low-noise-design.md`

---

## 文件地图

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/main/update/release-list.ts` | `fetchReleaseSummaries` + 进程内 TTL 缓存 |
| `apps/desktop/src/main/update/release-list.test.ts` | 解析/过滤单测（mock fetch） |
| `apps/desktop/src/shared/ipc-contract.ts` | `ReleaseSummary`、`listReleases`、`SettingsTab` += `changelog`、IPC 常量 |
| `apps/desktop/src/main/ipc/register.ts` | handler |
| `apps/desktop/src/preload/index.ts` | 暴露 API |
| `apps/desktop/src/renderer/shared/use-bailin.ts` | 类型 + stub |
| `apps/desktop/src/renderer/settings/changelog/ChangelogPanel.tsx` | 时间线 UI |
| `apps/desktop/src/renderer/settings/changelog/group-releases.ts` | 按日分组纯函数 |
| `apps/desktop/src/renderer/settings/changelog/group-releases.test.ts` | 分组单测 |
| `apps/desktop/src/renderer/settings/app/SettingsApp.tsx` | Tab、角标、去掉 Banner、快捷键 7 |
| `apps/desktop/src/renderer/settings/app/UpdateBanner.tsx` | **删除** |
| `apps/desktop/src/renderer/settings/general/AboutSection.tsx` | 去掉 inline 大卡 |
| `apps/desktop/src/renderer/settings/app/update-context.tsx` | 注释/语义：侧栏而非横幅 |
| `apps/desktop/src/renderer/styles/design-system.css` | timeline 样式；清理无用 `.update-announce*` |
| `zh.ts` / `en.ts` | `nav.changelog` + changelog 文案 |

---

### Task 1: `fetchReleaseSummaries` 纯逻辑 + 测试（TDD）

**Files:**
- Create: `apps/desktop/src/main/update/release-list.ts`
- Create: `apps/desktop/src/main/update/release-list.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ReleaseSummary {
    version: string;
    tag: string;
    title: string;
    publishedAt: string;
    url: string;
    notesMarkdown: string;
  }
  export type ListReleasesResult =
    | { ok: true; releases: ReleaseSummary[] }
    | { ok: false; error: string };
  export async function fetchReleaseSummaries(options?: {
    perPage?: number;
    fetchImpl?: typeof fetch;
    nowMs?: number;
    bypassCache?: boolean;
  }): Promise<ListReleasesResult>;
  /** 测试用：清空模块级缓存 */
  export function clearReleaseListCacheForTests(): void;
  ```

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clearReleaseListCacheForTests,
  fetchReleaseSummaries
} from "./release-list.js";

describe("fetchReleaseSummaries", () => {
  beforeEach(() => clearReleaseListCacheForTests());

  it("maps published non-draft non-prerelease releases", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: "v0.0.6",
            name: "Bailin v0.0.6",
            html_url: "https://github.com/WINDGAND/Bailin/releases/tag/v0.0.6",
            body: "## notes",
            published_at: "2026-07-13T04:00:00Z",
            draft: false,
            prerelease: false
          },
          {
            tag_name: "v0.0.5-beta",
            name: "beta",
            html_url: "https://example.com/beta",
            body: "",
            published_at: "2026-07-01T00:00:00Z",
            draft: false,
            prerelease: true
          },
          {
            tag_name: "v0.0.4",
            name: "",
            html_url: "https://example.com/v4",
            body: null,
            published_at: "2026-06-01T00:00:00Z",
            draft: true,
            prerelease: false
          }
        ]),
        { status: 200 }
      );

    const result = await fetchReleaseSummaries({ fetchImpl, bypassCache: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases.length, 1);
    assert.deepEqual(result.releases[0], {
      version: "0.0.6",
      tag: "v0.0.6",
      title: "Bailin v0.0.6",
      publishedAt: "2026-07-13T04:00:00Z",
      url: "https://github.com/WINDGAND/Bailin/releases/tag/v0.0.6",
      notesMarkdown: "## notes"
    });
  });

  it("falls back title to tag when name empty", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: "v0.0.3",
            name: "  ",
            html_url: "https://example.com/v3",
            body: "",
            published_at: "2026-05-01T00:00:00Z",
            draft: false,
            prerelease: false
          }
        ]),
        { status: 200 }
      );
    const result = await fetchReleaseSummaries({ fetchImpl, bypassCache: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.title, "v0.0.3");
  });

  it("returns ok:false on HTTP error", async () => {
    const fetchImpl = async () => new Response("nope", { status: 403 });
    const result = await fetchReleaseSummaries({ fetchImpl, bypassCache: true });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /403/);
  });

  it("reuses cache within TTL", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const t0 = 1_000_000;
    await fetchReleaseSummaries({ fetchImpl, nowMs: t0 });
    await fetchReleaseSummaries({ fetchImpl, nowMs: t0 + 60_000 });
    assert.equal(calls, 1);
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm exec tsx --test apps/desktop/src/main/update/release-list.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `release-list.ts`**

要点：
- URL：`https://api.github.com/repos/WINDGAND/Bailin/releases?per_page=${perPage ?? 15}`
- Headers 与 `update-checker.ts` 一致；`AbortSignal.timeout(10_000)`
- 模块级 `{ expiresAt, result }` 缓存；TTL = `45 * 60 * 1000`；`bypassCache` 跳过读缓存但仍写缓存
- `name` trim 后空则用 `tag_name`；`body` null → `""`；`version` = tag 去前导 `v`
- 非数组 JSON → `ok: false`

- [ ] **Step 4: 跑测确认通过**

Run: `pnpm exec tsx --test apps/desktop/src/main/update/release-list.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/update/release-list.ts apps/desktop/src/main/update/release-list.test.ts
git commit -m "feat: 拉取并缓存 GitHub Release 列表"
```

---

### Task 2: IPC 贯通 `listReleases` + `SettingsTab`

**Files:**
- Modify: `apps/desktop/src/shared/ipc-contract.ts`
- Modify: `apps/desktop/src/main/ipc/register.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/shared/use-bailin.ts`

**Interfaces:**
- Consumes: `fetchReleaseSummaries` from Task 1
- Produces: `bailin.app.listReleases(): Promise<ListReleasesResult>`；`SettingsTab` 含 `"changelog"`

- [ ] **Step 1: 扩展契约**

在 `ipc-contract.ts`：
- 导出与主进程一致的 `ReleaseSummary` / `ListReleasesResult`（可从类型上与 main 重复定义一份，避免 renderer 依赖 main 路径；字段必须一致）
- `BailinApi.app.listReleases(): Promise<ListReleasesResult>`
- `SettingsTab` 联合类型追加 `"changelog"`
- `IPC.AppListReleases: "bailin.app.listReleases"`
- 更新 `checkForUpdates` / `EventUpdateAvailable` 注释：广播用于侧栏高亮，不再用于横幅

- [ ] **Step 2: register + preload + stub**

`register.ts`：
```ts
ipcMain.handle(IPC.AppListReleases, () => fetchReleaseSummaries());
```

`preload/index.ts`：
```ts
listReleases: () => ipcRenderer.invoke(IPC.AppListReleases),
```

`use-bailin.ts`：真实类型 + stub `listReleases: async () => ({ ok: false, error: "stub 环境" })`

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/shared/ipc-contract.ts apps/desktop/src/main/ipc/register.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/shared/use-bailin.ts
git commit -m "feat: 暴露 listReleases IPC 并扩展 changelog Tab 类型"
```

---

### Task 3: 按日分组纯函数 + i18n 文案

**Files:**
- Create: `apps/desktop/src/renderer/settings/changelog/group-releases.ts`
- Create: `apps/desktop/src/renderer/settings/changelog/group-releases.test.ts`
- Modify: `apps/desktop/src/renderer/shared/i18n/locales/zh.ts`
- Modify: `apps/desktop/src/renderer/shared/i18n/locales/en.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ReleaseDayGroup {
    /** YYYY-MM-DD in local timezone */
    dayKey: string;
    /** preformatted heading for UI */
    dayLabel: string;
    items: Array<ReleaseSummary & { timeLabel: string }>;
  }
  export function groupReleasesByDay(
    releases: ReleaseSummary[],
    locale: "zh" | "en",
    timeZone?: string
  ): ReleaseDayGroup[];
  ```

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupReleasesByDay } from "./group-releases.js";

describe("groupReleasesByDay", () => {
  it("groups two releases on same local day", () => {
    const groups = groupReleasesByDay(
      [
        {
          version: "0.0.6",
          tag: "v0.0.6",
          title: "A",
          publishedAt: "2026-07-13T04:00:00Z",
          url: "https://example.com/a",
          notesMarkdown: ""
        },
        {
          version: "0.0.5",
          tag: "v0.0.5",
          title: "B",
          publishedAt: "2026-07-13T01:00:00Z",
          url: "https://example.com/b",
          notesMarkdown: ""
        }
      ],
      "zh",
      "UTC"
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.dayKey, "2026-07-13");
    assert.equal(groups[0]?.items.length, 2);
    assert.match(groups[0]?.dayLabel ?? "", /2026/);
  });
});
```

- [ ] **Step 2: 实现分组** — 用 `Intl.DateTimeFormat`；zh 标题接近「2026 年 7 月 13 日 周一」；en 用 `Monday, July 13, 2026`；`timeLabel` 为 `HH:mm`（本地/指定时区）。组内保持输入顺序（API 已按新→旧）。

- [ ] **Step 3: i18n**

`nav.changelog`: zh `更新日志` / en `Changelog`

`update`（或新建 `changelog` 命名空间，二选一；推荐扩展 `update` 保持检查相关键集中）增加：
- `changelogEyebrow`: `CHANGELOG` / `CHANGELOG`
- `changelogTitle`: `更新日志` / `Changelog`
- `changelogSubtitle`: `最近发生了什么 — 新功能、调整、下线，都写在这里。` / `What shipped recently — features, tweaks, and retirements.`
- `changelogLoading` / `changelogEmpty` / `changelogError` / `changelogRetry`
- `changelogStatusUpdate`: `更新` / `Update`
- `viewRelease` 可继续复用；`dismiss` 复用
- 可选：`updateAvailableToast` 与 `bannerTitle` 区分（关于检查仍可用 `bannerTitle`）

删除仅横幅使用的键可留到 Task 5（`eyebrow` / `viewChangelog` / `hideChangelog`）一并清理。

- [ ] **Step 4: 跑测**

`pnpm exec tsx --test apps/desktop/src/renderer/settings/changelog/group-releases.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/settings/changelog/group-releases.ts apps/desktop/src/renderer/settings/changelog/group-releases.test.ts apps/desktop/src/renderer/shared/i18n/locales/zh.ts apps/desktop/src/renderer/shared/i18n/locales/en.ts
git commit -m "feat: 更新日志按日分组与 i18n 文案"
```

---

### Task 4: ChangelogPanel UI + CSS

**Files:**
- Create: `apps/desktop/src/renderer/settings/changelog/ChangelogPanel.tsx`
- Modify: `apps/desktop/src/renderer/styles/design-system.css`

**Interfaces:**
- Consumes: `bailin.app.listReleases`、`useUpdateInfo().currentVersion|updateInfo|dismiss`、`isNewerVersion` — **注意**：`isNewerVersion` 在 main 侧；renderer **不要** import main。二选一：
  1. 把 `version-compare.ts` 挪到 `apps/desktop/src/shared/version-compare.ts`，main 改为从 shared 引用（推荐，本 Task 第一步做移动并改 import）
  2. 或在 ChangelogPanel 内联同样的比较函数（禁止，易漂移）
- Produces: `<ChangelogPanel />`

- [ ] **Step 1: 移动 `version-compare.ts` → `apps/desktop/src/shared/version-compare.ts`**，更新 `update-checker.ts`、`update-scheduler.ts`、`register.ts` 的 import。确认无循环依赖。

- [ ] **Step 2: 实现 `ChangelogPanel`**

结构：
```tsx
export function ChangelogPanel(): JSX.Element {
  // mount 时 listReleases()；loading / error+retry / empty / timeline
  // 对每条：isNewerVersion(version, currentVersion) && updateInfo?.latestVersion === version
  //   → 显示 dismiss（调用 dismiss()）；以及 viewRelease openExternal(url)
  // 其它条目只显示查看链接
}
```

布局 class（建议）：
- `.changelog` / `__header` / `__eyebrow` / `__title` / `__subtitle`
- `.changelog-day` / `__heading` / `__rule`
- `.changelog-item` / `__meta` / `__time` / `__status` / `__body` / `__title` / `__notes` / `__actions`

视觉：日标题粗体 + 底部分隔线；左栏固定宽约 88–104px（时间 + 绿色小点「更新」）；右栏标题 + `ChatMarkdown` notes；动作区 ghost/magenta 小按钮。 staggered `fade-in-up` 可选用现有 animation。

- [ ] **Step 3: CSS** — 写入 `design-system.css`（靠近原 update-announce 区块）。深色主题用现有 `[data-theme="dark"]` 变量，勿硬编码粉紫横幅色。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/shared/version-compare.ts apps/desktop/src/main/update/version-compare.ts apps/desktop/src/main/update/update-checker.ts apps/desktop/src/main/update/update-scheduler.ts apps/desktop/src/main/ipc/register.ts apps/desktop/src/renderer/settings/changelog/ChangelogPanel.tsx apps/desktop/src/renderer/styles/design-system.css
git commit -m "feat: 更新日志时间线页面与共享版本比较"
```

（若采用「移动文件」：删除旧 `main/update/version-compare.ts`，或保留 re-export 一行以免漏改——优先直接移动。）

---

### Task 5: SettingsApp 接线 + 删除横幅 + About 收敛

**Files:**
- Modify: `apps/desktop/src/renderer/settings/app/SettingsApp.tsx`
- Delete: `apps/desktop/src/renderer/settings/app/UpdateBanner.tsx`
- Modify: `apps/desktop/src/renderer/settings/general/AboutSection.tsx`
- Modify: `apps/desktop/src/renderer/settings/app/update-context.tsx`
- Modify: `apps/desktop/src/renderer/styles/design-system.css`（删除无引用的 `.update-announce*`）
- Modify: `zh.ts` / `en.ts`（删除横幅专用死键：`update.eyebrow`、`viewChangelog`、`hideChangelog` 若已无引用）

- [ ] **Step 1: SettingsApp**
  - `Tab` / `TABS` 追加 `{ id: "changelog", labelKey: "nav.changelog", icon: ChangelogIcon }`（图标可用简单「列表/时钟」描边 SVG，风格对齐其它 Icon）
  - `UpdateNavBadge` 条件改为 `tabDef.id === "changelog"`
  - 去掉 `UpdateBanner` import 与 JSX
  - `tab === "changelog" ? <ChangelogPanel /> : null`
  - 快捷键 `7` → changelog；更新注释里「Cmd+1..6」为 `1..7`

- [ ] **Step 2: AboutSection** — 删除 `updateInfo?.hasUpdate` 整块 inline 卡；只留版本行 + 检查按钮。可去掉对 `updateInfo` / `ChatMarkdown` / `bailin`（若 openExternal 不再需要）的依赖。

- [ ] **Step 3: update-context** — 注释改为「侧栏高亮 / Changelog 忽略」；`checkNow` 在 `hasUpdate && !dismissed` 时仍 `setUpdateInfo`；toast 文案可继续用 `bannerTitle` 或新键 `updateAvailableToast`。

- [ ] **Step 4: 删除 `UpdateBanner.tsx` + 清理 CSS/i18n 死代码**

- [ ] **Step 5: Commit**

```bash
git add -A apps/desktop/src/renderer/settings apps/desktop/src/renderer/styles/design-system.css apps/desktop/src/renderer/shared/i18n/locales
git commit -m "feat: 侧栏更新日志取代跨页更新横幅"
```

---

### Task 6: 验证

**Files:** 无新文件

- [ ] **Step 1: 单测**

```bash
pnpm exec tsx --test apps/desktop/src/main/update/release-list.test.ts apps/desktop/src/renderer/settings/changelog/group-releases.test.ts
```

Expected: 全部 PASS

- [ ] **Step 2: typecheck**

```bash
pnpm --filter=./apps/desktop run typecheck
```

Expected: 无本改动引入的错误（若存在既有 `PetApp.tsx` TS2322，记录但不阻塞，除非本次改动触及）

- [ ] **Step 3: 手工检查清单（开发者）**
  1. 各 Tab 顶部无粉/更新横幅
  2. 「设置」无角标；模拟 `updateInfo` 时仅「更新日志」有角标
  3. Changelog 时间线能加载真实 Release；新版本条有忽略；忽略后角标灭
  4. 关于「检查更新」toast 正常
  5. 「查看/下载」打开浏览器 Release 页

- [ ] **Step 4: Commit**（仅当验证中有小修）或跳过空提交

---

## Spec 覆盖自检

| Spec 要求 | Task |
|-----------|------|
| 去掉 UpdateBanner | 5 |
| 去掉设置角标 | 5 |
| 侧栏设置下「更新日志」 | 5 |
| 仅 changelog 高亮 | 5 |
| GitHub 列表 + 过滤 | 1 |
| 短缓存 | 1 |
| 时间线 UI | 4 |
| 忽略仅 changelog 页 | 4+5 |
| About 去大卡 / toast | 5 |
| 保留 check/dismiss/scheduler | 不变（5 只改前端消费） |
| openExternal 链接 | 4 |
| i18n | 3+5 |

## 执行交接

Plan 已保存到 `docs/superpowers/plans/2026-07-15-changelog-low-noise.md`。

两种执行方式：

1. **Subagent-Driven（推荐）** — 每任务新开 subagent，任务间复审  
2. **Inline Execution** — 本会话按 executing-plans 连续做

选哪种？
