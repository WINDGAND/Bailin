#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");

function run(cmd, args, env = {}) {
  return spawn(cmd, args, {
    cwd: appRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env }
  });
}

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
