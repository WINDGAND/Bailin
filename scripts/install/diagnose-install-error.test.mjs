import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagnoseInstallError, formatInstallHints } from "./diagnose-install-error.mjs";

describe("diagnoseInstallError", () => {
  it("归类 puppeteer Chrome 下载失败", () => {
    const log = `
node_modules/puppeteer postinstall$ node install.mjs
Error: ERROR: Failed to set up chrome v149.0.7827.22! Set "PUPPETEER_SKIP_DOWNLOAD" env variable to skip download.
All providers failed for chrome 149.0.7827.22:
- DefaultProvider: The browser folder exists but the executable is missing
`;
    const hints = diagnoseInstallError(log);
    assert.ok(hints.some((h) => h.id === "puppeteer-chrome"));
    assert.match(formatInstallHints(hints), /可安全跳过/);
  });

  it("归类证书失败 + better-sqlite3 / VS 缺失", () => {
    const log = `
node_modules/better-sqlite3 install$ prebuild-install || node-gyp rebuild --release
prebuild-install warn install unable to verify the first certificate
gyp ERR! find VS
gyp ERR! find VS You need to install the latest version of Visual Studio
gyp ERR! find VS including the "Desktop development with C++" workload.
gyp ERR! stack Error: Could not find any Visual Studio installation to use
└─ Failed in 3.1s at E:\\Bailin\\node_modules\\better-sqlite3
`;
    const hints = diagnoseInstallError(log);
    const ids = hints.map((h) => h.id);
    assert.ok(ids.includes("tls-certificate"));
    assert.ok(ids.includes("better-sqlite3-native"));
    assert.match(formatInstallHints(hints), /Build Tools/);
  });

  it("未知错误给出通用引导", () => {
    const hints = diagnoseInstallError("something completely unrelated exploded");
    assert.equal(hints[0].id, "unknown");
    assert.match(formatInstallHints(hints), /pnpm run setup/);
  });
});
