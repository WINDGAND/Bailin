import { z } from "zod";

/**
 * AppearanceSpec：女娲流程中"外貌调研阶段"的结构化产出。
 * 它是 sprite 生成的输入（不是输出），也是"重新生成形象"功能的复用依据。
 * 详见 docs/product/CHARACTER-PROTOCOL.md §3 与 PRD §13bis。
 */

const ColorSchema = z.object({
  name: z.string().min(1).max(40),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

const OutfitItemSchema = z.object({
  name: z.string().min(1).max(80),
  color: ColorSchema,
  details: z.array(z.string()).default([])
});

const AccessorySchema = z.object({
  name: z.string().min(1).max(80),
  placement: z.string().min(1).max(80),
  color: ColorSchema,
  signature: z.boolean().default(false)
});

const GearSchema = z.object({
  name: z.string().min(1).max(80),
  placement: z.string().min(1).max(80),
  description: z.string().max(240).default("")
});

const PaletteRoleSchema = z.enum([
  "outline",
  "skin",
  "hair",
  "shirt",
  "pants",
  "accent",
  "signature",
  // v0.2 新增：让 sprite-builder 能渲染瞳色 / 腮红 / 双色 logo
  "eye",
  "cheek",
  "signature2"
]);

const PaletteEntrySchema = z.object({
  role: PaletteRoleSchema,
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

/** 性别。schema 必带；治"少女→男"幻觉的关键字段。 */
const GenderSchema = z.enum(["female", "male", "androgynous", "unknown"]);

/**
 * 视觉风格。驱动 sprite-builder 头身比例、眼睛尺寸、是否加腮红。
 *   - realistic     真人 / 写实 / 默认
 *   - anime-shoujo  少女漫风格（大眼、柔顺线条）
 *   - anime-shounen 少年漫风格（凌厉、棱角分明）
 *   - chibi         Q 版 / 大头娃娃（适合小红书审美）
 */
const AnimeStyleSchema = z.enum([
  "realistic",
  "anime-shoujo",
  "anime-shounen",
  "chibi"
]);

/** 一张参考图（用户上传或 web 搜到的官方人设图）。 */
const ReferenceImageSchema = z.object({
  /** user-upload 用户主动上传；web 联网搜到。 */
  source: z.enum(["user-upload", "web"]),
  /** 可以是 https:// 或 data:image/...;base64,... */
  url: z.string().min(1).max(8192),
  /** 给 vision 模型的角色提示：primary 主参考 / reference 辅助。 */
  role: z.enum(["primary", "reference"]).default("reference"),
  /** 简短备注（搜索 query / 文件名等），用于审计。 */
  notes: z.string().max(200).default("")
});

export const AppearanceSpecSchema = z.object({
  schemaVersion: z.literal("0.1"),
  build: z.enum(["slim", "average", "stocky", "muscular", "child"]),
  ageBand: z.enum(["child", "teen", "young-adult", "middle-age", "elder"]),
  /** v0.2 新增：性别。旧 bundle 缺字段时默认 unknown，保证向后兼容。 */
  gender: GenderSchema.default("unknown"),
  /** v0.2 新增：视觉风格。旧 bundle 默认 realistic，sprite-builder 保持旧行为。 */
  animeStyle: AnimeStyleSchema.default("realistic"),
  faceShape: z.string().min(1).max(80),
  skinTone: ColorSchema,
  hair: z.object({
    style: z.string().min(1).max(120),
    color: ColorSchema
  }),
  eyes: z.object({
    color: ColorSchema,
    shape: z.string().min(1).max(80),
    expression: z.string().min(1).max(80)
  }),
  facialFeatures: z.array(z.string().max(80)).default([]),
  outfit: z.object({
    iconic: z.boolean().default(false),
    top: OutfitItemSchema,
    bottom: OutfitItemSchema.optional(),
    footwear: OutfitItemSchema.optional(),
    accessories: z.array(AccessorySchema).default([])
  }),
  gear: z.array(GearSchema).default([]),
  palette: z.array(PaletteEntrySchema).min(2).max(16),
  styleTokens: z.array(z.string().max(40)).default([]),
  typicalScene: z.string().max(120).default(""),
  sourceConfidence: z.enum(["high", "medium", "low"]),
  citationNotes: z.array(z.string()).default([]),
  /**
   * v0.2 新增：本次生成用到的参考图清单。用于"重新生成形象"复用，以及质量审计。
   * 默认空数组，旧 bundle 缺字段时正常 fallback。
   */
  referenceImages: z.array(ReferenceImageSchema).max(8).default([])
});

export type AppearanceSpec = z.infer<typeof AppearanceSpecSchema>;
export type AppearancePaletteRole = z.infer<typeof PaletteRoleSchema>;
export type AppearanceAccessory = z.infer<typeof AccessorySchema>;
export type AppearanceColor = z.infer<typeof ColorSchema>;
export type AppearanceGender = z.infer<typeof GenderSchema>;
export type AppearanceAnimeStyle = z.infer<typeof AnimeStyleSchema>;
export type AppearanceReferenceImage = z.infer<typeof ReferenceImageSchema>;

/**
 * 从 AppearanceSpec 推导一行 ≤200 字的视觉摘要，落到旧的 meta.avatarHint。
 * 用于兼容旧字段 + 给 LLM/UI 一个快速可读的"长什么样"。
 */
export function summarizeAppearance(appearance: AppearanceSpec): string {
  const parts: string[] = [];
  const ageMap: Record<AppearanceSpec["ageBand"], string> = {
    child: "孩子",
    teen: "少年",
    "young-adult": "青年",
    "middle-age": "中年",
    elder: "老年"
  };
  const genderMap: Record<AppearanceGender, string> = {
    female: "女性",
    male: "男性",
    androgynous: "中性",
    unknown: ""
  };
  const styleMap: Record<AppearanceAnimeStyle, string> = {
    realistic: "",
    "anime-shoujo": "少女漫风",
    "anime-shounen": "少年漫风",
    chibi: "Q 版"
  };
  const headParts: string[] = [];
  const g = genderMap[appearance.gender ?? "unknown"];
  if (g) headParts.push(g);
  headParts.push(ageMap[appearance.ageBand]);
  headParts.push(`${appearance.build} 体型`);
  headParts.push(appearance.faceShape);
  const styleTag = styleMap[appearance.animeStyle ?? "realistic"];
  if (styleTag) headParts.push(styleTag);
  parts.push(headParts.join(" / "));
  parts.push(`${appearance.hair.color.name}${appearance.hair.style}`);
  parts.push(`${appearance.eyes.color.name}${appearance.eyes.shape}眼`);
  if (appearance.facialFeatures.length > 0) {
    parts.push(appearance.facialFeatures.slice(0, 3).join(" / "));
  }
  parts.push(
    `${appearance.outfit.top.color.name}${appearance.outfit.top.name}` +
      (appearance.outfit.top.details.length > 0
        ? `（${appearance.outfit.top.details.slice(0, 2).join(" / ")}）`
        : "")
  );
  const signatureAcc = appearance.outfit.accessories.filter((a) => a.signature);
  if (signatureAcc.length > 0) {
    parts.push("标志：" + signatureAcc.map((a) => a.name).join(" / "));
  }
  if (appearance.gear.length > 0) {
    parts.push("装备：" + appearance.gear.map((g) => g.name).join(" / "));
  }
  return parts.join("；").slice(0, 200);
}
