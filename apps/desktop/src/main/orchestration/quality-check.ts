import type {
  CharacterCard,
  QualityCheckItem,
  QualityReport,
  ResearchDoc
} from "@nuwa-pet/character-protocol";
import {
  buildVoiceJudgePrompt,
  buildVoiceSamplePrompt
} from "@nuwa-pet/nuwa-prompts";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

export interface RunQualityCheckInput {
  card: CharacterCard;
  researchDocs?: ResearchDoc[];
  /** 是否做风格测试（一次额外 LLM 调用 + 一次评分调用）。默认 true。 */
  runVoiceTest?: boolean;
}

/**
 * Phase·4 质量自检：结构化指标 + 风格 LLM 评分。
 * 对应 huashu-nuwa SKILL.md 第 525 行附近的「通过标准」表。
 */
export async function runQualityCheck(
  llm: LLMAdapter,
  input: RunQualityCheckInput
): Promise<QualityReport> {
  const { card, researchDocs, runVoiceTest = true } = input;
  const items: QualityCheckItem[] = [];

  // 1. 心智模型数量 3..7
  const mmCount = card.mentalModels.length;
  items.push({
    id: "mm-count",
    label: "心智模型数量 3..7",
    pass: mmCount >= 3 && mmCount <= 7,
    score: clamp01(mmCount >= 3 && mmCount <= 7 ? 1 : mmCount >= 2 ? 0.5 : 0),
    reason: `当前 ${mmCount} 个`
  });

  // 2. 每个心智模型都有 limits
  const allHaveLimits = card.mentalModels.every(
    (m) => typeof m.limits === "string" && m.limits.trim().length > 0
  );
  items.push({
    id: "mm-limits",
    label: "每个心智模型有局限性",
    pass: allHaveLimits,
    score: allHaveLimits ? 1 : 0,
    reason: allHaveLimits ? "全部填写" : "存在 limits 为空的模型"
  });

  // 3. 决策启发式 5..8
  const heuCount = card.heuristics.length;
  items.push({
    id: "heu-count",
    label: "决策启发式 5..8",
    pass: heuCount >= 5 && heuCount <= 8,
    score: clamp01(heuCount >= 5 && heuCount <= 8 ? 1 : heuCount >= 3 ? 0.6 : 0.3),
    reason: `当前 ${heuCount} 条`
  });

  // 4. 表达 DNA 签名词非空
  const sigCount = (card.expressionDNA.vocabulary.signature ?? []).length;
  items.push({
    id: "dna-signature",
    label: "表达 DNA 有签名词 / 专属术语",
    pass: sigCount >= 2,
    score: clamp01(sigCount >= 3 ? 1 : sigCount >= 1 ? 0.6 : 0),
    reason: `signature ${sigCount} 个`
  });

  // 5. 内在张力 >=2
  const tensions = card.values.tensions ?? [];
  items.push({
    id: "values-tensions",
    label: "values.tensions 至少 2 条",
    pass: tensions.length >= 2,
    score: clamp01(tensions.length / 2),
    reason: `tensions ${tensions.length} 条`
  });

  // 6. honestyBoundary.notes >=3
  const notes = card.honestyBoundary.notes ?? [];
  items.push({
    id: "honesty-notes",
    label: "honestyBoundary.notes 至少 3 条",
    pass: notes.length >= 3,
    score: clamp01(notes.length / 3),
    reason: `notes ${notes.length} 条`
  });

  // 7a. 外貌 spec：置信度 + 参考图来源
  const appearance = card.meta.appearance;
  if (appearance) {
    items.push({
      id: "appearance-confidence",
      label: "外貌置信度（high 优）",
      pass: appearance.sourceConfidence === "high",
      score: clamp01(
        appearance.sourceConfidence === "high"
          ? 1
          : appearance.sourceConfidence === "medium"
            ? 0.6
            : 0.3
      ),
      reason: `sourceConfidence = ${appearance.sourceConfidence}`
    });
    const refsCount = (appearance.referenceImages ?? []).length;
    const isFiction = card.meta.sourceType !== "original";
    if (isFiction) {
      items.push({
        id: "appearance-refs",
        label: "虚构 / 公众人物角色 · 至少 1 张参考图",
        pass: refsCount >= 1,
        score: clamp01(refsCount >= 1 ? 1 : 0.3),
        reason:
          refsCount >= 1
            ? `${refsCount} 张参考图`
            : "无参考图，外貌可能凭训练知识硬编（点「重新生成形象」上传一张原作图能大幅提升）"
      });
    }
    // gender 缺失 / unknown → 警告
    items.push({
      id: "appearance-gender",
      label: "外貌 gender 字段已确定",
      pass: appearance.gender !== "unknown" && appearance.gender != null,
      score: appearance.gender !== "unknown" && appearance.gender != null ? 1 : 0.5,
      reason:
        appearance.gender == null || appearance.gender === "unknown"
          ? "gender=unknown，sprite 可能用错性别模板（少女→男）"
          : `gender = ${appearance.gender}`
    });
  } else {
    items.push({
      id: "appearance-missing",
      label: "存在 AppearanceSpec",
      pass: false,
      score: 0.2,
      reason: "未生成 AppearanceSpec，sprite 走骨架样式"
    });
  }

  // 7. 一手来源占比 >50%（基于调研文档）
  if (researchDocs && researchDocs.length > 0) {
    const totalSources = researchDocs.reduce((acc, d) => acc + d.sources.length, 0);
    const usedWeb = researchDocs.filter((d) => d.webSearchUsed).length;
    const allOk = researchDocs.filter((d) => d.status === "ok").length;
    const primaryRatio = researchDocs.length > 0 ? usedWeb / researchDocs.length : 0;
    items.push({
      id: "primary-sources",
      label: "调研引用过 web_search（≥ 4 个 agent 用过）",
      pass: usedWeb >= 4,
      score: clamp01(usedWeb / 6),
      reason: `${usedWeb}/6 个 agent 触发了 web_search，总引用 ${totalSources} 条，成功 ${allOk}/6`
    });
    items.push({
      id: "primary-ratio",
      label: "一手 / 联网来源占比 >50%",
      pass: primaryRatio > 0.5,
      score: clamp01(primaryRatio),
      reason: `占比 ${(primaryRatio * 100).toFixed(0)}%`
    });
  }

  // 8. 风格测试：先生成 100 字短文 → 再让 LLM 评分
  let voiceTest: QualityReport["voiceTest"] | undefined;
  if (runVoiceTest) {
    voiceTest = await runVoiceTestStep(llm, card);
    if (voiceTest) {
      items.push({
        id: "voice-test",
        label: "风格测试评分 ≥ 7/10",
        pass: voiceTest.score >= 7,
        score: clamp01(voiceTest.score / 10),
        reason: voiceTest.critique
      });
    }
  }

  // 总体评分：加权平均
  const overallScore =
    items.reduce((acc, it) => acc + it.score, 0) / Math.max(items.length, 1);
  const hardFail = items.some((it) => !it.pass && it.score < 0.3);
  const softFail = items.some((it) => !it.pass);
  const verdict: QualityReport["verdict"] = hardFail
    ? "fail"
    : softFail
      ? "warn"
      : "pass";

  return {
    verdict,
    overallScore: clamp01(overallScore),
    items,
    voiceTest,
    createdAt: Date.now()
  };
}

async function runVoiceTestStep(
  llm: LLMAdapter,
  card: CharacterCard
): Promise<QualityReport["voiceTest"] | undefined> {
  const samplePrompt = buildVoiceSamplePrompt(card);
  const sampleR = await llm.chatOnce({
    systemPrompt: samplePrompt.system,
    messages: [{ role: "user", content: samplePrompt.user }],
    temperature: 0.6,
    maxTokens: 250,
    stream: false
  });
  if (sampleR.kind !== "done" || !sampleR.text.trim()) return undefined;
  const sample = sampleR.text.trim().slice(0, 800);

  const judgePrompt = buildVoiceJudgePrompt(card, sample);
  const judgeR = await llm.chatOnce({
    systemPrompt: judgePrompt.system,
    messages: [{ role: "user", content: judgePrompt.user }],
    temperature: 0.1,
    maxTokens: 200,
    stream: false
  });
  if (judgeR.kind !== "done") return { sample, score: 5, critique: "评分调用失败" };

  const parsed = parseScoreJson(judgeR.text);
  return {
    sample,
    score: parsed.score,
    critique: parsed.critique
  };
}

function parseScoreJson(raw: string): { score: number; critique: string } {
  const trimmed = raw.trim();
  let candidate = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence?.[1]) candidate = fence[1];
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) candidate = candidate.slice(start, end + 1);
  try {
    const j = JSON.parse(candidate) as { score?: unknown; critique?: unknown };
    const score = typeof j.score === "number" ? Math.max(1, Math.min(10, Math.round(j.score))) : 5;
    const critique = typeof j.critique === "string" ? j.critique.slice(0, 400) : "(无点评)";
    return { score, critique };
  } catch {
    return { score: 5, critique: raw.slice(0, 200) };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
