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

// ===== Electron 主进程 reload 策略 =====
//
// Renderer 代码（renderer/**）走 Vite HMR，本地热更，不会重启窗口。
// 但主进程 (main / preload / shared) 改动属于 Electron 进程级代码，
// Electron 没有原生 HMR——任何主进程改动都必须 kill + respawn 整个 app。
// 这意味着重启时桌宠 + 设置 + 聊天窗会一起消失再出现，视觉上是"全局闪屏"。
//
// 为了避免这种闪屏成为高频骚扰，本 watcher 默认**关闭**自动重启；
// 改完主进程代码后，在 dev 终端里输入 r + Enter 即可触发一次重启。
//
// 想恢复旧的"主进程一改就自动重启"行为：
//   NUWA_PET_DEV_AUTO_RESTART=1 pnpm dev
//
// 也支持 NUWA_PET_DEV_AUTO_RESTART=0 显式关闭，与默认行为一致。

const distMainRoot = resolve(appRoot, "dist/main");
const autoRestart = process.env.NUWA_PET_DEV_AUTO_RESTART === "1";
let electron = null;
let restartTimer = null;
let lastRestartAt = 0;
let restartingElectron = false;

function spawnElectron(label = "fresh") {
  console.log(`[dev] electron ${label} starting…`);
  electron = run("electron", ["."], {
    NUWA_PET_DEV: "1",
    VITE_DEV_SERVER: "http://localhost:5173"
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

setTimeout(() => {
  spawnElectron("initial");
  watchDistMain();
  setupManualRestart();
}, 4000);

/**
 * 让用户在 dev 终端里手动触发主进程重启，避免每次主进程改动都"全局闪屏"。
 *   r + Enter / restart + Enter  → 立即重启 Electron
 *   q + Enter / quit + Enter     → 退出整个 dev
 * 自动模式（NUWA_PET_DEV_AUTO_RESTART=1）下仍保留 stdin 入口。
 */
function setupManualRestart() {
  if (autoRestart) {
    console.log(
      "[dev] main process auto-restart: ON (NUWA_PET_DEV_AUTO_RESTART=1)。" +
        " 改主进程代码会自动重启 Electron。"
    );
  } else {
    console.log(
      "[dev] main process auto-restart: OFF。" +
        " Renderer 走 Vite HMR；主进程改动不会自动重启窗口。" +
        " 在本终端输入 r + Enter 可手动重启 Electron。"
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
