#!/usr/bin/env node
/**
 * 独立复现 NuwaOrchestrator 的 3 步串行调用。
 * 不动 Electron / IPC / SQLite，直接走 DeepSeek，把每一步的 raw response、
 * extractJSON 结果、zod 校验错误打出来。
 *
 * 用法：node scripts/debug-orchestrate.mjs 蔡徐坤 public-figure companion
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const toUrl = (p) => pathToFileURL(p).href;

// 读 .env.dev
const envPath = resolve(root, ".env.dev");
const envRaw = readFileSync(envPath, "utf8");
for (const line of envRaw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const KEY = process.env.NUWA_PET_LLM_API_KEY;
const BASE = process.env.NUWA_PET_LLM_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.NUWA_PET_LLM_MODEL ?? "deepseek-chat";
if (!KEY) throw new Error("NUWA_PET_LLM_API_KEY missing");

// 直接硬编码：PowerShell 中文参数易乱码
const characterName = "蔡徐坤";
const sourceType = "public-figure";
const track = "companion";

console.log(`[debug] target = ${characterName} / ${sourceType} / ${track}`);
console.log(`[debug] model = ${MODEL} @ ${BASE}\n`);

// 直接 import 已构建好的 packages
const { buildCharacterCardPrompt, buildAppearanceResearchPrompt, buildSpriteFromAppearancePrompt } =
  await import(toUrl(resolve(root, "packages/nuwa-prompts/dist/index.js")));
const {
  parseCard,
  parseSprite,
  AppearanceSpecSchema,
  SCHEMA_VERSION
} = await import(toUrl(resolve(root, "packages/character-protocol/dist/index.js")));

async function llmCall(systemPrompt, userMsg, maxTokens) {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg }
    ],
    temperature: 0.4,
    max_tokens: maxTokens,
    stream: false
  };
  const startedAt = Date.now();
  const res = await fetch(`${BASE.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`
    },
    body: JSON.stringify(body)
  });
  const elapsed = Date.now() - startedAt;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  const fr = json.choices?.[0]?.finish_reason ?? "?";
  return { text, finishReason: fr, elapsed, usage: json.usage };
}

function extractJSON(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch {}
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1]); } catch {}
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  return null;
}

// ===== Step 1: card =====
console.log("======== STEP 1: 人格卡 ========");
{
  const { system, user } = buildCharacterCardPrompt({ characterName, sourceType, track });
  console.log(`[step1] system prompt 长度 = ${system.length}, user prompt 长度 = ${user.length}`);
  const r = await llmCall(system, user, 3500);
  console.log(`[step1] finish=${r.finishReason} usage=${JSON.stringify(r.usage)} elapsed=${r.elapsed}ms`);
  console.log(`[step1] raw response (头 500 字符):`);
  console.log(r.text.slice(0, 500));
  console.log(`[step1] raw response (尾 200 字符):`);
  console.log(r.text.slice(-200));
  const json = extractJSON(r.text);
  console.log(`[step1] extractJSON ok = ${json != null}`);
  if (json) {
    const seeded = { ...json, id: "temp", schemaVersion: SCHEMA_VERSION, createdAt: Date.now(), updatedAt: Date.now() };
    const parsed = parseCard(seeded);
    console.log(`[step1] zod parse ok = ${parsed.ok}`);
    if (!parsed.ok) {
      console.log(`[step1] zod errors:`);
      for (const e of parsed.errors ?? []) console.log(`  - ${e.path}: ${e.message}`);
    }
  }
}

// ===== Step 2: appearance =====
console.log("\n======== STEP 2: 外貌调研 ========");
let appearance = null;
{
  const { system, user } = buildAppearanceResearchPrompt({ characterName, sourceType, track });
  console.log(`[step2] system prompt 长度 = ${system.length}, user prompt 长度 = ${user.length}`);
  const r = await llmCall(system, user, 2500);
  console.log(`[step2] finish=${r.finishReason} usage=${JSON.stringify(r.usage)} elapsed=${r.elapsed}ms`);
  console.log(`[step2] raw response (头 500 字符):`);
  console.log(r.text.slice(0, 500));
  console.log(`[step2] raw response (尾 200 字符):`);
  console.log(r.text.slice(-200));
  const json = extractJSON(r.text);
  console.log(`[step2] extractJSON ok = ${json != null}`);
  if (json) {
    const parsed = AppearanceSpecSchema.safeParse(json);
    console.log(`[step2] zod parse ok = ${parsed.success}`);
    if (parsed.success) {
      appearance = parsed.data;
    } else {
      console.log(`[step2] zod errors:`);
      for (const e of parsed.error.errors.slice(0, 12)) console.log(`  - ${e.path.join(".")}: ${e.message}`);
    }
  }
}

// 自动修复（与 orchestrator 一致）
function repairSpriteCommonViolations(obj) {
  const dsl = obj.dsl;
  if (!dsl?.parts) return obj;
  const map = { ellipse: "circle", oval: "circle", square: "rect", triangle: "rect", arc: "circle", polygon: "rect", box: "rect" };
  for (const part of dsl.parts) {
    const shapes = part.shapes;
    if (!Array.isArray(shapes)) continue;
    for (const s of shapes) {
      if (typeof s.type === "string" && map[s.type]) s.type = map[s.type];
      if (s.type === "circle" && (s.r == null || typeof s.r !== "number")) {
        if (typeof s.w === "number") s.r = Math.max(1, Math.floor(s.w / 2));
        else s.r = 4;
      }
      if (s.type === "rect") {
        if (typeof s.w !== "number") s.w = 1;
        if (typeof s.h !== "number") s.h = 1;
      }
    }
  }
  return obj;
}

// ===== Step 3: sprite =====
if (!appearance) {
  console.log("\n[step3] 跳过：上一步 appearance 失败");
} else {
  console.log("\n======== STEP 3: sprite 转译 ========");
  const { system, user } = buildSpriteFromAppearancePrompt({ characterName, appearance });
  console.log(`[step3] system prompt 长度 = ${system.length}, user prompt 长度 = ${user.length}`);
  const r = await llmCall(system, user, 4500);
  console.log(`[step3] finish=${r.finishReason} usage=${JSON.stringify(r.usage)} elapsed=${r.elapsed}ms`);
  console.log(`[step3] raw response (头 500 字符):`);
  console.log(r.text.slice(0, 500));
  console.log(`[step3] raw response (尾 200 字符):`);
  console.log(r.text.slice(-200));
  const json = extractJSON(r.text);
  console.log(`[step3] extractJSON ok = ${json != null}`);
  if (json) {
    const repaired = repairSpriteCommonViolations(json);
    const parsed = parseSprite({ ...repaired, schemaVersion: SCHEMA_VERSION });
    console.log(`[step3] zod parse ok (post-repair) = ${parsed.ok}`);
    if (!parsed.ok) {
      console.log(`[step3] zod errors (前 20 条):`);
      for (const e of (parsed.errors ?? []).slice(0, 20)) console.log(`  - ${e.path}: ${e.message}`);
    }
  }
}

console.log("\n[debug] done");
