import { z } from "zod";

/**
 * DistillationJob：一次深度蒸馏的状态机 + 输入快照。
 * 用来支持「断点恢复」「Checkpoint 等待」「失败重试」。
 * 持久化在 vault.distillation_jobs 表。
 */
export const DistillationJobStatusSchema = z.enum([
  "pending",
  "researching", // Phase 1
  "awaiting_research_ok", // Checkpoint 1
  "synthesizing", // Phase 2
  "awaiting_synth_ok", // Checkpoint 2
  "building_card", // Phase 3a
  "researching_appearance", // Phase 3b
  "building_sprite", // Phase 3c
  "quality_check", // Phase 4
  "done",
  "failed",
  "cancelled"
]);

export type DistillationJobStatus = z.infer<typeof DistillationJobStatusSchema>;

export const DistillationJobConfigSchema = z.object({
  characterName: z.string().min(1).max(80),
  sourceType: z.enum(["public-figure", "fictional", "original"]),
  track: z.enum(["utility", "companion"]),
  enableWebSearch: z.boolean().default(true),
  /** 并发数 1..6。 */
  concurrency: z.number().int().min(1).max(6).default(2),
  /** 单 agent 超时（毫秒）。 */
  agentTimeoutMs: z.number().int().min(30000).max(900000).default(300000),
  /** 用户提供的补充素材（≤2000 字符）。 */
  userMaterial: z.string().max(4000).optional(),
  /** 用户提供的外貌补充（短句）。 */
  userHint: z.string().max(400).optional(),
  /** 用户提供的参考图 URL 或 data URI，用于深度外貌阶段（旧字段，保留兼容）。 */
  userImageRef: z.string().max(2000).optional(),
  /**
   * v0.2 新增：用户上传 / 粘贴 / 拖拽的参考图清单（最多 4 张，单张 dataUri ≤ 3MB）。
   * 喂给 vision 模型直接读图；如果没填且 enableWebSearch 为 true，pipeline 会自动联网搜图。
   */
  referenceImages: z
    .array(
      z.object({
        url: z.string().min(1).max(8 * 1024 * 1024), // 单张上限 ~8MB（base64 膨胀后）
        source: z.enum(["user-upload", "web"]).default("user-upload"),
        role: z.enum(["primary", "reference"]).default("reference"),
        notes: z.string().max(200).default("")
      })
    )
    .max(4)
    .default([]),
  /**
   * 调研阶段使用的「联网搜索模型」。默认 gpt-4o-mini-search-preview（OpenAI 内置联网，
   * chat/completions 端点）。Phase 1 调研 + Phase 3b 外貌搜图都用它；其余阶段
   * （框架提炼、自我批评、Sprite、自检风格评分）继续用 provider 默认模型。
   */
  researchModel: z.string().min(1).max(80).default("gpt-4o-mini-search-preview")
});

export type DistillationJobConfig = z.infer<typeof DistillationJobConfigSchema>;

export const DistillationJobSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1).optional(),
  config: DistillationJobConfigSchema,
  status: DistillationJobStatusSchema,
  /** 进度百分比（0..100），UI 直接用。 */
  progress: z.number().int().min(0).max(100).default(0),
  /** 给 UI 看的人类可读说明，每次状态变化更新。 */
  message: z.string().max(400).default(""),
  /** 失败时记录的 warning 列表（每步可累加）。 */
  warnings: z.array(z.string().max(400)).default([]),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
});

export type DistillationJob = z.infer<typeof DistillationJobSchema>;
