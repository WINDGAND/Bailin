import { z } from "zod";
import { AppearanceSpecSchema } from "./appearance.js";

/**
 * CharacterCard 描述一个角色"怎么想 / 怎么说"。
 * 这是女娲 SKILL.md 的结构化产品版本。详细对应见 docs/product/CHARACTER-PROTOCOL.md §2。
 */

export const SCHEMA_VERSION = "0.1" as const;

export const RoleplayRulesSchema = z.object({
  firstPersonOnly: z.literal(true),
  disclaimerOnce: z.literal(true),
  exitTriggers: z.array(z.string()).min(1),
  refusalStyle: z.string().optional()
});

export const IdentitySchema = z.object({
  selfIntro: z.string().min(1).max(800),
  origin: z.string().min(1).max(800),
  currentDoing: z.string().max(800).optional()
});

export const MentalModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  oneLiner: z.string().min(1).max(240),
  evidence: z.array(z.string()).min(1),
  appliesTo: z.array(z.string()).min(1),
  limits: z.string().min(1).max(400)
});

export const HeuristicSchema = z.object({
  id: z.string().min(1),
  rule: z.string().min(1).max(200),
  scenario: z.string().min(1).max(200),
  example: z.string().max(400).optional()
});

export const ExpressionDNASchema = z.object({
  sentencePattern: z.string().min(1).max(200),
  vocabulary: z.object({
    frequent: z.array(z.string()).default([]),
    signature: z.array(z.string()).default([]),
    forbidden: z.array(z.string()).default([])
  }),
  rhythm: z.string().min(1).max(200),
  humor: z.string().min(1).max(200),
  certainty: z.enum(["cautious", "assertive", "mixed"]),
  citationHabits: z.string().max(200).optional()
});

export const ValuesSchema = z.object({
  pursue: z.array(z.string()),
  reject: z.array(z.string()),
  tensions: z.array(z.string()).optional()
});

export const TimelineEntrySchema = z.object({
  when: z.string(),
  event: z.string(),
  impactOnThinking: z.string().optional()
});

export const SafetyVoiceSchema = z.object({
  refusalTemplates: z.array(z.string()).default([]),
  deescalationStyle: z.string().default("")
});

export const HonestyBoundarySchema = z.object({
  notes: z.array(z.string()).min(1),
  informationCutoff: z.string().optional(),
  isHighInformationRichness: z.boolean()
});

export const CharacterMetaSchema = z.object({
  name: z.string().min(1).max(80),
  /** 中文显示名；与 name 同步，生成流程保证始终有值。 */
  chineseName: z.string().min(1).max(80).optional(),
  /** 英文显示名；与 sourceName 同步，生成流程保证始终有值。 */
  englishName: z.string().min(1).max(120).optional(),
  sourceName: z.string().max(120).optional(),
  sourceType: z.enum(["public-figure", "fictional", "original"]),
  track: z.enum(["utility", "companion"]),
  quoteOneLiner: z.string().max(280).optional(),
  /**
   * 视觉气质摘要（≤800 字，0~800）。
   * 优先用 meta.appearance 结构化外貌；avatarHint 是兼容字段，orchestrator 会在 Step2 完成后用
   * `summarizeAppearance(appearance)` 自动写入。Step1 的人格卡 LLM 不再被要求输出此字段。
   */
  avatarHint: z.string().max(800).default(""),
  /** 结构化外貌信息，由女娲外貌调研阶段产出；为可选以兼容 v0.1 仅有 avatarHint 的旧卡。 */
  appearance: AppearanceSpecSchema.optional(),
  disclaimer: z.string().min(1).max(400)
});

export const CharacterCardSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  meta: CharacterMetaSchema,
  roleplay: RoleplayRulesSchema,
  identity: IdentitySchema,
  mentalModels: z.array(MentalModelSchema).min(1).max(8),
  heuristics: z.array(HeuristicSchema).min(1).max(12),
  expressionDNA: ExpressionDNASchema,
  values: ValuesSchema,
  timeline: z.array(TimelineEntrySchema).optional(),
  safetyVoice: SafetyVoiceSchema.optional(),
  honestyBoundary: HonestyBoundarySchema,
  sources: z
    .object({
      primary: z.array(z.string()).default([]),
      secondary: z.array(z.string()).default([]),
      keyQuotes: z.array(z.string()).optional()
    })
    .optional()
});

export type CharacterCard = z.infer<typeof CharacterCardSchema>;
export type MentalModel = z.infer<typeof MentalModelSchema>;
export type Heuristic = z.infer<typeof HeuristicSchema>;
export type ExpressionDNA = z.infer<typeof ExpressionDNASchema>;
export type CharacterMeta = z.infer<typeof CharacterMetaSchema>;
