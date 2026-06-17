/**
 * Phase 4 Sanity + Edge 测试 prompt（女娲 SKILL.md §4.1 / §4.2）。
 *
 * Sanity：3 个此人公开表态过的问题，检验回答方向是否一致。
 * Edge：1 个未公开讨论的相关问题，检验是否适度不确定、不胡编。
 */
import type { CharacterCard, ResearchDoc } from "@nuwa-pet/character-protocol";
import { buildSystemPrompt } from "./system-prompt.js";

export interface SanityQuestion {
  question: string;
  /** 调研中记录的公开立场摘要，供独立评分员对照。 */
  expectedStance: string;
}

export interface SanityEdgeQuestionSet {
  sanity: SanityQuestion[];
  edge: { question: string; relevance: string };
}

export function buildSanityEdgeQuestionPrompt(
  characterName: string,
  researchSegments: Array<{ agentId: number; agentName: string; markdown: string }>
): { system: string; user: string } {
  const system = [
    "你是百灵 Bailin 质量自检的「测试题出题员」。",
    "根据调研报告，为角色蒸馏产出 Sanity / Edge 测试题。",
    "",
    "Sanity（3 题）：此人曾在公开资料中明确表态过的问题；每题附带 expectedStance（≤80 字，概括其公开立场）。",
    "Edge（1 题）：与此人领域相关、但调研中未见明确公开讨论的问题。",
    "",
    "你必须严格输出 JSON，仅 JSON：",
    `{`,
    `  "sanity": [`,
    `    { "question": "...", "expectedStance": "..." },`,
    `    { "question": "...", "expectedStance": "..." },`,
    `    { "question": "...", "expectedStance": "..." }`,
    `  ],`,
    `  "edge": { "question": "...", "relevance": "为什么与此人相关（≤60字）" }`,
    `}`
  ].join("\n");

  const userLines = [`角色：「${characterName}」`, "", "## 调研摘要"];
  for (const seg of researchSegments) {
    userLines.push(
      `### Agent ${seg.agentId} · ${seg.agentName}`,
      seg.markdown.slice(0, 2800),
      ""
    );
  }
  userLines.push("现在出题，直接输出 JSON。");

  return { system, user: userLines.join("\n") };
}

export function buildCharacterAnswerPrompt(
  card: CharacterCard,
  question: string
): { system: string; user: string } {
  const system = buildSystemPrompt({ card, isFirstActivation: false });
  return {
    system,
    user: question
  };
}

export interface SanityEdgeJudgeInput {
  characterName: string;
  sanity: Array<{ question: string; expectedStance: string; answer: string }>;
  edge: { question: string; answer: string };
}

export function buildSanityEdgeJudgePrompt(input: SanityEdgeJudgeInput): {
  system: string;
  user: string;
} {
  const system = [
    "你是百灵 Bailin 质量自检的「独立评分员」（不是答题者，避免自评偏差）。",
    "",
    "Sanity 评分（每题 1–10）：回答方向是否与 expectedStance 一致？",
    "  - 8–10：方向一致，体现该角色典型立场",
    "  - 5–7：大体一致但有偏差或过于泛泛",
    "  - 1–4：方向相反、完全跑题、或像通用 AI",
    "",
    "Edge 评分（1–10）：面对未公开讨论的问题，是否适度不确定、基于心智模型推断而非斩钉截铁胡编？",
    "  - 8–10：明确不确定 + 有依据的推断框架",
    "  - 5–7：有一定推断但过于断言",
    "  - 1–4：斩钉截铁编造、或完全回避",
    "",
    "你必须严格输出 JSON，仅 JSON：",
    `{`,
    `  "sanity": [`,
    `    { "score": 8, "pass": true, "critique": "≤80字" },`,
    `    { "score": 7, "pass": true, "critique": "..." },`,
    `    { "score": 6, "pass": false, "critique": "..." }`,
    `  ],`,
    `  "edge": { "score": 8, "pass": true, "critique": "≤80字" },`,
    `  "overallSanityPass": true,`,
    `  "overallEdgePass": true`,
    `}`,
    "",
    "pass 阈值：score >= 7"
  ].join("\n");

  const userLines = [`角色：${input.characterName}`, ""];

  input.sanity.forEach((s, i) => {
    userLines.push(
      `## Sanity ${i + 1}`,
      `问题：${s.question}`,
      `调研记录的公开立场：${s.expectedStance}`,
      `角色回答：`,
      s.answer.slice(0, 600),
      ""
    );
  });

  userLines.push(
    "## Edge",
    `问题：${input.edge.question}`,
    `角色回答：`,
    input.edge.answer.slice(0, 600),
    "",
    "现在打分，直接输出 JSON。"
  );

  return { system, user: userLines.join("\n") };
}

export function researchDocsToSegments(docs: ResearchDoc[]): Array<{
  agentId: number;
  agentName: string;
  markdown: string;
}> {
  return docs
    .filter((d) => d.status === "ok" && d.markdown.trim().length > 0)
    .sort((a, b) => a.agentId - b.agentId)
    .map((d) => ({
      agentId: d.agentId,
      agentName: d.agentName,
      markdown: d.markdown
    }));
}
