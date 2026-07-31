#!/usr/bin/env node
/**
 * 替代 better-sqlite3 自带的 install 脚本：执行相同的
 *   prebuild-install || node-gyp rebuild --release
 * 失败时追加 Bailin 中文说明。
 *
 * 通过 package.json → pnpm.packageExtensions 注入；cwd 为 better-sqlite3 包目录。
 */
import { spawn } from "node:child_process";
import { diagnoseInstallError, formatInstallHints } from "./diagnose-install-error.mjs";

function runShell(command) {
  return new Promise((resolvePromise) => {
    const chunks = [];
    const child = spawn(command, {
      shell: true,
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"]
    });
    const tee = (buf, stream) => {
      chunks.push(buf);
      stream.write(buf);
    };
    child.stdout?.on("data", (b) => tee(b, process.stdout));
    child.stderr?.on("data", (b) => tee(b, process.stderr));
    child.on("error", (err) => {
      chunks.push(Buffer.from(String(err.stack || err)));
      resolvePromise({ code: 1, log: Buffer.concat(chunks).toString("utf8") });
    });
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 1, log: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

const { code, log } = await runShell("prebuild-install || node-gyp rebuild --release");
if (code !== 0) {
  const hints = diagnoseInstallError(`${log}\nbetter-sqlite3`);
  process.stderr.write(formatInstallHints(hints));
  process.exit(code);
}
