#!/usr/bin/env node
/**
 * 回归检查：sanitizeApiKey 必须清理掉从网页复制粘贴 API Key 时可能带入的不可见字符
 * （零宽空格/BOM/不间断空格/换行），否则 Bearer token 鉴权会静默失败，且用户肉眼
 * 完全看不出 Key 有问题——这是"用户本地有余额、Key 确认无误，但验证失败"类反馈里
 * 一类很难自证的根因，需要在写入配置前统一清洗防御。
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const modPath = resolve(repoRoot, "apps/desktop/dist/main/shared/sanitize-api-key.js");

const { sanitizeApiKey } = require(modPath);

let failed = 0;
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

check("普通 Key 原样保留", sanitizeApiKey("sk-abc123"), "sk-abc123");
check("首尾空格被去掉", sanitizeApiKey("  sk-abc123  "), "sk-abc123");
check("零宽空格(U+200B)被去掉", sanitizeApiKey("sk-abc\u200B123"), "sk-abc123");
check("零宽连字符(U+200D)被去掉", sanitizeApiKey("sk-abc\u200D123"), "sk-abc123");
check("BOM/ZWNBSP(U+FEFF)被去掉", sanitizeApiKey("\uFEFFsk-abc123"), "sk-abc123");
check("不间断空格(U+00A0)被去掉", sanitizeApiKey("sk-abc\u00A0123"), "sk-abc123");
check("内部换行被去掉（网页表格复制常见）", sanitizeApiKey("sk-abc\n123"), "sk-abc123");
check("空字符串保持空字符串", sanitizeApiKey(""), "");

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll sanitizeApiKey cases passed.`);
