#!/usr/bin/env node
// 独立 smoke 脚本：验证 OhMyGPT chat/completions + gpt-4o-mini-search-preview 真的能联网搜索。
// 读取 .env.dev 取 base URL + api key + model（model 可以临时覆盖为 search-preview）。
// 期望：回包里 choices[0].message.annotations[].url_citation 有 URL，正文提到合理答案。
//
// 跑法：node scripts/smoke-ohmygpt-search.mjs
//   或：node scripts/smoke-ohmygpt-search.mjs "<自定义问题>"

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path) {
  const txt = readFileSync(path, "utf-8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

function chatCompletionsUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed + "/chat/completions" : trimmed + "/v1/chat/completions";
}

async function main() {
  const envPath = resolve(process.cwd(), ".env.dev");
  const env = loadEnv(envPath);
  const baseUrl = env.NUWA_PET_LLM_BASE_URL;
  const apiKey = env.NUWA_PET_LLM_API_KEY;
  if (!baseUrl || !apiKey) {
    console.error("[smoke] .env.dev 缺少 NUWA_PET_LLM_BASE_URL / NUWA_PET_LLM_API_KEY");
    process.exit(2);
  }
  const model = "gpt-4o-mini-search-preview";
  const question =
    process.argv[2] ??
    "请简要介绍 2024 年诺贝尔物理学奖得主是谁，做了什么贡献？只要 3-5 句。";

  const url = chatCompletionsUrl(baseUrl);
  console.log("[smoke] POST", url);
  console.log("[smoke] model =", model);
  console.log("[smoke] question =", question);

  const body = {
    model,
    messages: [{ role: "user", content: question }],
    max_tokens: 500,
    web_search_options: { search_context_size: "medium" }
  };

  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error("[smoke] 网络错误：", e.message ?? String(e));
    process.exit(3);
  }

  const elapsed = Date.now() - startedAt;
  console.log(`[smoke] HTTP ${res.status} · 用时 ${elapsed}ms`);
  const txt = await res.text();
  if (!res.ok) {
    console.error("[smoke] 失败正文：", txt.slice(0, 1200));
    process.exit(4);
  }

  let json;
  try {
    json = JSON.parse(txt);
  } catch (e) {
    console.error("[smoke] 响应不是 JSON：", txt.slice(0, 1200));
    process.exit(5);
  }

  const choice = json?.choices?.[0];
  const content = choice?.message?.content ?? "";
  const annotations = choice?.message?.annotations ?? [];
  const urls = [];
  for (const ann of annotations) {
    const u = ann?.url_citation?.url ?? ann?.url;
    if (u) urls.push(u);
  }

  console.log("\n========== 正文 ==========");
  console.log(content);
  console.log("\n========== 引用来源 ==========");
  if (urls.length === 0) {
    console.log("(无 annotations.url_citation)");
  } else {
    for (const u of urls) console.log(" ·", u);
  }

  console.log("\n========== 判定 ==========");
  if (content.length === 0) {
    console.error("[smoke] FAIL：正文为空");
    process.exit(6);
  }
  if (urls.length === 0) {
    console.warn("[smoke] WARN：没有 url_citation，可能模型没触发搜索或中转站没透传 annotations");
    process.exit(7);
  }
  console.log(`[smoke] PASS：正文长度 ${content.length} 字，引用 ${urls.length} 个`);
}

main().catch((e) => {
  console.error("[smoke] uncaught:", e);
  process.exit(99);
});
