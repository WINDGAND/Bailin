#!/usr/bin/env node
/**
 * 百灵 Bailin · 渲染层 a11y 自动扫描（axe-core + puppeteer）
 *
 * 用途：
 *   把 4 个 renderer 窗口的 HTML 在普通 Chromium 里加载，注入 axe-core，
 *   输出 WCAG 2.1 AA 违规清单。**只能扫渲染层 DOM/ARIA/对比度**，
 *   不能验证 Electron 特有的窗口透明 / mouseignore / IPC。
 *
 * 前置条件：
 *   1. 先在另一个终端跑 `pnpm dev`，确认 vite 已在 http://127.0.0.1:5173 起来
 *   2. 安装可选依赖（首次跑前）：
 *      cd apps/desktop && pnpm add -D puppeteer axe-core
 *
 * 用法：
 *   node apps/desktop/scripts/a11y-scan.mjs            # 扫全部 4 个窗口
 *   node apps/desktop/scripts/a11y-scan.mjs --window=chat
 *   node apps/desktop/scripts/a11y-scan.mjs --json     # 输出 JSON 到 stdout
 *
 * 输出：
 *   控制台：人类可读的 violations 摘要（按 impact 排序）
 *   /tmp/bailin-a11y-{timestamp}.json：完整 axe-core 结果（含 nodes / 修复建议）
 *
 * 已知盲区（手工 NVDA 测试才能覆盖）：
 *   - 屏幕阅读器的实际朗读体验
 *   - 焦点管理（dialog / menu / popover 开关时焦点流转）
 *   - 键盘导航（ArrowKeys / Home/End / Esc）
 *   - reduced-motion / dark mode 切换
 *   → 参见 docs/a11y/NVDA-TEST-SCRIPT.md
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEV_URL = process.env.VITE_DEV_SERVER || "http://127.0.0.1:5173";

/** 4 个 renderer 窗口的入口 HTML。 */
const WINDOWS = [
  { id: "pet", path: "/pet.html", note: "桌宠主窗口（透明，无可见 chrome）" },
  { id: "chat", path: "/chat.html", note: "聊天窗口" },
  { id: "settings", path: "/settings.html", note: "设置窗口" },
  { id: "bubble", path: "/proactive-bubble.html", note: "主动气泡窗口" }
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { jsonOnly: false, window: null };
  for (const a of args) {
    if (a === "--json") out.jsonOnly = true;
    else if (a.startsWith("--window=")) out.window = a.slice("--window=".length);
  }
  return out;
}

async function loadAxeSource() {
  // 用动态 import 避免硬依赖；如果用户没装会给清晰提示。
  try {
    const axe = await import("axe-core");
    return axe.source;
  } catch {
    console.error(
      "\n[a11y-scan] axe-core 未安装。请先运行：\n  cd apps/desktop && pnpm add -D puppeteer axe-core\n"
    );
    process.exit(1);
  }
}

async function loadPuppeteer() {
  try {
    return await import("puppeteer");
  } catch {
    console.error(
      "\n[a11y-scan] puppeteer 未安装。请先运行：\n  cd apps/desktop && pnpm add -D puppeteer axe-core\n"
    );
    process.exit(1);
  }
}

async function checkViteAlive(url) {
  try {
    const res = await fetch(`${url}/settings.html`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error(
      `\n[a11y-scan] Vite dev server 未响应（${url}）：${err?.message ?? err}\n` +
        "  请先在另一终端运行 `pnpm dev`，确认 vite 启动后再跑本脚本。\n"
    );
    return false;
  }
}

async function scanOne(browser, axeSource, win, opts) {
  const url = `${DEV_URL}${win.path}`;
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  // 模拟桌宠/聊天/设置窗口的视口尺寸（更接近真实使用）
  const sizes = {
    pet: { width: 280, height: 360 },
    chat: { width: 380, height: 480 },
    settings: { width: 1080, height: 720 },
    bubble: { width: 320, height: 160 }
  };
  await page.setViewport(sizes[win.id] ?? { width: 1024, height: 768 });

  // 静默 nuwa preload API（renderer 在普通 Chromium 没有 window.nuwa）。
  await page.evaluateOnNewDocument(() => {
    window.nuwa = new Proxy(
      {},
      {
        get() {
          return new Proxy(function () {}, {
            get(_, key) {
              if (key === "then") return undefined; // 防止当成 thenable
              return () => Promise.resolve(null);
            },
            apply: () => Promise.resolve(null)
          });
        }
      }
    );
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (err) {
    console.error(`[a11y-scan] ✗ ${win.id}: navigate failed - ${err?.message ?? err}`);
    await page.close();
    return null;
  }

  // 等 React render 完
  await new Promise((r) => setTimeout(r, 1500));

  // 注入 axe-core + run
  await page.evaluate(axeSource);
  const results = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]
      }
    });
  });

  await page.close();

  return {
    window: win.id,
    path: win.path,
    note: win.note,
    url,
    violations: results.violations,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length
  };
}

function formatHumanReport(allResults) {
  const lines = [];
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(" 百灵 Bailin · a11y 自动扫描结果（axe-core）");
  lines.push("═══════════════════════════════════════════════════════════════\n");

  let totalViolations = 0;
  let criticalCount = 0;
  let seriousCount = 0;

  for (const result of allResults) {
    if (!result) continue;
    lines.push(`📋 [${result.window}] ${result.path}   (${result.note})`);
    lines.push(`   ✓ ${result.passes} passed · ⚠ ${result.violations.length} violations · ? ${result.incomplete} incomplete\n`);

    if (result.violations.length === 0) {
      lines.push("   ✅ 无 axe-core 违规。");
    } else {
      // 按 impact 排序：critical > serious > moderate > minor
      const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      const sorted = [...result.violations].sort(
        (a, b) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9)
      );
      for (const v of sorted) {
        const icon = { critical: "🔴", serious: "🟠", moderate: "🟡", minor: "🟢" }[v.impact] ?? "·";
        lines.push(`   ${icon} [${v.impact}] ${v.id}  (×${v.nodes.length})`);
        lines.push(`      ${v.help}`);
        lines.push(`      ${v.helpUrl}`);
        for (const node of v.nodes.slice(0, 3)) {
          lines.push(`      › ${node.target.join(" ")}`);
        }
        if (v.nodes.length > 3) {
          lines.push(`      › ... and ${v.nodes.length - 3} more`);
        }
        totalViolations++;
        if (v.impact === "critical") criticalCount++;
        if (v.impact === "serious") seriousCount++;
      }
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(` 汇总：${totalViolations} 条 violations  ·  critical ${criticalCount} · serious ${seriousCount}`);
  lines.push("═══════════════════════════════════════════════════════════════");
  return lines.join("\n");
}

async function main() {
  const opts = parseArgs();

  if (!(await checkViteAlive(DEV_URL))) process.exit(1);

  const axeSource = await loadAxeSource();
  const puppeteer = await loadPuppeteer();

  console.error(`[a11y-scan] launching headless Chromium…`);
  const browser = await puppeteer.default.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const targets = opts.window
    ? WINDOWS.filter((w) => w.id === opts.window)
    : WINDOWS;
  if (targets.length === 0) {
    console.error(`[a11y-scan] 未找到 window=${opts.window}；可选：${WINDOWS.map((w) => w.id).join(", ")}`);
    await browser.close();
    process.exit(1);
  }

  const results = [];
  for (const w of targets) {
    console.error(`[a11y-scan] scanning ${w.id} (${w.path})…`);
    results.push(await scanOne(browser, axeSource, w, opts));
  }

  await browser.close();

  if (opts.jsonOnly) {
    process.stdout.write(JSON.stringify(results, null, 2));
    return;
  }

  console.log(formatHumanReport(results));

  // 完整 JSON 写到 /tmp（Windows 上写到 OS temp）
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(
    process.platform === "win32" ? (process.env.TEMP || ".") : "/tmp",
    `bailin-a11y-${ts}.json`
  );
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n[a11y-scan] full JSON written to ${outPath}`);

  // 有 critical / serious 违规时退出码非 0，方便 CI 集成
  const hasBlocker = results
    .flatMap((r) => r?.violations ?? [])
    .some((v) => v.impact === "critical" || v.impact === "serious");
  process.exit(hasBlocker ? 1 : 0);
}

void main().catch((err) => {
  console.error("[a11y-scan] fatal:", err);
  process.exit(1);
});
