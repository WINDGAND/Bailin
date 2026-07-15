#!/usr/bin/env node
/**
 * 回归检查："检查新版本"功能三个模块：
 *   - version-compare.ts 的 isNewerVersion
 *   - update-checker.ts 的 checkForUpdates（mock fetch，不需要真实网络）
 *   - update-scheduler.ts 的 UpdateScheduler「已忽略版本不重复提醒」去重逻辑
 *
 * 跑法（先 build:main）：
 *   pnpm --filter=./apps/desktop run build:main
 *   node scripts/verify/verify-update-checker.mjs
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const versionComparePath = resolve(
  repoRoot,
  "apps/desktop/dist/main/shared/version-compare.js"
);
const updateCheckerPath = resolve(
  repoRoot,
  "apps/desktop/dist/main/main/update/update-checker.js"
);
const updateSchedulerPath = resolve(
  repoRoot,
  "apps/desktop/dist/main/main/update/update-scheduler.js"
);

const { isNewerVersion, isVersionDismissed } = require(versionComparePath);
const { checkForUpdates } = require(updateCheckerPath);
const { UpdateScheduler } = require(updateSchedulerPath);

let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}${detail ? " — " + detail : ""}`);
  }
}

// ============================================================
// isNewerVersion
// ============================================================
check("相同版本不算更新", isNewerVersion("0.0.3", "0.0.3") === false);
check("patch 更新能识别", isNewerVersion("0.0.4", "0.0.3") === true);
check("patch 更旧不算更新", isNewerVersion("0.0.2", "0.0.3") === false);
check("minor 更新能识别", isNewerVersion("0.1.0", "0.0.9") === true);
check("major 更新能识别", isNewerVersion("1.0.0", "0.9.9") === true);
check("带 v 前缀也能正确比较", isNewerVersion("v0.0.4", "v0.0.3") === true);
check("一边带 v 一边不带也能比较", isNewerVersion("v0.0.4", "0.0.3") === true);
check("位数不一致按 0 补齐（0.1 等价 0.1.0）", isNewerVersion("0.1", "0.0.9") === true);
check("位数不一致且相等不算更新", isNewerVersion("0.1", "0.1.0") === false);

// ============================================================
// isVersionDismissed（register.ts 手动检查 和 update-scheduler.ts 自动
// 检查共用的去重判断，抽出来是为了避免两处逻辑各写一遍以后走岔）
// ============================================================
check("未忽略过任何版本：不算已忽略", isVersionDismissed("0.0.4", null) === false);
check("忽略的正是这个版本：算已忽略", isVersionDismissed("0.0.4", "0.0.4") === true);
check("忽略的是别的版本：不算已忽略", isVersionDismissed("0.0.4", "0.0.3") === false);
check("latestVersion 为空：不算已忽略", isVersionDismissed(undefined, "0.0.4") === false);

// ============================================================
// checkForUpdates（mock fetch）
// ============================================================
const originalFetch = globalThis.fetch;

async function withMockFetch(mockImpl, fn) {
  globalThis.fetch = mockImpl;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await withMockFetch(
  async () =>
    new Response(
      JSON.stringify({
        tag_name: "v0.0.4",
        html_url: "https://github.com/WINDGAND/Bailin/releases/tag/v0.0.4",
        body: "## 更新内容\n- 修了个 bug",
        published_at: "2026-07-07T00:00:00Z"
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    ),
  async () => {
    const result = await checkForUpdates("0.0.3");
    check("有新版本时 hasUpdate=true", result.hasUpdate === true, `got ${JSON.stringify(result)}`);
    check("latestVersion 去掉了 v 前缀", result.latestVersion === "0.0.4", `got ${result.latestVersion}`);
    check(
      "releaseUrl 透传自 GitHub 响应",
      result.releaseUrl === "https://github.com/WINDGAND/Bailin/releases/tag/v0.0.4"
    );
    check("releaseNotes 透传 body 原文", result.releaseNotes.includes("修了个 bug"));
  }
);

await withMockFetch(
  async () =>
    new Response(JSON.stringify({ tag_name: "v0.0.2" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }),
  async () => {
    const result = await checkForUpdates("0.0.3");
    check(
      "GitHub 上的版本比当前旧时 hasUpdate=false",
      result.hasUpdate === false,
      `got ${JSON.stringify(result)}`
    );
  }
);

await withMockFetch(
  async () => {
    throw new Error("network unreachable");
  },
  async () => {
    const result = await checkForUpdates("0.0.3");
    check("网络异常：hasUpdate=false 且不抛异常", result.hasUpdate === false);
    check("网络异常：error 字段透传原始信息", result.error?.includes("network unreachable"));
  }
);

await withMockFetch(
  async () => new Response("Not Found", { status: 404 }),
  async () => {
    const result = await checkForUpdates("0.0.3");
    check("404（无 release）：hasUpdate=false", result.hasUpdate === false);
    check("404：error 字段说明 HTTP 状态", result.error?.includes("404"));
  }
);

await withMockFetch(
  async () => new Response("not json", { status: 200 }),
  async () => {
    const result = await checkForUpdates("0.0.3");
    check("JSON 解析失败：hasUpdate=false 不抛异常", result.hasUpdate === false);
  }
);

await withMockFetch(
  async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
  async () => {
    const result = await checkForUpdates("0.0.3");
    check("响应缺少 tag_name：hasUpdate=false", result.hasUpdate === false);
  }
);

// ============================================================
// UpdateScheduler：已忽略版本不重复提醒
// ============================================================
{
  let notifiedCount = 0;
  let lastNotified = null;
  const scheduler = new UpdateScheduler({
    getCurrentVersion: () => "0.0.3",
    getDismissedTag: () => "0.0.4",
    checkFn: async () => ({ hasUpdate: true, latestVersion: "0.0.4" }),
    onUpdateAvailable: (result) => {
      notifiedCount += 1;
      lastNotified = result;
    }
  });
  await scheduler.runScheduledCheck();
  check(
    "已忽略的版本：自动检查不应该再触发提醒",
    notifiedCount === 0,
    `got notifiedCount=${notifiedCount} lastNotified=${JSON.stringify(lastNotified)}`
  );
}

{
  let notifiedCount = 0;
  const scheduler = new UpdateScheduler({
    getCurrentVersion: () => "0.0.3",
    getDismissedTag: () => null,
    checkFn: async () => ({ hasUpdate: true, latestVersion: "0.0.4" }),
    onUpdateAvailable: () => {
      notifiedCount += 1;
    }
  });
  await scheduler.runScheduledCheck();
  check("未被忽略的新版本：自动检查应该触发提醒", notifiedCount === 1, `got ${notifiedCount}`);
}

{
  let notifiedCount = 0;
  const scheduler = new UpdateScheduler({
    getCurrentVersion: () => "0.0.3",
    getDismissedTag: () => "0.0.2", // 忽略的是旧版本号，跟这次查到的新版本不是同一个
    checkFn: async () => ({ hasUpdate: true, latestVersion: "0.0.4" }),
    onUpdateAvailable: () => {
      notifiedCount += 1;
    }
  });
  await scheduler.runScheduledCheck();
  check(
    "忽略的是旧版本号、这次查到的是更新的版本：应该仍然提醒（忽略不是永久关闭）",
    notifiedCount === 1,
    `got ${notifiedCount}`
  );
}

{
  let notifiedCount = 0;
  const scheduler = new UpdateScheduler({
    getCurrentVersion: () => "0.0.3",
    getDismissedTag: () => null,
    checkFn: async () => ({ hasUpdate: false }),
    onUpdateAvailable: () => {
      notifiedCount += 1;
    }
  });
  await scheduler.runScheduledCheck();
  check("没有新版本：不应该触发提醒", notifiedCount === 0, `got ${notifiedCount}`);
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll update-checker cases passed.`);
