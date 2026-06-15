#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, watch as fsWatch, statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");

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
    "@nuwa-pet/character-protocol",
    "--filter",
    "@nuwa-pet/nuwa-prompts",
    "--filter",
    "@nuwa-pet/pet-atlas-tools",
    "--filter",
    "@nuwa-pet/sprite-runtime",
    "--filter",
    "@nuwa-pet/starter-library",
    "run",
    "build"
  ],
  repoRoot
);

console.log("[dev] starting vite renderer + tsc main watch + electron…");

const vite = run("vite", ["--config", "vite.config.ts"]);
const mainBuild = run("tsc", ["-w", "-p", "tsconfig.main.json"]);
const preloadBuild = run("tsc", ["-w", "-p", "tsconfig.preload.json"]);

// ===== Electron 主进程 hot reload =====
//
// 默认行为：Electron 的 main process 改动**不会自动 reload**，必须手动 kill+重启。
// 这个 watcher 在 dist/main 文件变化（被 tsc -w 增量重编时触发）时自动重启 Electron，
// 让用户改完主进程 / orchestrator / adapter 代码后无需手动操作就能看到效果。
//
// 实现：fs.watch 监听 dist/main，去抖 800ms（避免 tsc 一次写 10 个文件就重启 10 次），
// kill 旧 Electron 进程，等退出后重新 spawn。
//
// 关闭机制：把 NUWA_PET_DEV_AUTO_RESTART=0 可以禁用（如果你正在调试需要稳定窗口）。

const distMainRoot = resolve(appRoot, "dist/main");
const autoRestart = process.env.NUWA_PET_DEV_AUTO_RESTART !== "0";
let electron = null;
let restartTimer = null;
let lastRestartAt = 0;

function spawnElectron(label = "fresh") {
  console.log(`[dev] electron ${label} starting…`);
  electron = run("electron", ["."], {
    NUWA_PET_DEV: "1",
    VITE_DEV_SERVER: "http://localhost:5173"
  });
  electron.on("exit", (code) => {
    if (restartTimer != null) return; // 我们主动重启的，不退出整个 dev
    console.log(`[dev] electron exited code=${code ?? 0}, shutting down dev…`);
    vite.kill();
    mainBuild.kill();
    preloadBuild.kill();
    process.exit(code ?? 0);
  });
}

function scheduleRestart(reason) {
  if (!autoRestart) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    const since = Date.now() - lastRestartAt;
    // 即使有大量文件变化，最少间隔 2 秒重启一次，避免抖动
    if (since < 2000) {
      scheduleRestart(reason);
      return;
    }
    lastRestartAt = Date.now();
    const old = electron;
    electron = null;
    if (old && !old.killed) {
      console.log(`[dev] main code changed (${reason}) → restarting electron…`);
      old.once("exit", () => spawnElectron("restart"));
      // 在 Windows 上 SIGTERM 不一定能干净退出，用 tree-kill 风格
      try {
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/F", "/T", "/PID", String(old.pid)], { shell: true });
        } else {
          old.kill("SIGTERM");
        }
      } catch {
        old.kill();
      }
    } else if (!old) {
      spawnElectron("restart");
    }
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

setTimeout(() => {
  spawnElectron("initial");
  watchDistMain();
}, 4000);
