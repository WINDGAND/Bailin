import { z } from "zod";
import { SCHEMA_VERSION } from "./character-card.js";

/**
 * 角色运行时配置的 Zod 契约。
 *
 * 这份 schema 描述「对话怎么调模型、上下文留多少、桌宠怎么动、记不记用户画像」，
 * 与角色卡本体分离，便于同一角色在不同设备上覆盖 LLM / 记忆偏好而不改人设。
 * `schemaVersion` 必须与角色卡当前版本字面量一致，避免新旧包混读。
 */
export const RuntimeConfigSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** 对话所用的模型与采样参数；缺省走 default 档案、温度 0.7、最多 800 token。 */
  llm: z.object({
    providerProfileId: z.string().min(1).default("default"),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().max(8000).default(800),
    topP: z.number().min(0).max(1).optional()
  }),
  /** 上下文窗口：保留多少轮、隔几轮摘要一次、系统提示的 token 预算上限。 */
  context: z.object({
    historyTurnsKept: z.number().int().positive().max(64).default(12),
    summarizeEveryNTurns: z.number().int().positive().max(64).default(8),
    maxSystemTokenBudget: z.number().int().positive().max(20000).default(4000)
  }),
  /**
   * 桌宠闲置表现。`canBeOnTopOfFullscreen` 固定为 false：
   * 协议层禁止覆盖全屏应用，运行时不得改写该字面量。
   */
  desktopBehavior: z.object({
    idleAnimationDensity: z.enum(["low", "medium", "high"]).default("medium"),
    walkProbabilityPerSec: z.number().min(0).max(1).default(0.02),
    autoSleepOnLock: z.boolean().default(true),
    canBeOnTopOfFullscreen: z.literal(false).default(false)
  }),
  /** 记忆开关：默认学习用户画像，但不默认落全量聊天记录。 */
  memory: z.object({
    enableUserProfile: z.boolean().default(true),
    enableFullChatHistory: z.boolean().default(false)
  })
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

/**
 * 返回一份经 schema 填充默认值后的运行时配置。
 * 调用方只需提供 schemaVersion 与最小 llm 档案，其余字段走 Zod default。
 */
export function defaultRuntimeConfig(): RuntimeConfig {
  return RuntimeConfigSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    llm: { providerProfileId: "default" },
    context: {},
    desktopBehavior: {},
    memory: {}
  });
}
