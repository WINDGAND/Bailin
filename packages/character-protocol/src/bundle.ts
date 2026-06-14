import { z } from "zod";
import { CharacterCardSchema, type CharacterCard } from "./character-card.js";
import { SpriteProgramSchema, type SpriteProgram } from "./sprite-program.js";
import { RuntimeConfigSchema, type RuntimeConfig, defaultRuntimeConfig } from "./runtime-config.js";
import { ResearchDocSchema, type ResearchDoc } from "./research-doc.js";
import { QualityReportSchema, type QualityReport } from "./quality-report.js";

export const CharacterBundleSchema = z.object({
  card: CharacterCardSchema,
  sprite: SpriteProgramSchema,
  runtime: RuntimeConfigSchema,
  /** 深度蒸馏才有；快速版 / starter / 旧角色都没有。 */
  researchDocs: z.array(ResearchDocSchema).max(6).optional(),
  /** 深度蒸馏才有，Phase 4 自检报告。 */
  qualityReport: QualityReportSchema.optional()
});

export type CharacterBundle = {
  card: CharacterCard;
  sprite: SpriteProgram;
  runtime: RuntimeConfig;
  researchDocs?: ResearchDoc[];
  qualityReport?: QualityReport;
};

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  errors?: { path: string; message: string }[];
}

export function parseBundle(input: unknown): ParseResult<CharacterBundle> {
  const result = CharacterBundleSchema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data as CharacterBundle };
  }
  return {
    ok: false,
    errors: result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message
    }))
  };
}

export function parseCard(input: unknown): ParseResult<CharacterCard> {
  const result = CharacterCardSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.errors.map((e) => ({ path: e.path.join("."), message: e.message }))
  };
}

export function parseSprite(input: unknown): ParseResult<SpriteProgram> {
  const result = SpriteProgramSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.errors.map((e) => ({ path: e.path.join("."), message: e.message }))
  };
}

export { defaultRuntimeConfig };
