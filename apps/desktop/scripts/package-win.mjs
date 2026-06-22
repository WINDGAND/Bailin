#!/usr/bin/env node
/**
 * Windows 安装包：pnpm deploy 展平 workspace 依赖 → electron-builder (NSIS)。
 *
 * NSIS 受 Windows MAX_PATH 限制，staging 目录需尽量短（如 C:\r\p）。
 * 若仓库路径含中文或较深，请先创建 ASCII worktree 再打包：
 *   git worktree add C:\r HEAD
 *   cd C:\r && pnpm install && pnpm package:win
 *
 * 用法（仓库根目录）：pnpm package:win
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const releaseOut = join(desktopRoot, "release");

function hasNonAsciiPath(p) {
  return /[^\u0000-\u007f]/.test(p);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function rmDirSafe(dir) {
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  } catch (err) {
    console.warn(`[package-win] could not remove ${dir}: ${err.message}`);
  }
}

function resolveStagingRoot() {
  if (process.platform === "win32") {
    if (repoRoot.startsWith("C:\\r") || repoRoot.startsWith("C:/r")) {
      return "C:\\r\\p";
    }
    if (hasNonAsciiPath(repoRoot)) {
      console.error(
        "[package-win] 当前仓库路径含非 ASCII 字符，NSIS 无法可靠打包。\n" +
          "请先执行：git worktree add C:\\r HEAD\n" +
          "然后在 C:\\r 目录运行：pnpm install && pnpm package:win"
      );
      process.exit(1);
    }
    return resolve(desktopRoot, ".pack-staging");
  }
  return resolve(desktopRoot, ".pack-staging");
}

console.log("[package-win] building workspace + desktop…");
if (!process.argv.includes("--skip-build")) {
  run("pnpm", ["build"], { cwd: repoRoot });

  console.log("[package-win] rebuilding better-sqlite3 for Electron…");
  run("pnpm", ["--filter", "@bailin/desktop", "exec", "electron-rebuild", "-f", "-w", "better-sqlite3"], {
    cwd: repoRoot
  });
} else {
  console.log("[package-win] --skip-build, using existing dist/");
}

const stagingRoot = resolveStagingRoot();
rmDirSafe(stagingRoot);
mkdirSync(stagingRoot, { recursive: true });

console.log(`[package-win] pnpm deploy → ${stagingRoot} …`);
run(
  "pnpm",
  ["--filter", "@bailin/desktop", "deploy", "--ignore-scripts", stagingRoot],
  { cwd: repoRoot }
);

console.log("[package-win] rebuild better-sqlite3 in staging…");
run("pnpm", ["exec", "electron-rebuild", "-f", "-w", "better-sqlite3"], { cwd: stagingRoot });

for (const dir of ["dist", "resources"]) {
  const src = join(desktopRoot, dir);
  const dest = join(stagingRoot, dir);
  if (!existsSync(src)) {
    console.error(`[package-win] missing ${src}`);
    process.exit(1);
  }
  cpSync(src, dest, { recursive: true });
}

const assetsLogo = join(repoRoot, "assets", "logo.png");
if (existsSync(assetsLogo)) {
  cpSync(assetsLogo, join(stagingRoot, "resources", "logo.png"));
  cpSync(assetsLogo, join(desktopRoot, "resources", "logo.png"));
}

console.log("[package-win] generate icon.ico from logo.png …");
run("node", [join(desktopRoot, "scripts/generate-win-icon.mjs"), stagingRoot]);

console.log(`[package-win] electron-builder (dir) in ${stagingRoot}…`);
const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/",
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
  PUPPETEER_SKIP_DOWNLOAD: process.env.PUPPETEER_SKIP_DOWNLOAD ?? "true"
};
run("pnpm", ["exec", "electron-builder", "--win", "dir", "--x64"], {
  cwd: stagingRoot,
  env
});

console.log("[package-win] embed product icon into exe …");
run("node", [join(desktopRoot, "scripts/embed-win-icon.mjs"), stagingRoot], { cwd: stagingRoot });

console.log("[package-win] electron-builder (NSIS) …");
const unpacked = join(stagingRoot, "release", "win-unpacked");
run("pnpm", ["exec", "electron-builder", "--prepackaged", unpacked, "--win", "nsis", "--x64"], {
  cwd: stagingRoot,
  env
});

const builderRelease = join(stagingRoot, "release");
rmDirSafe(releaseOut);
mkdirSync(releaseOut, { recursive: true });
for (const name of readdirSync(builderRelease)) {
  cpSync(join(builderRelease, name), join(releaseOut, name), { recursive: true });
}

console.log(`[package-win] done → ${releaseOut}`);
for (const name of readdirSync(releaseOut)) {
  if (name.endsWith(".exe")) console.log(`  installer: ${join(releaseOut, name)}`);
}
