#!/usr/bin/env node
/**
 * 快捷菜单焦点回归：打开时不应默认高亮首项（焦点在 menu 容器上）。
 * 纯静态检查源码约定，避免再引入「items[0].focus()」。
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const menuPath = resolve(repoRoot, "apps/desktop/src/renderer/pet/PetContextMenu.tsx");
const htmlPath = resolve(repoRoot, "apps/desktop/src/renderer/pet-menu.html");

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL ${name}`);
    process.exit(1);
  }
  console.log(`OK ${name}`);
}

const menuSrc = readFileSync(menuPath, "utf8");
const htmlSrc = readFileSync(htmlPath, "utf8");

assert(
  "does not auto-focus first menuitem",
  !/getMenuItems\(\)[\s\S]{0,80}items\[0\]\?\.focus\(/.test(menuSrc) &&
    !/items\[0\]\?\.focus\(/.test(menuSrc)
);
assert("focuses menu container instead", /menuRef\.current\?\.focus\(/.test(menuSrc));
assert("menu container is focusable", /tabIndex=\{-1\}/.test(menuSrc));
assert(
  "no inset outline on focus-visible (clips at radius)",
  !/outline-offset:\s*-2px/.test(htmlSrc)
);
assert(
  "first item has top corner radius for highlight",
  /\.pet-menu-item:first-child\s*\{[^}]*border-radius:\s*13px 13px 0 0/.test(htmlSrc)
);

console.log("verify-pet-menu-focus: all passed");
