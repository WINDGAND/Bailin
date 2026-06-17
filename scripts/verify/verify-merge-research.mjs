/**
 * mergeResearchSummary 单元测试（无 LLM，纯启发式）。
 * 运行：node scripts/verify/verify-merge-research.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const distPath = new URL(
  "../../apps/desktop/dist/main/orchestration/merge-research-summary.js",
  import.meta.url
);

let mergeResearchSummary;
let mergeResearchDocs;
try {
  ({ mergeResearchSummary, mergeResearchDocs } = await import(distPath.href));
} catch {
  console.log("跳过：需先编译 main（pnpm --filter @nuwa-pet/desktop build 或 tsc）");
  process.exit(0);
}

const sampleDocs = [
  {
    agentId: 1,
    agentName: "著作与系统思考",
    markdown: "## 反脆弱\n一手来源 https://example.com/a\n矛盾：早期与近期观点不同",
    sources: ["https://example.com/a"],
    confidence: "high",
    webSearchUsed: true,
    durationMs: 1000,
    status: "ok"
  },
  {
    agentId: 2,
    agentName: "长对话与即兴思考",
    markdown: "> 失败",
    sources: [],
    confidence: "low",
    webSearchUsed: false,
    durationMs: 500,
    status: "error",
    errorMessage: "timeout"
  }
];

const review = mergeResearchSummary(sampleDocs);
assert.equal(review.totalUniqueUrls, 1, "应统计唯一 URL");
assert.ok(review.weakDimensions.includes("长对话与即兴思考"), "失败 agent 应进薄弱维度");
assert.ok(review.contradictions.length >= 1, "应检测到矛盾信号");
assert.equal(review.agents.length, 2);

const merged = mergeResearchDocs(sampleDocs, [
  {
    ...sampleDocs[1]!,
    status: "ok",
    markdown: "## 新对话\nhttps://example.com/b",
    sources: ["https://example.com/b"],
    confidence: "medium"
  }
]);
assert.equal(merged.length, 2);
assert.equal(merged[1]!.status, "ok");

console.log("verify-merge-research: OK");
