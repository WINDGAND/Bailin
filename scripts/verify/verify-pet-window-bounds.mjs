#!/usr/bin/env node
/**
 * 桌宠窗口边界限制回归测试（纯数学，不依赖 Electron screen API）。
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const boundsPath = resolve(repoRoot, "apps/desktop/dist/main/main/windows/window-bounds.js");

const { clampPositionToWorkArea } = require(boundsPath);

const work = { x: 0, y: 0, width: 1920, height: 1040 };
const petW = 220;
const petH = 240;

function assertEq(name, actual, expected) {
  if (actual.x !== expected.x || actual.y !== expected.y) {
    console.error(`FAIL ${name}: got (${actual.x}, ${actual.y}), want (${expected.x}, ${expected.y})`);
    process.exit(1);
  }
  console.log(`OK ${name}`);
}

// 右下角默认位置应不变
assertEq("default bottom-right", clampPositionToWorkArea(1676, 776, petW, petH, work), {
  x: 1676,
  y: 776
});

// 完全在屏幕外（右下）应拉回
assertEq("off-screen bottom-right", clampPositionToWorkArea(3000, 2000, petW, petH, work), {
  x: 1920 - petW - 8,
  y: 1040 - petH - 8
});

// 完全在屏幕外（左上）应拉回
assertEq("off-screen top-left", clampPositionToWorkArea(-500, -500, petW, petH, work), {
  x: 8,
  y: 8
});

// 部分越界只夹必要方向
assertEq("partial overflow x", clampPositionToWorkArea(1800, 400, petW, petH, work), {
  x: 1920 - petW - 8,
  y: 400
});

console.log("verify-pet-window-bounds: all passed");
