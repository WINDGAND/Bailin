/**
 * 外貌调研 prompt：百灵流程中 Phase·外貌的独立调用。
 * 输出严格 JSON，符合 character-protocol 的 AppearanceSpec schema。
 * 详见 README「角色协议」与 packages/character-protocol（AppearanceSpec）。
 */

export interface AppearanceResearchInput {
  characterName: string;
  sourceName?: string;
  sourceType: "public-figure" | "fictional" | "original";
  track: "utility" | "companion";
  userHint?: string;
  userMaterial?: string;
  /** 用户提供的参考图 URL 或 data URI（深度版第一步会优先采用）。 */
  userImageRef?: string;
}

/** 单张参考图的元信息（vision pipeline 用）。 */
export interface VisionReferenceImage {
  /** https:// URL 或 data:image/...;base64,... */
  url: string;
  source: "user-upload" | "web";
  role?: "primary" | "reference";
  notes?: string;
}

export const APPEARANCE_OUTPUT_SCHEMA_DESCRIPTION = `
{
  "schemaVersion": "0.1",
  "gender": "female | male | androgynous | unknown   // 必填，治'少女→男'幻觉的关键字段",
  "animeStyle": "realistic | anime-shoujo | anime-shounen | chibi   // 二次元角色必填对应风格；真人统一 realistic",
  "build": "slim | average | stocky | muscular | child",
  "ageBand": "child | teen | young-adult | middle-age | elder",
  "faceShape": "short, e.g. '国字脸' / '瓜子脸' / '圆脸'",
  "skinTone": { "name": "string", "hex": "#RRGGBB" },
  "hair": {
    "style": "e.g. '偏分黑短发' / '扎起的深棕中长马尾' / '齐肩金色侧编发 + 蓝色发带'",
    "color": { "name": "string", "hex": "#RRGGBB" }
  },
  "eyes": {
    "color": { "name": "string", "hex": "#RRGGBB" },
    "shape": "e.g. '细长' / '圆睁' / '大眼水汪汪'",
    "expression": "e.g. '坚定' / '锐利' / '温和' / '空灵'"
  },
  "facialFeatures": ["黑框眼镜", "胡渣", "酒窝", "腮红", "...最多 6 项"],
  "outfit": {
    "iconic": true,
    "top": {
      "name": "e.g. '湖人紫色背心球衣' / '调查兵团米褐色短外套' / '深蓝西装' / '蓝色军装外套 + 白色高领装饰'",
      "color": { "name": "string", "hex": "#RRGGBB" },
      "details": ["白底翼章", "胸前 'Lakers' 字样", "袖口翻边"]
    },
    "bottom": { "name": "e.g. '及踝米色长裙'", "color": { "name": "...", "hex": "#RRGGBB" }, "details": [] },
    "footwear": { "name": "...", "color": { "name": "...", "hex": "#RRGGBB" }, "details": [] },
    "accessories": [
      { "name": "红蓝拼色长领带", "placement": "胸前垂到腹前", "color": { "name": "红蓝拼色", "hex": "#b41e2f" }, "signature": true },
      { "name": "翡翠胸针", "placement": "颈前白领结中央", "color": { "name": "翡翠绿", "hex": "#3da26e" }, "signature": true }
    ]
  },
  "gear": [
    { "name": "立体机动装置侧挂", "placement": "腰部两侧", "description": "灰色直棍 + 黄色绑带" },
    { "name": "机械义肢手", "placement": "双手", "description": "金属关节 + 棕色皮手套" }
  ],
  "palette": [
    { "role": "outline", "hex": "#0f0f0f" },
    { "role": "skin", "hex": "#f1c8a5" },
    { "role": "hair", "hex": "#f0d28a" },
    { "role": "eye", "hex": "#3aa0e0" },
    { "role": "shirt", "hex": "#2e4b78" },
    { "role": "pants", "hex": "#d8c9a8" },
    { "role": "accent", "hex": "#c8a040" },
    { "role": "signature", "hex": "#3da26e" }
  ],
  "styleTokens": ["军装", "庄重", "维多利亚风", "..."],
  "typicalScene": "邮政公司打字机前 / 战后欧式街道",
  "sourceConfidence": "high | medium | low",
  "citationNotes": ["京阿尼《紫罗兰永恒花园》设定集", "京阿尼官网角色页"]
}

palette role 枚举完整列表：outline / skin / hair / shirt / pants / accent / signature / eye / cheek / signature2
（最多 16 项；eye / cheek / signature2 是 v0.2 新增，没有则可不写）
`.trim();

const SHARED_APPEARANCE_DISCIPLINE = [
  "纪律（违反任何一条都会让用户看到错误的形象，导致取消订阅）：",
  "1. 一手来源优先：官方照片 / 原作设定集 / 球队 / 公司官网 / 当事人公开账号。",
  "2. **gender / animeStyle 必须正确**：",
  "   - 角色为少女 / 女性 → 必须 gender='female'，不许默认 male，不许 unknown。",
  "   - 二次元少女风格 → animeStyle='anime-shoujo'；少年漫主角 → 'anime-shounen'；Q 版 → 'chibi'；真人 → 'realistic'。",
  "   - 如果角色名 / 作品有同名男/女角色，必须用最广为人知的版本，并在 citationNotes 写明歧义处理。",
  "3. **调色板必须从已知主色提取**，不能默认套通用配色。",
  "   - 真实公众人物：尊重其常见公开形象（科比 → 紫金；张雪峰 → 黑灰；懂王 → 深蓝西装 + 红蓝领带；马斯克 → 深黑 T；MrBeast → 蓝 T）",
  "   - 虚构男性：艾伦 → 米褐调查兵团外套 + 翼章 + 立体机动装置",
  "   - 虚构少女示例（必须严格遵守，**不要套男性西装模板**）：",
  "     · 薇尔莉特·伊芙加登（Violet Evergarden）= 金色齐肩侧编发 + 蓝色发带 + 蓝色军装外套 + 白色高领装饰 + 翡翠胸针 + 米色长裙 + 棕色长靴 + 双手机械义肢；gender=female, animeStyle=anime-shoujo",
  "     · 初音未来（Hatsune Miku）= 青绿色双马尾长发 + 灰色无袖衬衫 + 深灰短裙 + 蓝绿色领带 + 黑色长靴；gender=female, animeStyle=anime-shoujo",
  "     · 雷电将军（Raiden Shogun）= 紫色长发盘髻 + 紫红色和服式长袍 + 金色饰物 + 红眼；gender=female, animeStyle=anime-shoujo",
  "4. **signature accessory 必须标出 ≥1 项** —— 这是该角色一眼可识别的视觉锚点：",
  "   - 科比 = 24 号球衣 + 紫金配色",
  "   - 艾伦 = 调查兵团翼章 + 米褐外套 + 立体机动装置（gear）",
  "   - 张雪峰 = 黑框眼镜 + 黑西装",
  "   - 懂王 = 金色梳背发型 + 红蓝拼色长领带",
  "   - MrBeast = 蓝色 logo T 恤",
  "   - 马斯克 = 黑色素 T 恤",
  "   - 薇尔莉特 = 翡翠胸针 + 蓝色军装 + 机械义肢",
  "   - 初音未来 = 青绿色双马尾 + 蓝绿色领带",
  "5. **eyes.color 必须按角色实际填**，不能默认黑色 / 棕色。蓝眼 → '#3aa0e0'，金眼 → '#d9b14a'，紫眼 → '#9b5fd1'，翡翠绿 → '#3da26e'。同时在 palette 里也加一项 role='eye'。",
  "6. 不输出任何不能直接落到像素的字段：避免 vague 描述（如'帅气'/'有魅力'）。",
  "7. 不杜撰：不知道的字段也宁可留空数组 / 'medium' confidence，不要硬填。",
  "8. 不输出色情、政治极端、未成年色情内容。"
].join("\n");

/**
 * 旧版「快速」外貌调研 prompt，保留为兼容。
 * 一次性输出 JSON，纯靠训练知识。
 */
export function buildAppearanceResearchPrompt(input: AppearanceResearchInput): {
  system: string;
  user: string;
} {
  const { characterName, sourceName, sourceType, track, userHint, userMaterial } = input;

  const system = [
    "你是 百灵 Bailin 的外貌调研员（appearance researcher）。",
    "你的工作只有一件：为目标角色提炼一份**像素桌宠可直接转译**的结构化外貌规格。",
    "",
    "1. 输出严格 JSON，仅 JSON。不要 markdown 代码块包裹、不要解释、不要尾部注释。",
    "",
    SHARED_APPEARANCE_DISCIPLINE,
    "",
    "## 输出 JSON 契约（必须严格遵守字段名）",
    "",
    APPEARANCE_OUTPUT_SCHEMA_DESCRIPTION,
    "",
    "字段提示：",
    "- palette 必须 2-12 项，每项 hex 6 位（#RRGGBB），role 限定为 outline/skin/hair/shirt/pants/accent/signature 之一",
    "- outfit.top / bottom / footwear / accessories 中所有 color.hex 也必须是 #RRGGBB",
    "- 字符串字段不要超过描述范围，gear.description ≤240 字符，typicalScene ≤120 字符"
  ].join("\n");

  const userLines: string[] = [
    `请为 "${characterName}"${sourceName ? `（${sourceName}）` : ""} 输出外貌调研 JSON。`,
    `来源类型：${sourceType}；产品定位：${track === "utility" ? "实用·思维顾问" : "情感·桌面陪伴"}。`
  ];
  if (userHint && userHint.trim().length > 0) {
    userLines.push("");
    userLines.push("用户提供的外貌补充（权威性高于训练知识）：");
    userLines.push(userHint.trim());
  }
  if (userMaterial && userMaterial.trim().length > 0) {
    userLines.push("");
    userLines.push("用户提供的补充素材（节选，仅用于参考外貌相关信息）：");
    userLines.push("---");
    userLines.push(userMaterial.slice(0, 2000));
    userLines.push("---");
  }
  userLines.push("");
  userLines.push("现在开始：直接输出 JSON。");

  return { system, user: userLines.join("\n") };
}

// ============================================================
// 深度版三步：A 联网搜图描述 → B 生成 spec → C 自我批评
// ============================================================

/** 第一步：联网搜图，让模型给出公开形象的文字描述（非结构化）。 */
export function buildAppearanceImageSearchPrompt(input: AppearanceResearchInput): {
  system: string;
  user: string;
} {
  const { characterName, sourceName, sourceType, userHint, userImageRef } = input;

  const system = [
    "你是 百灵 Bailin 深度外貌蒸馏第 1 步「视觉调研员」。",
    "你的任务：用 web_search 工具搜公开图片描述（不下载图片，只读取搜索结果摘要 + URL），",
    "输出一份 200~600 字的 Markdown「公开形象描述」。",
    "",
    "搜索策略：至少 3 次搜索，覆盖以下关键词组合（中英文都试）：",
    "- \"<人物名> photo portrait outfit\"",
    "- \"<人物名> official photo\" / \"<人物名> 官方写真 / 设定集\"",
    "- 如果是球星：球衣编号 + 球队；如果是 CEO：发布会着装；如果是二次元：人设图",
    "",
    SHARED_APPEARANCE_DISCIPLINE,
    "",
    "输出 Markdown 结构：",
    "## 公开形象 1（最常见的形象 / 代表性场景）",
    "## 公开形象 2（次要 / 备选形象）",
    "## 标志性识别点（≥3 条，逐条说为什么一眼可认出）",
    "## 引用来源（URL 列表）"
  ].join("\n");

  const userLines: string[] = [
    `调研对象：「${characterName}」${sourceName ? `（${sourceName}）` : ""}`,
    `类型：${sourceType}`
  ];
  if (userHint) {
    userLines.push("", "用户外貌补充（最高权威）：", userHint.trim());
  }
  if (userImageRef) {
    userLines.push(
      "",
      "用户提供的参考图链接（最高权威）：",
      userImageRef.slice(0, 500)
    );
  }
  userLines.push(
    "",
    "现在开始搜索并整理，输出 Markdown。"
  );

  return { system, user: userLines.join("\n") };
}

/** 第二步：把上一步的 Markdown 描述转成结构化 JSON AppearanceSpec。 */
export function buildAppearanceSpecPrompt(
  input: AppearanceResearchInput & { visualDescription: string }
): { system: string; user: string } {
  const { characterName, sourceType, track, visualDescription, userHint } = input;

  const system = [
    "你是 百灵 Bailin 深度外貌蒸馏第 2 步「结构化器」。",
    "把传入的「公开形象描述」转译为像素桌宠可消费的结构化 JSON。",
    "",
    "1. 输出严格 JSON，仅 JSON。不要 markdown 代码块包裹、不要解释、不要尾部注释。",
    "",
    SHARED_APPEARANCE_DISCIPLINE,
    "",
    "## 输出 JSON 契约",
    "",
    APPEARANCE_OUTPUT_SCHEMA_DESCRIPTION,
    "",
    "字段提示：",
    "- palette 必须 2-12 项，每项 hex 6 位（#RRGGBB），role ∈ outline/skin/hair/shirt/pants/accent/signature",
    "- outfit.top / bottom / footwear / accessories 中所有 color.hex 也必须是 #RRGGBB",
    "- 字符串字段不要超长，gear.description ≤240 字符，typicalScene ≤120 字符"
  ].join("\n");

  const userLines: string[] = [
    `角色：「${characterName}」`,
    `类型：${sourceType}；定位：${track === "utility" ? "实用·思维顾问" : "情感·桌面陪伴"}`,
    "",
    "## 第 1 步「公开形象描述」",
    "",
    visualDescription.slice(0, 4000),
    ""
  ];
  if (userHint) {
    userLines.push("## 用户外貌补充（最高权威）", "", userHint.trim(), "");
  }
  userLines.push("现在转译为结构化 JSON，直接输出。");

  return { system, user: userLines.join("\n") };
}

// ============================================================
// Vision pipeline: 直接喂图给视觉模型读，结构化输出
// ============================================================

/**
 * Vision Step A：让视觉模型「看着图」描述角色外貌。
 * 调用方负责把 referenceImages 作为 multimodal image part 拼到 user content 上。
 *
 * 输出 Markdown「视觉描述」，强调 gender / animeStyle / iconic 视觉锚点。
 */
export function buildAppearanceVisionExtractionPrompt(input: {
  characterName: string;
  sourceName?: string;
  sourceType: "public-figure" | "fictional" | "original";
  userHint?: string;
  referenceImageCount: number;
}): { system: string; user: string } {
  const { characterName, sourceName, sourceType, userHint, referenceImageCount } = input;

  const system = [
    "你是 百灵 Bailin 「视觉读图员」。你现在能直接看到用户随消息附上的角色参考图。",
    "你的任务：仔细观察图片，输出一份 300~700 字的 Markdown「视觉证据描述」，",
    "为后续结构化器（Step B）提供事实依据。不许凭训练记忆瞎补，必须以图为准。",
    "",
    "必填观察维度（每一项都基于图片像素证据，不能跳过）：",
    "- 性别：female / male / androgynous（看不出再写 unknown）",
    "- 视觉风格：realistic / anime-shoujo / anime-shounen / chibi",
    "- 年龄段：child / teen / young-adult / middle-age / elder",
    "- 头发：长度（短发/中长/齐肩/腰长）+ 发型（直/卷/扎/盘）+ 颜色 hex 估计",
    "- 眼睛：颜色 hex 估计 + 形状 + 神态",
    "- 面部特征：腮红 / 痣 / 眼镜 / 胡渣 等可见细节",
    "- 上衣：类型（西装/T 恤/军装/水手服/连衣裙/制服/和服/长袍）+ 主色 + 衣领/纽扣/装饰细节",
    "- 下装：裤 / 短裤 / 长裙 / 短裙 + 颜色",
    "- 鞋：类型 + 颜色",
    "- 标志性配饰：发带 / 项链 / 翼章 / 胸针 / 武器 / 机械义肢 等 ≥1 项",
    "- 主色调（3~5 个 hex），用于 palette",
    "",
    SHARED_APPEARANCE_DISCIPLINE,
    "",
    "输出 Markdown 结构：",
    "## 整体一句话",
    "## 性别 / 视觉风格 / 年龄",
    "## 头发 / 眼睛 / 面部",
    "## 服装（上衣 / 下装 / 鞋）",
    "## 标志性识别点（≥3 条，每条要写明在图中第几张可见）",
    "## 主色调（hex 列表）"
  ].join("\n");

  const userLines: string[] = [
    `角色：「${characterName}」${sourceName ? `（${sourceName}）` : ""}`,
    `类型：${sourceType}`,
    `参考图数量：${referenceImageCount}（按顺序标为 1, 2, 3 …，primary 排第一）`
  ];
  if (userHint) {
    userLines.push("", "用户外貌补充（最高权威，与图片冲突时以用户为准）：", userHint.trim());
  }
  userLines.push(
    "",
    "请仔细观察附图，按上面给定的 Markdown 结构输出视觉证据描述。",
    "如果图片为空 / 全黑 / 无法识别角色，请直接输出「无法识别」并停止。"
  );

  return { system, user: userLines.join("\n") };
}

/**
 * Vision Step Verify：让视觉模型在「看着图」的情况下验证 Step B 生成的 AppearanceSpec。
 * 输出严格 JSON：{ pass: boolean, mismatches: string[], suggestions: object }
 *
 * 调用方负责把图片作为 multimodal image part 拼上去。
 */
export function buildAppearanceVisionVerificationPrompt(input: {
  characterName: string;
  specJson: string;
  referenceImageCount: number;
}): { system: string; user: string } {
  const { characterName, specJson, referenceImageCount } = input;

  const system = [
    "你是 百灵 Bailin 「视觉验证员」。你能看到附上的角色参考图，也拿到了 Step B 生成的 AppearanceSpec JSON。",
    "你的任务：逐字段对比 JSON 与图片，挑出与图片不符的字段。",
    "",
    "重点核查（任何一项不一致都必须列出 mismatch）：",
    "- gender 是否与图片性别一致",
    "- animeStyle 是否与图片画风一致",
    "- hair.color / hair.style 是否大致匹配",
    "- eyes.color 是否匹配（蓝色不能写成黑色）",
    "- outfit.top.name + 颜色是否匹配",
    "- iconic accessory 是否漏掉（如薇尔莉特的翡翠胸针、初音的双马尾）",
    "",
    "输出严格 JSON，仅 JSON：",
    "{",
    '  "pass": true | false,',
    '  "mismatches": [ "gender 应为 female，spec 写了 male", "eyes.color 应为蓝色 (#3aa0e0)，spec 写了黑色" ],',
    '  "suggestions": { "gender": "female", "eyes.color.hex": "#3aa0e0", "outfit.top.name": "蓝色军装外套" }',
    "}",
    "",
    "若全部一致：pass=true, mismatches=[], suggestions={}。",
    "若关键字段（gender / iconic / 主色）不符：pass=false。"
  ].join("\n");

  const user = [
    `角色：「${characterName}」`,
    `参考图数量：${referenceImageCount}`,
    "",
    "## 待校验的 AppearanceSpec JSON",
    "",
    specJson.slice(0, 6000),
    "",
    "请对照附图核查上面 JSON 的每个关键字段，输出 JSON。"
  ].join("\n");

  return { system, user };
}

/**
 * 第三步：自我批评 + 修正。
 * 输入：上一步 AppearanceSpec JSON 字符串。
 * 输出：修正后的 AppearanceSpec JSON（同 schema）。
 */
export function buildAppearanceCritiquePrompt(
  input: AppearanceResearchInput & { specJson: string }
): { system: string; user: string } {
  const { characterName, specJson } = input;

  const system = [
    "你是 百灵 Bailin 深度外貌蒸馏第 3 步「自我批评员」。",
    "你拿到一个已经生成好的 AppearanceSpec JSON，需要：",
    "1. 自评 3 个问题：",
    "   - 这个外貌一眼能识别为「" + characterName + "」吗？",
    "   - signature accessories 抓到了吗？数量是否足够（≥1 个）？",
    "   - 调色板与该角色公开形象是否一致？有没有套了通用配色？",
    "2. 如果发现问题，修正具体字段：补 signature、改色号、加 gear。",
    "3. 输出严格 JSON，仅 JSON——结构与传入相同，但已修正。",
    "4. 如果原 JSON 已经很好，直接原样输出（但要保证字段合法）。",
    "",
    SHARED_APPEARANCE_DISCIPLINE,
    "",
    "## 输出 JSON 契约",
    "",
    APPEARANCE_OUTPUT_SCHEMA_DESCRIPTION
  ].join("\n");

  const user = [
    `角色：「${characterName}」`,
    "",
    "## 待批评的 AppearanceSpec JSON",
    "",
    specJson.slice(0, 6000),
    "",
    "现在批评 + 修正，直接输出修正后的完整 JSON。"
  ].join("\n");

  return { system, user };
}
