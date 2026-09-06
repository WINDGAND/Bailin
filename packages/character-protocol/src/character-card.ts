import { z } from "zod";
import { AppearanceSpecSchema } from "./appearance.js";
import { AnswerProtocolSchema } from "./answer-protocol.js";

/**
 * CharacterCard 描述一个角色「怎么想 / 怎么说」。
 *
 * 这是百灵角色协议的结构化产品版本：人设、心智模型、表达习惯与诚实边界。
 * 本文件只导出 Zod 契约与推断类型，不读写磁盘、不触发 IPC。
 * 详见 README「角色协议」与 packages/character-protocol。
 */

/** 当前人设卡 schema 字面量版本；解析时必须与卡内 `schemaVersion` 一致。 */
export const SCHEMA_VERSION = "0.1" as const;

/**
 * 角色扮演硬规则。`firstPersonOnly` / `disclaimerOnce` 目前固定为 true，
 * 保证始终第一人称，且免责声明只说一次。
 */
export const RoleplayRulesSchema = z.object({
  firstPersonOnly: z.literal(true),
  disclaimerOnce: z.literal(true),
  exitTriggers: z.array(z.string()).min(1),
  refusalStyle: z.string().optional()
});

/** 自我介绍、来历与近况；给开场与「你是谁」类问题用。 */
export const IdentitySchema = z.object({
  selfIntro: z.string().min(1).max(800),
  origin: z.string().min(1).max(800),
  currentDoing: z.string().max(800).optional()
});

/**
 * 单条心智模型：遇到某类问题时怎么想。
 * `evidence` 是出处摘录；`limits` 标明不适用场景，避免被当成万能框架。
 */
export const MentalModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  oneLiner: z.string().min(1).max(240),
  evidence: z.array(z.string()).min(1),
  appliesTo: z.array(z.string()).min(1),
  limits: z.string().min(1).max(400)
});

/** 情景启发式：比心智模型更短的「遇到 X 就按 Y 做」。 */
export const HeuristicSchema = z.object({
  id: z.string().min(1),
  rule: z.string().min(1).max(200),
  scenario: z.string().min(1).max(200),
  example: z.string().max(400).optional()
});

/**
 * 表达 DNA：句式、用词、节奏、幽默与确定程度。
 * `vocabulary.forbidden` 是角色不该说的词，运行时注入 system prompt。
 */
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

/** 追求 / 拒绝 / 张力；张力是角色内心可能打架的价值对。 */
export const ValuesSchema = z.object({
  pursue: z.array(z.string()),
  reject: z.array(z.string()),
  tensions: z.array(z.string()).optional()
});

/** 时间线一条：何时发生何事，以及对思考方式的影响。 */
export const TimelineEntrySchema = z.object({
  when: z.string(),
  event: z.string(),
  impactOnThinking: z.string().optional()
});

/** 拒答话术与降级语气；安全策略命中后按此口吻回复。 */
export const SafetyVoiceSchema = z.object({
  refusalTemplates: z.array(z.string()).default([]),
  deescalationStyle: z.string().default("")
});

/**
 * 诚实边界：角色必须承认的知识缺口与信息截止。
 * `isHighInformationRichness` 为 true 时，运行时更强调引用来源。
 */
export const HonestyBoundarySchema = z.object({
  notes: z.array(z.string()).min(1),
  informationCutoff: z.string().optional(),
  isHighInformationRichness: z.boolean()
});

/**
 * 角色元信息：中英名、来源类型、轨道、座右铭与外貌摘要。
 * 旧卡可能只有 `avatarHint`；新卡优先用结构化 `appearance`。
 */
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
   * 座右铭核验状态：
   * - verified：quoteOneLiner 为已核验原话
   * - provisional：原话未核验，UI 用人格表达顶上
   * - missing：无可展示签名文案
   * 缺省时由读侧按 quoteOneLiner / 人格内容推导（兼容旧卡）。
   */
  quoteStatus: z.enum(["verified", "provisional", "missing"]).optional(),
  /** 最近一次座右铭核验失败原因（调试 / toast，不直接当产品长文）。 */
  quoteStatusReason: z.string().max(400).optional(),
  /**
   * 视觉气质摘要（≤800 字，0~800）。
   * 优先用 meta.appearance 结构化外貌；avatarHint 是兼容字段，orchestrator 会在 Step2 完成后用
   * `summarizeAppearance(appearance)` 自动写入。Step1 的人格卡 LLM 不再被要求输出此字段。
   */
  avatarHint: z.string().max(800).default(""),
  /** 结构化外貌信息，由百灵外貌调研阶段产出；为可选以兼容 v0.1 仅有 avatarHint 的旧卡。 */
  appearance: AppearanceSpecSchema.optional(),
  disclaimer: z.string().min(1).max(400)
});

/**
 * 完整人设卡 Zod 契约。必含 meta / roleplay / identity / 心智模型 / 表达 DNA / 诚实边界。
 * `timeline`、`safetyVoice`、`sources`、`answerProtocol` 为可选，兼容快速版与旧卡。
 */
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
    .optional(),
  /** 轻量 Agentic Protocol：3~5 条回答路由，运行时注入 system prompt。 */
  answerProtocol: AnswerProtocolSchema.optional()
});

/** 与 `CharacterCardSchema` 对应的 TypeScript 形态。 */
export type CharacterCard = z.infer<typeof CharacterCardSchema>;
/** 单条心智模型的推断类型。 */
export type MentalModel = z.infer<typeof MentalModelSchema>;
/** 单条情景启发式的推断类型。 */
export type Heuristic = z.infer<typeof HeuristicSchema>;
/** 表达 DNA 的推断类型。 */
export type ExpressionDNA = z.infer<typeof ExpressionDNASchema>;
/** 角色元信息的推断类型。 */
export type CharacterMeta = z.infer<typeof CharacterMetaSchema>;
export type { AnswerProtocol, AnswerRoute } from "./answer-protocol.js";
export { AnswerProtocolSchema, AnswerRouteSchema, isAnswerProtocolValid } from "./answer-protocol.js";
