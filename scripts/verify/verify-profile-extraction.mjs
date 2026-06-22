/**
 * 用户画像 v2 facts 逻辑单元测试（无 LLM / Electron）。
 * 运行：pnpm --filter @bailin/desktop run build:main && node scripts/verify/verify-profile-extraction.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const {
  applyExtractionDiff,
  parseExtractionDiff,
  isEmptyExtractionDiff
} = require(join(root, "apps/desktop/dist/main/main/runtime/profile-diff.js"));
const {
  normalizeProfile,
  emptyProfile,
  profileForPrompt
} = require(join(root, "apps/desktop/dist/main/shared/profile.js"));

let failed = 0;

function assert(label, cond) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    failed++;
  } else {
    console.log(`ok: ${label}`);
  }
}

const ctx = { characterId: "char1", sessionId: "sess1", now: 1_700_000_000_000 };

// v1 三数组 → facts 迁移
const migrated = normalizeProfile({
  preferredName: "小明",
  currentGoals: ["找工作"],
  ongoingConcerns: ["失眠"],
  tabooTopics: ["前任"]
});
assert("迁移 goals→goal", migrated.facts.some((f) => f.category === "goal" && f.text === "找工作"));
assert("迁移 concerns→concern", migrated.facts.some((f) => f.category === "concern"));
assert("迁移 taboo→boundary", migrated.facts.some((f) => f.category === "boundary"));

// add fact 多 category
const base = emptyProfile();
const added = applyExtractionDiff(
  base,
  {
    add: {
      facts: [
        { category: "interest", text: "喜欢徒步" },
        { category: "identity", text: "在上海做产品" }
      ]
    },
    remove: {}
  },
  ctx
);
assert("add interest", added.profile.facts.some((f) => f.category === "interest"));
assert("add identity", added.profile.facts.some((f) => f.category === "identity"));

// 跨 category 文本去重
const dup = applyExtractionDiff(
  added.profile,
  {
    add: { facts: [{ category: "goal", text: "喜欢徒步" }] },
    remove: {}
  },
  ctx
);
assert("dedupe same text", !dup.profile.facts.some((f) => f.category === "goal"));

// manual name 优先
const manualName = {
  ...emptyProfile(),
  preferredName: { text: "老王", updatedAt: 1, source: "manual" }
};
const nameBlock = applyExtractionDiff(
  manualName,
  { add: { preferredName: "小明" }, remove: {} },
  ctx
);
assert("manual name protected", nameBlock.profile.preferredName?.text === "老王");

// remove 仅删 auto
const withManual = {
  ...emptyProfile(),
  facts: [
    {
      id: "m1",
      text: "手填兴趣",
      category: "interest",
      updatedAt: 1,
      source: "manual"
    },
    {
      id: "a1",
      text: "自动兴趣",
      category: "interest",
      updatedAt: 2,
      source: "auto"
    }
  ]
};
const removed = applyExtractionDiff(
  withManual,
  { add: {}, remove: { facts: [{ category: "interest", text: "自动兴趣" }] } },
  ctx
);
assert("remove auto only", removed.profile.facts.length === 1);
assert("manual kept", removed.profile.facts[0]?.text === "手填兴趣");

// prompt 预算：boundary 全取，goal 截断
const rich = {
  ...emptyProfile(),
  facts: [
    { id: "b1", text: "别聊A", category: "boundary", updatedAt: 1, source: "auto" },
    { id: "b2", text: "别聊B", category: "boundary", updatedAt: 2, source: "auto" },
    { id: "g1", text: "目标1", category: "goal", updatedAt: 3, source: "auto" },
    { id: "g2", text: "目标2", category: "goal", updatedAt: 4, source: "auto" },
    { id: "g3", text: "目标3", category: "goal", updatedAt: 5, source: "auto" },
    { id: "g4", text: "目标4", category: "goal", updatedAt: 6, source: "auto" }
  ]
};
const promptView = profileForPrompt(rich);
assert("boundary all in prompt", (promptView.factsByCategory.boundary?.length ?? 0) === 2);
assert("goal capped at 3", (promptView.factsByCategory.goal?.length ?? 0) === 3);

// parseExtractionDiff v2
const parsed = parseExtractionDiff({
  add: {
    preferredName: "wiND",
    facts: [{ category: "skill", text: "会写 TypeScript" }]
  },
  remove: {}
});
assert("parse facts", parsed?.add?.facts?.[0]?.category === "skill");
assert("parse not empty", parsed && !isEmptyExtractionDiff(parsed));
assert("empty diff", isEmptyExtractionDiff({ add: {}, remove: {} }));

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll profile-extraction v2 checks passed.");
