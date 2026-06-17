/**
 * 轻量 Agentic Protocol：从心智模型反推回答路由，供运行时 buildSystemPrompt 使用。
 */
import type { AnswerProtocol, CharacterCard } from "@nuwa-pet/character-protocol";
import { AnswerProtocolSchema, isAnswerProtocolValid } from "@nuwa-pet/character-protocol";

export function buildAnswerProtocolGenerationPrompt(
  card: Pick<
    CharacterCard,
    "meta" | "mentalModels" | "heuristics" | "values" | "expressionDNA"
  >
): { system: string; user: string } {
  const system = [
    "你是百灵 Bailin 的「回答路由生成器」（女娲 Agentic Protocol 轻量版）。",
    "任务：从角色的心智模型反推 3~5 条「遇到新问题怎么想」的路由，不是通用模板。",
    "",
    "纪律：",
    "1. 每条路由必须对应 ≥1 个心智模型，体现此人独特的分析角度",
    "2. steps 要具体可执行（如「先问激励结构谁受益」），不要「搜索相关信息」",
    "3. classifyHint 说明如何区分：需要事实 / 纯框架 / 混合问题",
    "4. 只输出 JSON，无 markdown",
    "",
    "输出格式：",
    `{`,
    `  "classifyHint": "string, Step1 问题分类指引",`,
    `  "routes": [`,
    `    {`,
    `      "id": "r1",`,
    `      "label": "路由名，如「看激励结构」",`,
    `      "when": "何时用此路由",`,
    `      "steps": ["步骤1", "步骤2"],`,
    `      "linkedModels": ["心智模型名"]`,
    `    }`,
    `  ]`,
    `}`,
    "",
    "routes 必须 3~5 条。"
  ].join("\n");

  const user = [
    `角色：${card.meta.name}`,
    `类型：${card.meta.sourceType}；定位：${card.meta.track}`,
    "",
    "## 心智模型",
    ...card.mentalModels.map(
      (m) =>
        `- ${m.name}：${m.oneLiner}（适用：${m.appliesTo.join("、")}；局限：${m.limits}）`
    ),
    "",
    "## 决策启发式（参考）",
    ...card.heuristics.slice(0, 6).map((h) => `- ${h.rule}（${h.scenario}）`),
    "",
    "## 价值观",
    `追求：${card.values.pursue.join("、")}`,
    card.values.tensions?.length ? `张力：${card.values.tensions.join("；")}` : "",
    "",
    "现在生成 answerProtocol JSON。"
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/** 无 LLM 时的确定性回退：把心智模型映射为路由。 */
export function deriveFallbackAnswerProtocol(
  card: Pick<CharacterCard, "meta" | "mentalModels" | "heuristics">
): AnswerProtocol {
  const routesFromModels = card.mentalModels.slice(0, 5).map((m, i) => ({
    id: `r${i + 1}`,
    label: m.name,
    when: `当问题涉及：${m.appliesTo.slice(0, 3).join("、")}`,
    steps: [
      `用「${m.oneLiner}」 framing 这个问题`,
      `检查是否超出局限：${m.limits.slice(0, 120)}`,
      "再给出我的判断"
    ],
    linkedModels: [m.name]
  }));

  const heuristicRoutes = card.heuristics.slice(0, 2).map((h, i) => ({
    id: `h${i + 1}`,
    label: h.rule.slice(0, 40),
    when: h.scenario,
    steps: [h.rule, h.example ? `例如：${h.example}` : "举一条具体例子"].filter(
      Boolean
    ) as string[],
    linkedModels: [] as string[]
  }));

  const routes = [...routesFromModels, ...heuristicRoutes].slice(0, 5);
  while (routes.length < 3) {
    routes.push({
      id: `generic-${routes.length + 1}`,
      label: "先问清楚",
      when: "用户问题太模糊或缺少背景",
      steps: ["先问一个关键澄清问题", "确认后再用心智模型回答"],
      linkedModels: []
    });
  }

  return {
    classifyHint:
      "先分类：① 需要最新事实（公司/事件/数据）→ 诚实说不知道或请用户补充，不编造；② 纯框架/价值观题 → 选一条路由；③ 混合题 → 先要关键事实再用模型分析。",
    routes: routes.slice(0, 5)
  };
}

export function parseAnswerProtocolFromLLM(text: string): AnswerProtocol | null {
  const trimmed = text.trim();
  let candidate = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence?.[1]) candidate = fence[1];
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    const parsed = AnswerProtocolSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function formatAnswerProtocolForPrompt(protocol: AnswerProtocol): string[] {
  const lines: string[] = [];
  lines.push("收到用户新问题时的思考路由（内部使用，不要逐条念给用户）：");
  lines.push(`Step 1 · 问题分类：${protocol.classifyHint}`);
  lines.push("Step 2 · 选一条路由拆解：");
  for (const route of protocol.routes) {
    lines.push(`- 【${route.label}】${route.when}`);
    for (const step of route.steps) {
      lines.push(`  · ${step}`);
    }
    if (route.linkedModels?.length) {
      lines.push(`  （关联：${route.linkedModels.join("、")}）`);
    }
  }
  lines.push(
    "Step 3 · 基于选定路由 + 心智模型 + 表达 DNA 组织回答；不确定时按此人的方式表达犹豫，禁止编造事实。"
  );
  return lines;
}

export function resolveAnswerProtocol(
  card: Pick<CharacterCard, "meta" | "mentalModels" | "heuristics" | "answerProtocol">
): AnswerProtocol {
  if (isAnswerProtocolValid(card.answerProtocol)) {
    return card.answerProtocol;
  }
  return deriveFallbackAnswerProtocol(card);
}
