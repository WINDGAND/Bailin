import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeSkeletonCard, type ResearchDoc } from "@bailin/character-protocol";
import {
  MAX_PHASE2_ATTEMPTS,
  normalizeMentalModelsAndHeuristics,
  runPhase2SynthesisWithResearchGuard,
  seedRequiredCardFields,
  shouldRetryPhase2Synthesis
} from "./synthesis-pipeline.js";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

function doc(status: ResearchDoc["status"], agentId: 1 | 2 | 3 | 4 | 5 | 6 = 1): ResearchDoc {
  return {
    agentId,
    agentName: `agent-${agentId}`,
    status,
    markdown: status === "ok" ? "# ok\n内容足够长以通过校验" : "失败占位",
    confidence: status === "ok" ? "high" : "low",
    sources: [],
    webSearchUsed: false,
    durationMs: 1,
    errorMessage: status === "ok" ? undefined : "failed"
  };
}

describe("shouldRetryPhase2Synthesis", () => {
  it("retries when research mostly succeeded but card is null", () => {
    const docs = [1, 2, 3, 4, 5, 6].map((id) => doc("ok", id));
    assert.equal(shouldRetryPhase2Synthesis(docs, null), true);
  });

  it("does not retry when synthesis already produced a card", () => {
    const docs = [1, 2, 3].map((id) => doc("ok", id));
    assert.equal(
      shouldRetryPhase2Synthesis(docs, { id: "x" } as never),
      false
    );
  });

  it("does not retry when research itself mostly failed", () => {
    const docs: ResearchDoc[] = [
      doc("ok", 1),
      doc("error", 2),
      doc("error", 3),
      doc("error", 4),
      doc("error", 5),
      doc("error", 6)
    ];
    assert.equal(shouldRetryPhase2Synthesis(docs, null), false);
  });

  it("exposes a retry budget of at least 3 attempts", () => {
    assert.ok(MAX_PHASE2_ATTEMPTS >= 3);
  });
});

describe("normalizeMentalModelsAndHeuristics", () => {
  it("maps claim/domains Pass-A shape onto protocol fields", () => {
    const json: Record<string, unknown> = {
      mentalModels: [
        {
          id: "mm1",
          name: "聚焦高价值事务",
          claim: "把精力集中在最有价值的事务上。",
          domains: ["商业", "政治"],
          evidence: ["调研"]
        }
      ],
      heuristics: [
        {
          id: "h1",
          name: "风险时机",
          claim: "在适当时机承担风险。",
          domains: ["投资"]
        }
      ]
    };
    const warnings: string[] = [];
    normalizeMentalModelsAndHeuristics(json, warnings, "[test]");
    const mm = (json.mentalModels as Array<Record<string, unknown>>)[0]!;
    const h = (json.heuristics as Array<Record<string, unknown>>)[0]!;
    assert.equal(mm.oneLiner, "把精力集中在最有价值的事务上。");
    assert.deepEqual(mm.appliesTo, ["商业", "政治"]);
    assert.ok(String(mm.limits).length > 0);
    assert.equal(h.rule, "在适当时机承担风险。");
    assert.match(String(h.scenario), /投资/);
    assert.ok(warnings.some((w) => w.includes("已规范化")));
  });
});

describe("seedRequiredCardFields", () => {
  it("fills sourceType/track/roleplay/identity when LLM omits them", () => {
    const json: Record<string, unknown> = {
      meta: { name: "唐纳德·特朗普" },
      mentalModels: [{ id: "m1" }]
    };
    const warnings: string[] = [];
    seedRequiredCardFields(
      json,
      {
        characterName: "唐纳德·特朗普",
        sourceType: "public-figure",
        track: "utility"
      },
      warnings,
      "[test]"
    );
    const meta = json.meta as Record<string, unknown>;
    const roleplay = json.roleplay as Record<string, unknown>;
    const identity = json.identity as Record<string, unknown>;
    assert.equal(meta.sourceType, "public-figure");
    assert.equal(meta.track, "utility");
    assert.ok(String(meta.disclaimer).length > 0);
    assert.equal(roleplay.firstPersonOnly, true);
    assert.equal(roleplay.disclaimerOnce, true);
    assert.ok(Array.isArray(roleplay.exitTriggers) && roleplay.exitTriggers.length > 0);
    assert.ok(String(identity.selfIntro).includes("唐纳德"));
    assert.ok(warnings.some((w) => w.includes("已补齐")));
  });
});

describe("runPhase2SynthesisWithResearchGuard", () => {
  it("retries when first attempt fails and research is complete, then succeeds", async () => {
    let calls = 0;
    const llm = {
      async chatOnce() {
        calls += 1;
        // Pass A / Pass B / legacy 都会走到 chatOnce；前两次整轮失败，第三次 Pass A 起成功。
        if (calls < 5) {
          return { kind: "error" as const, code: "TEMP", message: "transient" };
        }
        // 简化：直接返回可被 legacy/pass 解析失败后再由 mock 不够——改为返回合法 Pass A + Pass B 太重。
        // 这里用「前几轮 error，之后返回骨架级合法 card JSON」走 legacy 路径。
        const card = makeSkeletonCard({
          id: "temp",
          name: "测试",
          sourceType: "public-figure",
          track: "utility",
          now: Date.now()
        });
        // 把骨架 mm 改成非骨架名，证明是「提炼结果」
        card.mentalModels = [
          {
            id: "mm-1",
            name: "交易思维",
            oneLiner: "一切都可以谈。",
            evidence: ["调研档案"],
            appliesTo: ["谈判"],
            limits: "容易忽视长期信任"
          },
          {
            id: "mm-2",
            name: "媒体优先",
            oneLiner: "叙事即战场。",
            evidence: ["调研档案"],
            appliesTo: ["传播"],
            limits: "实质推进可能滞后"
          },
          {
            id: "mm-3",
            name: "压力施压",
            oneLiner: "先把筹码做大。",
            evidence: ["调研档案"],
            appliesTo: ["博弈"],
            limits: "盟友可能反感"
          }
        ];
        return {
          kind: "done" as const,
          text: JSON.stringify(card),
          finishReason: "stop" as const
        };
      }
    } as unknown as LLMAdapter;

    const docs = [1, 2, 3, 4, 5, 6].map((id) => doc("ok", id as 1 | 2 | 3 | 4 | 5 | 6));
    const warnings: string[] = [];
    const attempts: number[] = [];
    const result = await runPhase2SynthesisWithResearchGuard(
      llm,
      {
        characterName: "测试",
        sourceType: "public-figure",
        track: "utility",
        enableWebSearch: false,
        concurrency: 6,
        agentTimeoutMs: 1000
      },
      docs,
      warnings,
      {
        maxAttempts: 3,
        onAttempt: (n) => {
          attempts.push(n);
        }
      }
    );

    assert.ok(result.card, "expected a card after retry");
    assert.equal(result.card?.mentalModels[0]?.name, "交易思维");
    assert.deepEqual(attempts, [1, 2, 3]);
    assert.ok(warnings.some((w) => w.includes("[phase2·retry]")));
  });
});
