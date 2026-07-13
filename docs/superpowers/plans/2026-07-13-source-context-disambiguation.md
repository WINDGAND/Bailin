# 出处/身份消歧义字段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建页可选填「出处 / 身份」；有填则深度/快速创建优先用作 `sourceContext`，跳过「最广为人知」猜测。

**Architecture:** 抽出纯函数 `resolveSourceContextPriority` 决定锚点来源；UI 新增字段透传到 IPC；`resolveResearchContext` 与快速 prompt 消费该字段。

**Tech Stack:** Electron + React、Zod、`@bailin/prompts`、Node `node:test` + `tsx`（纯函数单测）

---

## 文件地图

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/main/orchestration/resolve-source-context.ts` | 纯函数：显式字段 / hint 抠词 / 是否需 LLM |
| `apps/desktop/src/main/orchestration/resolve-source-context.test.ts` | 单测 |
| `packages/character-protocol/src/distillation-job.ts` | Zod `sourceContext` |
| `apps/desktop/src/shared/ipc-contract.ts` | `CreateCharacterInput.sourceContext` |
| `bailin-orchestrator.ts` | OrchestrateInput + 调用纯函数 + 快速传参 |
| `character-creation.ts` / `appearance-research.ts` | prompt 带出处 |
| `CreateCharacter.tsx` + zh/en i18n | 表单字段 |

---

### Task 1: 纯函数 + 测试（TDD）

**Files:**
- Create: `apps/desktop/src/main/orchestration/resolve-source-context.ts`
- Create: `apps/desktop/src/main/orchestration/resolve-source-context.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSourceContextPriority } from "./resolve-source-context.js";

describe("resolveSourceContextPriority", () => {
  it("prefers explicit sourceContext over hint and LLM", () => {
    const r = resolveSourceContextPriority({
      sourceContext: " 进击的巨人 ",
      userHint: "《进击的巨人》里的艾伦",
      userMaterial: "",
      sourceType: "fictional"
    });
    assert.deepEqual(r, {
      kind: "explicit",
      sourceContext: "进击的巨人"
    });
  });

  it("extracts 《作品》 from hint when no explicit", () => {
    const r = resolveSourceContextPriority({
      userHint: "《三体》里的罗辑",
      sourceType: "fictional"
    });
    assert.equal(r.kind, "hint");
    if (r.kind === "hint") assert.equal(r.sourceContext, "三体");
  });

  it("returns needs_llm for non-original without anchors", () => {
    const r = resolveSourceContextPriority({
      characterName: "艾伦",
      sourceType: "fictional"
    });
    assert.equal(r.kind, "needs_llm");
  });

  it("returns none for original without anchors", () => {
    const r = resolveSourceContextPriority({
      sourceType: "original"
    });
    assert.equal(r.kind, "none");
  });
});
```

- [ ] **Step 2: 跑测确认失败** — `pnpm exec tsx --test apps/desktop/src/main/orchestration/resolve-source-context.test.ts`

- [ ] **Step 3: 实现纯函数**（`MAX_SOURCE_CONTEXT = 40`；优先级：explicit → 《》 → 括号 → original→none / else→needs_llm）

- [ ] **Step 4: 跑测通过**

---

### Task 2: 契约字段

- [ ] `DistillationJobConfigSchema` 增加 `sourceContext: z.string().max(40).optional()`
- [ ] `CreateCharacterInput` + `OrchestrateInput` 增加 `sourceContext?: string`
- [ ] rebuild character-protocol

---

### Task 3: Orchestrator 接线

- [ ] `resolveResearchContext` 先调 `resolveSourceContextPriority`；`explicit`/`hint` 直接返回；`none` 返回 `{}`；`needs_llm` 才走现有 LLM
- [ ] 快速：`runCardStep` / `runAppearanceForQuick`（及文本外貌 prompt）传入 `sourceContext`

---

### Task 4: Prompts

- [ ] `CharacterCardInput` + `buildCharacterCardPrompt`：有 `sourceContext` 时强制锚定
- [ ] `buildAppearanceResearchPrompt`（及快速用到的 vision/spec 入口若带 characterName）：拼接出处

---

### Task 5: UI + i18n

- [ ] `CreateCharacter`：`sourceContext` state、角色名下 `CountedField`、submit 传参
- [ ] zh/en：`sourceContextLabel` / `Placeholder` / `Hint`

---

### Task 6: 验证

- [ ] 单测通过
- [ ] `pnpm --filter @bailin/character-protocol --filter @bailin/prompts run build`
- [ ] desktop main/renderer typecheck（或至少相关包 typecheck）

**不做：** git commit（除非用户要求）；不做候选列表/确认弹窗。
