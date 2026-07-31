#!/usr/bin/env node
/**
 * apps/desktop postinstall：为 Electron 重建 better-sqlite3，失败时打印友好说明。
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  diagnoseInstallError,
  formatInstallHints,
  INSTALL_HINTS_BANNER
} from "./diagnose-install-error.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "../../apps/desktop");

const result = spawnSync(
  "pnpm",
  ["exec", "electron-rebuild", "-f", "-w", "better-sqlite3"],
  {
    cwd: desktopRoot,
    shell: process.platform === "win32",
    encoding: "utf8",
    env: process.env
  }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0) {
  const log = [result.stdout, result.stderr, "better-sqlite3", "electron-rebuild"].join("\n");
  if (!log.includes(INSTALL_HINTS_BANNER)) {
    const hints = diagnoseInstallError(log);
    process.stderr.write(formatInstallHints(hints));
  }
  process.exit(result.status ?? 1);
}
