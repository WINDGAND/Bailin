import { z } from "zod";
import { SCHEMA_VERSION } from "./character-card.js";

export const RuntimeConfigSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  llm: z.object({
    providerProfileId: z.string().min(1).default("default"),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().max(8000).default(800),
    topP: z.number().min(0).max(1).optional()
  }),
  context: z.object({
    historyTurnsKept: z.number().int().positive().max(64).default(12),
    summarizeEveryNTurns: z.number().int().positive().max(64).default(8),
    maxSystemTokenBudget: z.number().int().positive().max(20000).default(4000)
  }),
  desktopBehavior: z.object({
    idleAnimationDensity: z.enum(["low", "medium", "high"]).default("medium"),
    walkProbabilityPerSec: z.number().min(0).max(1).default(0.02),
    autoSleepOnLock: z.boolean().default(true),
    canBeOnTopOfFullscreen: z.literal(false).default(false)
  }),
  memory: z.object({
    enableUserProfile: z.boolean().default(true),
    enableFullChatHistory: z.boolean().default(false)
  })
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function defaultRuntimeConfig(): RuntimeConfig {
  return RuntimeConfigSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    llm: { providerProfileId: "default" },
    context: {},
    desktopBehavior: {},
    memory: {}
  });
}
