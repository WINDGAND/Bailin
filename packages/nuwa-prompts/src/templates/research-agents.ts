/**
 * 6 Agent 调研 prompt 集合：女娲深度蒸馏 Phase·1。
 * 每个 Agent 输出 Markdown（不是 JSON），最终 6 份 md 落到
 *   %APPDATA%/Bailin/research/<characterId>/0X-*.md
 * 并喂给 Phase·2（framework-synthesis）合成心智模型。
 *
 * 对应 huashu-nuwa SKILL.md 第 213 行附近的 6 维度任务分配。
 */

export interface ResearchAgentInput {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  track: "utility" | "companion";
  /** 用户补充素材（可选）。 */
  userMaterial?: string;
  /** 是否启用 web_search 工具。FALSE 时 prompt 改为「只用训练知识」。 */
  webSearchEnabled: boolean;
  /**
   * 角色的原作名 / 上下文锚点（用于消歧义），如「进击的巨人」、「Attack on Titan」。
   * 虚构角色推荐传入：单字 / 二字角色名（三笠、绫波）在没有作品上下文时
   * 经常被 search-preview 模型识别成其它同名物（战舰 / 地名 / 姓氏），
   * 拿不到任何 citations。
   */
  sourceContext?: string;
  /** 角色的英文名 / 原文名，强化搜索 query 的命中率（如 "Mikasa Ackerman"）。 */
  englishName?: string;
  /** 本维度已从用户素材提取的摘要（local-first 模式 partial 维度）。 */
  localMaterialFocus?: string;
}

export type ResearchAgentSlug =
  | "writings"
  | "conversations"
  | "expression-dna"
  | "external-views"
  | "decisions"
  | "timeline";

const SHARED_DISCIPLINE = `
通用纪律：
1. 你必须输出 GitHub Flavored Markdown，不要 JSON、不要代码块包裹整篇答案。
2. 标注每条信息的来源：一手（此人本人作品/账号）/ 二手（媒体转述）/ 推断（你的推理）。
3. **信息源黑名单**：知乎、微信公众号、百度百科 / 百度知道。这三类信息严禁作为依据。
4. 中文人物优先采用：本人著作 / B站原始视频 / 小宇宙播客 / 36氪 / 晚点LatePost / 财新 / 极客公园 / 第一财经 / 虎嗅 / 少数派 / 机器之心。
5. 西方人物优先采用：本人著作 / 官方 X(Twitter) / YouTube 长访谈 / 主流播客 transcript / Amazon 长评。
6. 区分「他说过的」「别人说他的」「我推断的」三类，不混淆。
7. 矛盾必须保留——不要为了"看起来一致"而和稀泥。
8. 单条来源至少标一个 URL；如果是非 URL 引用（书 / 节目 / 视频），写明完整出处。
9. 输出末尾必须包含一个「## 引用来源」小节，列出本次调研引用过的所有 URL / 出处。
10. 输出末尾必须包含一个「## 自评」小节，给出 confidence: high|medium|low，并说明理由（信息够不够、是否大量靠推测）。
11. 任何政治极端、色情、未成年不当内容、煽动性宣传一律不写。
`.trim();

const RESEARCH_AGENT_DEFS: Record<
  ResearchAgentSlug,
  {
    title: string;
    agentName: string;
    focus: string[];
    extract: string[];
    /**
     * 候选搜索关键词模板。webSearchEnabled=true 时会被注入到 system prompt，
     * 强烈引导模型先搜这些 query；对 OpenAI chat completions search-preview 模型尤其关键
     *（中转商对长任务式 prompt 经常跳过 search，必须给出候选 query 才能稳定触发）。
     * 用 `{name}` 占位字符替换为目标人物名。
     */
    suggestedQueries: string[];
    /** 给 user 段补充的特殊说明（如时间线 agent 要查近 12 个月）。 */
    extra?: string;
  }
> = {
  writings: {
    title: "1. 著作 / 长文调研员",
    agentName: "著作与系统思考",
    focus: [
      "此人出版的书籍（书名、出版年、核心论点）",
      "长文 / newsletter / 论文 / 博客系列",
      "反复出现 ≥3 次的核心论点（这些是真信念）",
      "此人自创的术语、概念、隐喻",
      "公开推荐过的书单（揭示智识谱系）"
    ],
    extract: [
      "为每本书 / 每个长篇产出：标题、出版年、3 行核心论点",
      "列出 5-12 个反复出现的核心论点，每个标注出现过的至少 2 个不同场景",
      "列出 3-8 个自创术语 / 专属概念，带定义",
      "推荐书单 / 思想源头：至少 3 个"
    ],
    suggestedQueries: [
      `"{name}" 著作 书籍 list`,
      `"{name}" books bibliography`,
      `"{name}" 推荐书单 思想`,
      `"{name}" essay long-form site:medium.com OR site:substack.com`
    ]
  },
  conversations: {
    title: "2. 长对话 / 访谈调研员",
    agentName: "长对话与即兴思考",
    focus: [
      "深度长访谈（≥30 分钟）、AMA、播客、Q&A",
      "被追问时的回答模式",
      "即兴抛出的类比与比喻",
      "在公开场合改变立场的瞬间",
      "拒绝回答 / 回避的问题及其方式"
    ],
    extract: [
      "至少 3 段长对话场景：场景 + 关键问题 + 此人的回答策略",
      "至少 5 个即兴类比 / 比喻，每个带原文出处",
      "至少 2 个立场变化案例：原立场 / 新立场 / 变化原因",
      "至少 2 个回避案例：他在什么话题上闭口"
    ],
    suggestedQueries: [
      `"{name}" interview transcript`,
      `"{name}" podcast 访谈 完整`,
      `"{name}" AMA Q&A`,
      `"{name}" 长访谈 record`
    ]
  },
  "expression-dna": {
    title: "3. 表达 DNA 调研员",
    agentName: "碎片表达与风格",
    focus: [
      "Twitter/X、微博、即刻、短文等碎片化表达",
      "高频词、签名句式、专属术语",
      "公开争议立场（不流俗的观点）",
      "幽默方式：讽刺 / 自嘲 / 荒诞 / 冷幽默 / 不幽默",
      "公开辩论中的攻击 / 防守套路"
    ],
    extract: [
      "高频词 / 高频句式：列 8-15 个，每个带 1-2 条出处",
      "标志性的「就是这个人会说的话」金句：5-10 句",
      "禁忌词：他几乎不会说的词或套话",
      "争议立场：3-6 条与主流相悖的观点 + 何时何地说过",
      "幽默 vs 严肃比例：用 1 句话概括"
    ],
    suggestedQueries: [
      `"{name}" 名言 quotes 经典`,
      `"{name}" twitter X 高频`,
      `"{name}" 语录 金句`,
      `"{name}" famous sayings`
    ]
  },
  "external-views": {
    title: "4. 他者视角调研员",
    agentName: "外部观察与批评",
    focus: [
      "他人写的传记 / 长文分析",
      "竞争对手 / 同行的评价",
      "批评者的攻击 / 揭露",
      "与同类人物的对比",
      "粉丝群体 vs 黑粉的形象差异"
    ],
    extract: [
      "他人观察到的「外人才看得到的模式」：至少 4 条",
      "至少 3 条来自批评者的攻击 / 揭露（即使你不同意也要列出）",
      "与至少 1 个同行的对比：A 怎么做 vs 此人怎么做",
      "形象分裂：粉丝眼中 vs 黑粉眼中 vs 中立媒体眼中的差别"
    ],
    suggestedQueries: [
      `"{name}" 评价 批评 争议`,
      `"{name}" criticism analysis`,
      `"{name}" biography 传记`,
      `"{name}" controversy`
    ]
  },
  decisions: {
    title: "5. 决策记录调研员",
    agentName: "决策与行动",
    focus: [
      "重大决策 / 转折点 / 公开争议行为",
      "决策当时的背景与公开理由",
      "事后此人对该决策的反思",
      "言行一致 / 不一致的案例",
      "失败决策（很多人物的真实模式藏在失败里）"
    ],
    extract: [
      "至少 4 个重大决策：背景 / 决策 / 公开理由 / 事后反思",
      "至少 2 个言行不一致案例：他说 X，却做了 Y",
      "至少 1 个失败 / 翻车案例：发生了什么，他怎么应对",
      "决策模式总结：1-2 句话提炼他做决定的反复出现的套路"
    ],
    suggestedQueries: [
      `"{name}" 重大决策 转折`,
      `"{name}" decision making controversy`,
      `"{name}" 翻车 失败 复盘`,
      `"{name}" famous moments timeline`
    ]
  },
  timeline: {
    title: "6. 时间线调研员",
    agentName: "人物时间线",
    focus: [
      "从出生 / 设定起点到现在的关键里程碑",
      "思想转折点 / 学习路径",
      "**最近 12 个月的动态**（防止 Skill 过时）",
      "重大职业 / 作品变更"
    ],
    extract: [
      "Markdown 表格：| 时间 | 事件 | 对其思维的影响（如有） |",
      "至少覆盖 8-15 个关键节点，按时间正序",
      "**最近 12 个月单独列一个小节**，越具体越好",
      "如果是虚构角色：用故事内时间线（章节 / 集数 / 设定年代）"
    ],
    suggestedQueries: [
      `"{name}" wikipedia 生平`,
      `"{name}" biography timeline`,
      `"{name}" 近期 最新`,
      `"{name}" recent news`
    ],
    extra:
      "对于虚构 / 二次元角色：以原作设定的故事时间线为主，不要把作者外部时间混进去。"
  }
};

export const RESEARCH_AGENT_ORDER: ResearchAgentSlug[] = [
  "writings",
  "conversations",
  "expression-dna",
  "external-views",
  "decisions",
  "timeline"
];

export function buildResearchAgentPrompt(
  slug: ResearchAgentSlug,
  input: ResearchAgentInput
): { system: string; user: string; agentName: string } {
  const def = RESEARCH_AGENT_DEFS[slug];
  const {
    characterName,
    sourceType,
    track,
    userMaterial,
    webSearchEnabled,
    sourceContext,
    englishName,
    localMaterialFocus
  } = input;
  // 构造主要搜索锚点：英文名（如果有）+ 原作上下文（如果有）拼成完整短语。
  // 例："Mikasa Ackerman Attack on Titan" 或 "三笠 进击的巨人"
  // 这能显著降低 search-preview 模型对单字/二字角色名的歧义率。
  const fullEnglish = [englishName, sourceContext].filter(Boolean).join(" ");
  const fullChinese = sourceContext
    ? `${characterName} ${sourceContext}`
    : characterName;
  const subject = englishName
    ? `${characterName} / ${englishName}` + (sourceContext ? `（${sourceContext}）` : "")
    : characterName + (sourceContext ? `（${sourceContext}）` : "");

  // 关键修复：把强搜索指令放到 system prompt 最前面。
  //
  // 实测背景（scripts/debug/debug-prompt-shape.mjs）：
  //   - OpenAI chat completions 系列的 search-preview 模型在长任务式 prompt 下经常**跳过搜索**，
  //     直接靠训练知识硬编（命中率 0/3）；尽管 OpenAI 官方说 "always search before responding"，
  //     但 OhMyGPT 等中转的实现并不可靠。
  //   - 在 system prompt 顶部加 "必须先调用 web_search 至少 N 次，不允许仅凭训练知识"
  //     + 候选 query 列表后，命中率提升到 3/3。
  //
  // 策略：第一句就用强指令把这件事钉死，再附上候选 query 帮模型构造搜索 token。
  const lines: string[] = [];

  if (webSearchEnabled) {
    // 候选 query：把 {name} 占位符替换为「中文名 + 原作」/「英文名 + 原作」两种组合，
    // 一份模板生成两套 query，命中率显著高于只用单一短词。
    const qs: string[] = [];
    for (const tmpl of def.suggestedQueries) {
      qs.push(tmpl.replace(/\{name\}/g, fullChinese));
      if (fullEnglish && fullEnglish !== fullChinese) {
        qs.push(tmpl.replace(/\{name\}/g, fullEnglish));
      }
    }
    lines.push(
      `**任务：联网调研「${subject}」的「${def.agentName}」维度，并写一份 Markdown 报告。**`,
      "",
      "**强制要求**：",
      `1. 你**必须先调用 web_search 工具**至少 3 次再开始写报告，搜索时务必带上「${
        sourceContext ?? characterName
      }」作为消歧义锚点。`,
      "2. **严禁仅凭训练知识作答**——如果训练数据有空白，宁可写「来源不足，暂未覆盖」也不要编。",
      "3. 报告最终必须包含至少 3 个真实可访问的 URL（http:// 或 https://）作为引用，否则视为失败。",
      "4. 如果搜索结果指向同名其它实体（如同名地名 / 战舰 / 姓氏），立刻换更精确的 query 再搜，**不要**用错位实体的资料硬凑。",
      "",
      "**建议的搜索关键词**（自由组合，至少跑 3 个；中英文交错搜）：",
      ...qs.slice(0, 8).map((q) => `- ${q}`),
      "",
      `你是 百灵 Bailin 深度蒸馏流程中的「${def.title}」。`,
      "",
      "调研方向：",
      ...def.focus.map((s) => `- ${s}`),
      "",
      "必须提取的产物：",
      ...def.extract.map((s) => `- ${s}`),
      ""
    );
  } else {
    lines.push(
      `**任务：基于训练知识为「${characterName}」写一份「${def.agentName}」维度的 Markdown 报告。**`,
      "",
      "**当前模式：不启用联网搜索**——只用你的训练知识。所有信息必须标注「（基于训练知识）」并自评 confidence 偏 medium / low。",
      "",
      `你是 百灵 Bailin 深度蒸馏流程中的「${def.title}」。`,
      "",
      "调研方向：",
      ...def.focus.map((s) => `- ${s}`),
      "",
      "必须提取的产物：",
      ...def.extract.map((s) => `- ${s}`),
      ""
    );
  }

  if (def.extra) lines.push(def.extra, "");

  lines.push(SHARED_DISCIPLINE);

  const system = lines.join("\n");

  const userParts: string[] = [
    `调研对象：「${subject}」`,
    sourceContext ? `所属作品 / 上下文：${sourceContext}` : "",
    `类型：${sourceType}（${
      sourceType === "public-figure"
        ? "公众人物 / 真人"
        : sourceType === "fictional"
          ? "虚构 / 二次元角色"
          : "原创角色"
    }）`,
    `产品定位：${track === "utility" ? "实用·思维顾问" : "情感·桌面陪伴"}`,
    "",
    "输出格式约束：",
    "- 使用 Markdown 标题（##、###）和列表 / 表格",
    "- 全文不少于 600 字，不超过 6000 字",
    "- 必须包含「## 引用来源」与「## 自评」小节"
  ].filter(Boolean);

  if (userMaterial && userMaterial.trim().length > 0) {
    userParts.push(
      "",
      "用户提供的补充素材（权威性高于你搜到的二手转述，优先采用）：",
      "---",
      userMaterial.slice(0, 8000),
      "---"
    );
  }

  if (localMaterialFocus && localMaterialFocus.trim().length > 0) {
    userParts.push(
      "",
      "本维度已从用户素材提取的要点（必须优先采用，可在此基础上整理成完整调研）：",
      "---",
      localMaterialFocus.slice(0, 4000),
      "---"
    );
  }

  userParts.push(
    "",
    webSearchEnabled
      ? `现在请**先用 web_search 搜索**（搜索 query 必须包含「${
          sourceContext ?? characterName
        }」作为消歧义锚点），再开始为「${subject}」做「${def.agentName}」调研。`
      : localMaterialFocus
        ? `现在请**仅基于用户素材与训练知识**（不要联网搜索），为「${subject}」做「${def.agentName}」调研。`
        : `现在开始为「${subject}」做「${def.agentName}」调研（不联网，仅用训练知识${
            userMaterial?.trim() ? "与用户素材" : ""
          }）。`
  );

  return { system, user: userParts.join("\n"), agentName: def.agentName };
}
