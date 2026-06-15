#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

setTimeout(() => {
  const electron = run("electron", ["."], { NUWA_PET_DEV: "1", VITE_DEV_SERVER: "http://localhost:5173" });
  electron.on("exit", (code) => {
    vite.kill();
    mainBuild.kill();
    preloadBuild.kill();
    process.exit(code ?? 0);
  });
}, 4000);
