import type {
  CharacterCard,
  QualityCheckItem,
  QualityReport,
  ResearchDoc
} from "@nuwa-pet/character-protocol";
import {
  buildSanityEdgeJudgePrompt,
  buildSanityEdgeQuestionPrompt,
  buildCharacterAnswerPrompt,
  buildVoiceJudgePrompt,
  buildVoiceSamplePrompt,
  researchDocsToSegments,
  type SanityEdgeQuestionSet
} from "@nuwa-pet/nuwa-prompts";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

export interface RunQualityCheckInput {
  card: CharacterCard;
  researchDocs?: ResearchDoc[];
  /** 是否做风格测试（一次额外 LLM 调用 + 一次评分调用）。默认 true。 */
  runVoiceTest?: boolean;
  /** 是否做 Sanity + Edge 测试。默认 true（需 researchDocs）。 */
  runSanityEdge?: boolean;
}

/**
 * Phase·4 质量自检：结构化指标 + Sanity/Edge + 风格 LLM 评分。
 * 对应 huashu-nuwa SKILL.md 第 525 行附近的「通过标准」表。
 */
export async function runQualityCheck(
  llm: LLMAdapter,
  input: RunQualityCheckInput
): Promise<QualityReport> {
  const { card, researchDocs, runVoiceTest = true, runSanityEdge = true } = input;
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

  let sanityTest: QualityReport["sanityTest"];
  let edgeTest: QualityReport["edgeTest"];

  if (runSanityEdge && researchDocs && researchDocs.length > 0) {
    const sanityEdgeResult = await runSanityEdgeTestStep(llm, card, researchDocs);
    if (sanityEdgeResult) {
      sanityTest = sanityEdgeResult.sanityTest;
      edgeTest = sanityEdgeResult.edgeTest;
      if (sanityTest) {
        items.push({
          id: "sanity-test",
          label: "Sanity 测试（公开立场方向一致）",
          pass: sanityTest.overallPass,
          score: clamp01(sanityTest.averageScore / 10),
          reason: sanityTest.overallPass
            ? `3 题平均 ${sanityTest.averageScore.toFixed(1)}/10`
            : `平均 ${sanityTest.averageScore.toFixed(1)}/10，存在方向偏差`
        });
      }
      if (edgeTest) {
        items.push({
          id: "edge-test",
          label: "Edge 测试（边缘问题适度不确定）",
          pass: edgeTest.pass,
          score: clamp01(edgeTest.score / 10),
          reason: edgeTest.critique
        });
      }
    }
  }

  // 8. 风格测试：先生成 100 字短文 → 再让 LLM 评分
  let voiceTest: QualityReport["voiceTest"];
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
    sanityTest,
    edgeTest,
    createdAt: Date.now()
  };
}

async function runSanityEdgeTestStep(
  llm: LLMAdapter,
  card: CharacterCard,
  researchDocs: ResearchDoc[]
): Promise<{
  sanityTest?: QualityReport["sanityTest"];
  edgeTest?: QualityReport["edgeTest"];
} | undefined> {
  const segments = researchDocsToSegments(researchDocs);
  if (segments.length === 0) return undefined;

  const questionPrompt = buildSanityEdgeQuestionPrompt(card.meta.name, segments);
  const questionR = await llm.chatOnce({
    systemPrompt: questionPrompt.system,
    messages: [{ role: "user", content: questionPrompt.user }],
    temperature: 0.2,
    maxTokens: 1200,
    stream: false
  });
  if (questionR.kind !== "done") return undefined;

  const questionSet = parseSanityEdgeQuestions(questionR.text);
  if (!questionSet || questionSet.sanity.length === 0 || !questionSet.edge.question) {
    return undefined;
  }

  const sanityAnswers: Array<{
    question: string;
    expectedStance: string;
    answer: string;
  }> = [];

  for (const sq of questionSet.sanity.slice(0, 3)) {
    const answerPrompt = buildCharacterAnswerPrompt(card, sq.question);
    const answerR = await llm.chatOnce({
      systemPrompt: answerPrompt.system,
      messages: [{ role: "user", content: answerPrompt.user }],
      temperature: 0.5,
      maxTokens: 400,
      stream: false
    });
    sanityAnswers.push({
      question: sq.question,
      expectedStance: sq.expectedStance,
      answer:
        answerR.kind === "done" && answerR.text.trim()
          ? answerR.text.trim().slice(0, 800)
          : "（回答生成失败）"
    });
  }

  const edgeAnswerPrompt = buildCharacterAnswerPrompt(card, questionSet.edge.question);
  const edgeAnswerR = await llm.chatOnce({
    systemPrompt: edgeAnswerPrompt.system,
    messages: [{ role: "user", content: edgeAnswerPrompt.user }],
    temperature: 0.5,
    maxTokens: 400,
    stream: false
  });
  const edgeAnswer =
    edgeAnswerR.kind === "done" && edgeAnswerR.text.trim()
      ? edgeAnswerR.text.trim().slice(0, 800)
      : "（回答生成失败）";

  const judgePrompt = buildSanityEdgeJudgePrompt({
    characterName: card.meta.name,
    sanity: sanityAnswers,
    edge: { question: questionSet.edge.question, answer: edgeAnswer }
  });
  const judgeR = await llm.chatOnce({
    systemPrompt: judgePrompt.system,
    messages: [{ role: "user", content: judgePrompt.user }],
    temperature: 0.1,
    maxTokens: 800,
    stream: false
  });
  if (judgeR.kind !== "done") return undefined;

  const judged = parseSanityEdgeJudge(judgeR.text, sanityAnswers.length);
  if (!judged) return undefined;

  const sanityQuestions = sanityAnswers.map((s, i) => {
    const j = judged.sanity[i] ?? { score: 5, pass: false, critique: "评分缺失" };
    return {
      question: s.question,
      expectedStance: s.expectedStance,
      answer: s.answer,
      score: j.score,
      pass: j.pass,
      critique: j.critique
    };
  });

  const avgScore =
    sanityQuestions.reduce((acc, q) => acc + q.score, 0) / Math.max(sanityQuestions.length, 1);

  return {
    sanityTest: {
      questions: sanityQuestions,
      overallPass: judged.overallSanityPass,
      averageScore: Math.round(avgScore * 10) / 10
    },
    edgeTest: {
      question: questionSet.edge.question,
      answer: edgeAnswer,
      score: judged.edge.score,
      pass: judged.edge.pass,
      critique: judged.edge.critique
    }
  };
}

function parseSanityEdgeQuestions(raw: string): SanityEdgeQuestionSet | null {
  const candidate = extractJson(raw);
  if (!candidate) return null;
  try {
    const j = JSON.parse(candidate) as {
      sanity?: Array<{ question?: unknown; expectedStance?: unknown }>;
      edge?: { question?: unknown; relevance?: unknown };
    };
    const sanity = (j.sanity ?? [])
      .filter((s) => typeof s.question === "string" && typeof s.expectedStance === "string")
      .map((s) => ({
        question: (s.question as string).slice(0, 300),
        expectedStance: (s.expectedStance as string).slice(0, 200)
      }));
    const edgeQuestion =
      typeof j.edge?.question === "string" ? j.edge.question.slice(0, 300) : "";
    const relevance =
      typeof j.edge?.relevance === "string" ? j.edge.relevance.slice(0, 120) : "";
    if (sanity.length === 0 || !edgeQuestion) return null;
    return { sanity, edge: { question: edgeQuestion, relevance } };
  } catch {
    return null;
  }
}

function parseSanityEdgeJudge(
  raw: string,
  sanityCount: number
): {
  sanity: Array<{ score: number; pass: boolean; critique: string }>;
  edge: { score: number; pass: boolean; critique: string };
  overallSanityPass: boolean;
  overallEdgePass: boolean;
} | null {
  const candidate = extractJson(raw);
  if (!candidate) return null;
  try {
    const j = JSON.parse(candidate) as {
      sanity?: Array<{ score?: unknown; pass?: unknown; critique?: unknown }>;
      edge?: { score?: unknown; pass?: unknown; critique?: unknown };
      overallSanityPass?: unknown;
      overallEdgePass?: unknown;
    };
    const sanity: Array<{ score: number; pass: boolean; critique: string }> = [];
    for (let i = 0; i < sanityCount; i++) {
      const row = j.sanity?.[i];
      const score =
        typeof row?.score === "number"
          ? Math.max(1, Math.min(10, Math.round(row.score)))
          : 5;
      sanity.push({
        score,
        pass: typeof row?.pass === "boolean" ? row.pass : score >= 7,
        critique:
          typeof row?.critique === "string" ? row.critique.slice(0, 200) : "(无点评)"
      });
    }
    const edgeScore =
      typeof j.edge?.score === "number"
        ? Math.max(1, Math.min(10, Math.round(j.edge.score)))
        : 5;
    const edge = {
      score: edgeScore,
      pass: typeof j.edge?.pass === "boolean" ? j.edge.pass : edgeScore >= 7,
      critique:
        typeof j.edge?.critique === "string" ? j.edge.critique.slice(0, 200) : "(无点评)"
    };
    const overallSanityPass =
      typeof j.overallSanityPass === "boolean"
        ? j.overallSanityPass
        : sanity.every((s) => s.pass);
    const overallEdgePass =
      typeof j.overallEdgePass === "boolean" ? j.overallEdgePass : edge.pass;
    return { sanity, edge, overallSanityPass, overallEdgePass };
  } catch {
    return null;
  }
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
  const candidate = extractJson(raw);
  if (!candidate) return { score: 5, critique: raw.slice(0, 200) };
  try {
    const j = JSON.parse(candidate) as { score?: unknown; critique?: unknown };
    const score = typeof j.score === "number" ? Math.max(1, Math.min(10, Math.round(j.score))) : 5;
    const critique = typeof j.critique === "string" ? j.critique.slice(0, 400) : "(无点评)";
    return { score, critique };
  } catch {
    return { score: 5, critique: raw.slice(0, 200) };
  }
}

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  let candidate = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence?.[1]) candidate = fence[1];
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
