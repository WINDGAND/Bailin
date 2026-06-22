#!/usr/bin/env node
/**
 * 将 icon.ico 写入已打包的 Windows exe（绕过 signAndEditExecutable / winCodeSign）。
 * 用法：node embed-win-icon.mjs <stagingRoot>
 */
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const stagingRoot = resolve(process.argv[2] ?? ".");
const icoPath = join(stagingRoot, "resources", "icon.ico");
const releaseDir = join(stagingRoot, "release", "win-unpacked");

if (!existsSync(icoPath)) {
  console.error(`[embed-win-icon] missing ${icoPath}`);
  process.exit(1);
}
if (!existsSync(releaseDir)) {
  console.error(`[embed-win-icon] missing ${releaseDir}`);
  process.exit(1);
}

const exe = readdirSync(releaseDir).find((n) => n.endsWith(".exe") && !n.toLowerCase().includes("uninstall"));
if (!exe) {
  console.error(`[embed-win-icon] no main exe in ${releaseDir}`);
  process.exit(1);
}

const exePath = join(releaseDir, exe);
const rceditBin = require.resolve("rcedit/bin/rcedit.exe");
console.log(`[embed-win-icon] ${exePath} ← ${icoPath}`);
const r = spawnSync(rceditBin, [exePath, "--set-icon", icoPath], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("[embed-win-icon] done");
