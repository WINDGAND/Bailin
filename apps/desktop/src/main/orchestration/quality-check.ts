/**
 * 质量自检（Phase·4）核心模块。
 *
 * 职责：在角色卡（CharacterCard）孵化/蒸馏完成后，对其质量做一次系统性的
 * 「体检」，产出结构化的 QualityReport 供上层（如 synthesis-pipeline、
 * 设置页进度面板）决定是否通过、告警或打回重做。
 *
 * 检查分三大类：
 *  1. 结构化指标 —— 纯本地计算，逐项核对卡片字段是否满足 huashu-nuwa
 *     SKILL.md 中的「通过标准」表（心智模型数量、局限性、启发式条数、
 *     签名词、内在张力、诚实边界、外貌规格、调研来源占比等）；
 *  2. Sanity / Edge 测试 —— 基于调研文档让 LLM 生成「公开立场题」和
 *     「边缘问题」，再让角色作答、由评审 LLM 逐题打分（多次 LLM 调用）；
 *  3. 风格测试 —— 让 LLM 以角色口吻写短文，再由评审 LLM 打分。
 *
 * 每个检查项（QualityCheckItem）都带 0..1 的 score 与 pass 标记；
 * 汇总时取所有项的平均分作为 overallScore，并按「是否存在低分不过项」
 * 得出 pass / warn / fail 三档结论。
 */

import type {
  CharacterCard,
  QualityCheckItem,
  QualityReport,
  ResearchDoc
} from "@bailin/character-protocol";
import {
  buildSanityEdgeJudgePrompt,
  buildSanityEdgeQuestionPrompt,
  buildCharacterAnswerPrompt,
  buildVoiceJudgePrompt,
  buildVoiceSamplePrompt,
  researchDocsToSegments,
  type SanityEdgeQuestionSet
} from "@bailin/prompts";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

/** runQualityCheck 的入参集合。 */
export interface RunQualityCheckInput {
  /** 待体检的角色卡（结构化指标均从此读取）。 */
  card: CharacterCard;
  /** Phase·3 调研产出的文档列表；缺省时跳过来源占比与 Sanity/Edge 检查。 */
  researchDocs?: ResearchDoc[];
  /** 是否做风格测试（一次额外 LLM 调用 + 一次评分调用）。默认 true。 */
  runVoiceTest?: boolean;
  /** 是否做 Sanity + Edge 测试。默认 true（需 researchDocs）。 */
  runSanityEdge?: boolean;
}

/**
 * Phase·4 质量自检：结构化指标 + Sanity/Edge + 风格 LLM 评分。
 * 对应 huashu-nuwa SKILL.md 第 525 行附近的「通过标准」表。
 *
 * 执行流程：
 *  1. 依次执行各项纯本地结构化检查，逐项 push 到 items；
 *  2. 若有调研文档且 runSanityEdge 为真，执行 Sanity/Edge LLM 测试并计入；
 *  3. 若 runVoiceTest 为真，执行风格测试（生成短文 + 评分）并计入；
 *  4. 取所有检查项 score 的平均值作为 overallScore；
 *  5. 判定结论：任一项不过且 score < 0.3 → fail（硬失败）；
 *     仅存在不过项（分数尚可）→ warn；全部通过 → pass。
 *
 * @param llm   LLM 适配器，用于 Sanity/Edge 出题、作答与评分调用
 * @param input 检查输入（角色卡、调研文档、可选的测试开关）
 * @returns 汇总后的质量报告（含结论、总分、逐项明细与三类测试结果）
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
  // 外貌 AppearanceSpec 存在时才有意义，逐项检查：
  //   - sourceConfidence：调研来源置信度，high 得满分；
  //   - 虚构/公众人物角色必须有至少 1 张参考图，否则 sprite 可能凭
  //     训练知识「硬编」出与原作不符的形象；
  //   - gender 字段不能为 unknown，否则 sprite 生成时可能选错性别模板。
  // 整个 AppearanceSpec 缺失时记一项 0.2 低分，sprite 将退回骨架样式。
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
  // 仅当存在调研文档时检查，衡量 Phase·3 调研的「证据质量」：
  //   - 至少 4/6 个调研 agent 实际触发了 web_search（防止调研空转）；
  //   - 使用联网搜索的 agent 占比 >50%，保证来源偏向一手信息。
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

  // Sanity/Edge 测试结果（可能因文档缺失或 LLM 调用失败而不存在）
  let sanityTest: QualityReport["sanityTest"];
  let edgeTest: QualityReport["edgeTest"];

  // Sanity 测试：验证角色在公开议题上的立场方向与设定一致；
  // Edge 测试：验证角色对边缘/敏感问题保持适度不确定，不乱下断言。
  // 两者共用一次出题 + 多次作答 + 一次评审的流水线，见
  // runSanityEdgeTestStep；任一环节失败则静默跳过（不阻塞整体报告）。
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
  // 两段式：先让角色「写一段话」考察语气/用词，再由评审 LLM 按
  // 表达 DNA 打 1..10 分。任一步失败则 voiceTest 为 undefined，
  // 汇总时该项不计入 items。
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

  // 汇总：平均分 + 三档结论。
  // hardFail：某项不过且 score < 0.3，属于「硬伤」，直接 fail；
  // softFail：存在不过项但分数尚可（>= 0.3），给 warn 提示人工复核。
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

/**
 * Sanity/Edge 测试步骤：出题 → 作答 → 评审 三段式流水线。
 *
 * 1. 出题：基于调研文档片段（researchDocsToSegments）让 LLM 生成
 *    3 道「公开立场题」（带期望立场）+ 1 道「边缘问题」；
 * 2. 作答：对每道题用 buildCharacterAnswerPrompt 让角色本尊回答
 *    （temperature 0.5，回答截断到 800 字符，失败时以占位文案兜底）；
 * 3. 评审：将全部问答交给 buildSanityEdgeJudgePrompt 评审，
 *    逐题打 1..10 分并给出点评。
 *
 * 任一环节 LLM 调用失败或 JSON 解析失败都返回 undefined，
 * 由调用方静默跳过该项，不影响其余检查项。
 *
 * @param llm          LLM 适配器
 * @param card         角色卡（用于角色口吻作答与出题上下文）
 * @param researchDocs 调研文档（出题的事实依据）
 * @returns Sanity 与 Edge 两份测试结果；流程中断时返回 undefined
 */
async function runSanityEdgeTestStep(
  llm: LLMAdapter,
  card: CharacterCard,
  researchDocs: ResearchDoc[]
): Promise<{
  sanityTest?: QualityReport["sanityTest"];
  edgeTest?: QualityReport["edgeTest"];
} | undefined> {
  // —— 第 1 段：出题。temperature 压到 0.2 保证题目贴合调研事实。 ——
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

  // 解析出题 JSON：sanity 题目为空或缺 edge 题时视为出题失败
  const questionSet = parseSanityEdgeQuestions(questionR.text);
  if (!questionSet || questionSet.sanity.length === 0 || !questionSet.edge.question) {
    return undefined;
  }

  // —— 第 2 段：作答。取前 3 道 sanity 题，用角色口吻逐题回答。 ——
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

  // —— 第 3 段：评审。将全部问答交给评审 LLM 逐题打分。 ——
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

  // 评审结果与问答逐一对齐；评审输出缺失的题目按 5 分/不通过兜底
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

/**
 * 解析出题 LLM 返回的 JSON，得到 Sanity 题集 + Edge 题。
 *
 * 容错策略：只保留 question / expectedStance 均为 string 的题目，
 * 并对长度做硬截断（题目 300、立场 200、相关性 120 字符），
 * 防止 LLM 输出超长内容撑爆下游 prompt。
 *
 * @param raw 出题 LLM 的原始输出（可能带 markdown 代码围栏）
 * @returns 结构化题集；无法解析或缺少必要字段时返回 null
 */
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

/**
 * 解析评审 LLM 返回的 JSON，得到逐题评分与整体通过标记。
 *
 * 容错策略：对每个字段做类型守卫，非法值回退到安全默认
 * （分数 5、pass 由分数 >= 7 推断、点评「(无点评)」），
 * 保证即使评审输出残缺也能产出完整的 sanity/edge 结构，
 * 不让单次评审失败阻塞整份质量报告。
 *
 * @param raw         评审 LLM 的原始输出
 * @param sanityCount sanity 题目数量（评分列表按此对齐，缺失项补默认值）
 * @returns 评分结构；JSON 完全无法解析时返回 null
 */
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
    // 按下标对齐评审结果；第 i 题缺失时回退为 5 分 + 不通过
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

/**
 * 风格测试步骤：生成短文 → 评分 两段式。
 *
 * 1. 生成：用 buildVoiceSamplePrompt 让角色写约 100 字短文
 *    （temperature 0.6，鼓励个性化表达），截断到 800 字符；
 * 2. 评分：将短文交给 buildVoiceJudgePrompt 按「表达 DNA」
 *    打 1..10 分。
 *
 * 生成失败返回 undefined（该项不计入报告）；仅评分调用失败时
 * 返回 5 分中评，保证短文样本仍可展示。
 *
 * @param llm  LLM 适配器
 * @param card 角色卡（提供语气、签名词等风格上下文）
 * @returns 风格测试结果（短文 + 分数 + 点评）；生成失败时 undefined
 */
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

  // 解析评审打分；解析失败时把原始输出前 200 字符作为点评兜底
  const parsed = parseScoreJson(judgeR.text);
  return {
    sample,
    score: parsed.score,
    critique: parsed.critique
  };
}

/**
 * 解析评分 LLM 返回的 JSON（{ score, critique }）。
 *
 * 容错策略：score 非数字时回退 5 分，并钳制到 1..10 整数；
 * critique 非字符串时用「(无点评)」；整体解析失败时把原始
 * 输出前 200 字符当作点评返回，永不抛异常。
 *
 * @param raw 评分 LLM 的原始输出
 * @returns 归一化后的分数与点评
 */
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

/**
 * 从 LLM 原始输出中提取 JSON 字符串。
 *
 * LLM 有时会用 markdown 代码围栏（```json ... ```）包裹 JSON，
 * 或在 JSON 前后混入说明文字。处理顺序：
 *  1. 优先匹配 ```json 围栏内的内容；
 *  2. 否则取首个 "{" 到最后一个 "}" 之间的子串。
 * 两步都失败时返回 null（视为无有效 JSON）。
 *
 * @param raw LLM 的原始输出文本
 * @returns 可直接 JSON.parse 的字符串；提取失败返回 null
 */
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

/** 将任意数值钳制到 [0, 1] 区间；NaN/Infinity 等非法值按 0 处理。 */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
