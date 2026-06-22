#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, watch as fsWatch, statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");

/** Windows 终端默认 GBK，Electron/Node 日志为 UTF-8 时会乱码。 */
if (process.platform === "win32") {
  spawnSync("chcp", ["65001"], { shell: true, stdio: "ignore" });
}

const WORKSPACE_PACKAGES = [
  ["@bailin/character-protocol", "packages/character-protocol/dist/index.d.ts"],
  ["@bailin/prompts", "packages/prompts/dist/index.d.ts"],
  ["@bailin/pet-atlas-tools", "packages/pet-atlas-tools/dist/index.d.ts"],
  ["@bailin/sprite-runtime", "packages/sprite-runtime/dist/index.d.ts"]
];

function assertWorkspacePackagesBuilt() {
  const missing = [];
  for (const [name, relPath] of WORKSPACE_PACKAGES) {
    const abs = resolve(repoRoot, relPath);
    if (!existsSync(abs)) missing.push(`${name} (${relPath})`);
  }
  if (missing.length > 0) {
    console.error("[dev] workspace packages are not built. Missing:");
    for (const line of missing) console.error(`  - ${line}`);
    console.error("[dev] run: pnpm -r --filter \"./packages/*\" run build");
    process.exit(1);
  }
}

function run(cmd, args, env = {}) {
  return spawn(cmd, args, {
    cwd: appRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env }
  });
}

function runChecked(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[dev] building workspace packages…");
runChecked(
  "pnpm",
  [
    "-r",
    "--filter",
    "@bailin/character-protocol",
    "--filter",
    "@bailin/prompts",
    "--filter",
    "@bailin/pet-atlas-tools",
    "--filter",
    "@bailin/sprite-runtime",
    "run",
    "build"
  ],
  repoRoot
);
assertWorkspacePackagesBuilt();

console.log("[dev] building main + preload (initial sync)…");
runChecked("pnpm", ["run", "build:main"], appRoot);
runChecked("pnpm", ["run", "build:preload"], appRoot);

const DEV_VITE_PORT = 5173;
const DEV_VITE_HOST = "127.0.0.1";
const DEV_VITE_URL = `http://${DEV_VITE_HOST}:${DEV_VITE_PORT}`;

/** 释放 dev 端口：上次 dev 未正常退出时，僵死的 Vite 会占着 5173，Electron 连到空壳 → 白屏。 */
function findListeningPidsOnPort(port) {
  const pids = new Set();
  if (process.platform === "win32") {
    const out = spawnSync("netstat", ["-ano"], { encoding: "utf8", shell: true });
    if (out.status !== 0) return pids;
    for (const line of out.stdout.split("\n")) {
      if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts.at(-1));
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return pids;
  }
  const out = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (out.status !== 0) return pids;
  for (const token of out.stdout.split(/\s+/)) {
    const pid = Number(token);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return pids;
}

function freeDevPort(port) {
  for (const pid of findListeningPidsOnPort(port)) {
    if (pid === process.pid) continue;
    console.warn(`[dev] port ${port} in use by pid ${pid}, stopping stale process…`);
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { shell: true, stdio: "ignore" });
    } else {
      spawnSync("kill", ["-9", String(pid)], { stdio: "ignore" });
    }
  }
}

async function waitForVite(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/settings.html`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        console.log(`[dev] vite ready at ${url}`);
        return;
      }
    } catch {
      // vite still booting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`[dev] vite did not become ready at ${url} within ${timeoutMs}ms`);
  process.exit(1);
}

console.log("[dev] starting vite renderer + tsc main watch + electron…");

freeDevPort(DEV_VITE_PORT);

const vite = run("vite", ["--config", "vite.config.ts"]);
vite.on("exit", (code) => {
  if (code != null && code !== 0) {
    console.error(`[dev] vite exited with code ${code}`);
    process.exit(code);
  }
});
const mainBuild = run("tsc", ["-w", "-p", "tsconfig.main.json"]);
const preloadBuild = run("tsc", ["-w", "-p", "tsconfig.preload.json"]);

// ===== Electron 主进程 reload 策略 =====
//
// Renderer 代码（renderer/**）走 Vite HMR，本地热更，不会重启窗口。
// 但主进程 (main / preload / shared) 改动属于 Electron 进程级代码，
// Electron 没有原生 HMR——任何主进程改动都必须 kill + respawn 整个 app。
// 这意味着重启时桌宠 + 设置 + 聊天窗会一起消失再出现，视觉上是"全局闪屏"。
//
// 主进程改动后默认自动重启 Electron（避免 preload 已更新但 main 未重启导致 IPC 缺失）。
// 若不想闪屏可设 BAILIN_DEV_AUTO_RESTART=0，改完主进程后在 dev 终端输入 r + Enter。

const distMainRoot = resolve(appRoot, "dist/main");
const autoRestart = process.env.BAILIN_DEV_AUTO_RESTART !== "0";
let electron = null;
let restartTimer = null;
let lastRestartAt = 0;
let restartingElectron = false;

function spawnElectron(label = "fresh") {
  console.log(`[dev] electron ${label} starting…`);
  electron = run("electron", ["."], {
    BAILIN_DEV: "1",
    VITE_DEV_SERVER: DEV_VITE_URL
  });
  electron.on("exit", (code) => {
    if (restartingElectron) {
      restartingElectron = false;
      return;
    }
    if (restartTimer != null) return; // 我们主动重启的，不退出整个 dev
    console.log(`[dev] electron exited code=${code ?? 0}, shutting down dev…`);
    vite.kill();
    mainBuild.kill();
    preloadBuild.kill();
    process.exit(code ?? 0);
  });
}

function triggerRestart(reason) {
  const since = Date.now() - lastRestartAt;
  // 即使被快速连按，最少间隔 2 秒一次，避免 Electron 还没起来又被杀
  if (since < 2000) {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      triggerRestart(reason);
    }, 2000 - since);
    return;
  }
  lastRestartAt = Date.now();
  const old = electron;
  electron = null;
  if (old && !old.killed) {
    console.log(`[dev] restarting electron (${reason})…`);
    restartingElectron = true;
    old.once("exit", () => spawnElectron("restart"));
    if (process.platform === "win32") {
      try {
        spawnSync("taskkill", ["/F", "/T", "/PID", String(old.pid)], { shell: true });
      } catch {
        old.kill();
      }
    } else {
      old.kill("SIGTERM");
    }
  } else if (!old) {
    spawnElectron("restart");
  }
}

function scheduleRestart(reason) {
  if (!autoRestart) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    triggerRestart(reason);
  }, 800);
}

function watchDistMain() {
  if (!existsSync(distMainRoot)) return;
  try {
    // recursive 在 Windows 上需要 Node 16+，对 macOS 也支持
    fsWatch(distMainRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".js")) return; // 只关心代码变化
      scheduleRestart(filename);
    });
    console.log(`[dev] watching ${distMainRoot} for main process hot reload`);
  } catch (e) {
    console.warn(`[dev] dist watch failed (${e?.message ?? e}), main hot reload disabled`);
  }
}

void waitForVite(DEV_VITE_URL).then(() => {
  spawnElectron("initial");
  watchDistMain();
  setupManualRestart();
});

/**
 * 让用户在 dev 终端里手动触发主进程重启，避免每次主进程改动都"全局闪屏"。
 *   r + Enter / restart + Enter  → 立即重启 Electron
 *   q + Enter / quit + Enter     → 退出整个 dev
 * 自动模式（BAILIN_DEV_AUTO_RESTART=1）下仍保留 stdin 入口。
 */
function setupManualRestart() {
  if (autoRestart) {
    console.log(
      "[dev] main process auto-restart: ON. " +
        "Main/preload edits restart Electron (BAILIN_DEV_AUTO_RESTART=0 to disable)."
    );
  } else {
    console.log(
      "[dev] main process auto-restart: OFF. " +
        "Renderer uses Vite HMR; type r + Enter in this terminal to restart Electron."
    );
  }
  if (!process.stdin.isTTY) return;
  try {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      const cmd = String(chunk).trim().toLowerCase();
      if (cmd === "r" || cmd === "restart") {
        triggerRestart("manual");
      } else if (cmd === "q" || cmd === "quit" || cmd === "exit") {
        console.log("[dev] quit requested via stdin");
        restartingElectron = false;
        if (electron && !electron.killed) {
          if (process.platform === "win32") {
            try {
              spawnSync("taskkill", ["/F", "/T", "/PID", String(electron.pid)], { shell: true });
            } catch {
              electron.kill();
            }
          } else {
            electron.kill("SIGTERM");
          }
        }
        vite.kill();
        mainBuild.kill();
        preloadBuild.kill();
        process.exit(0);
      }
    });
  } catch (e) {
    console.warn(`[dev] stdin manual restart unavailable: ${e?.message ?? e}`);
  }
}
