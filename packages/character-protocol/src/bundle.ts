import { z } from "zod";
import { CharacterCardSchema, type CharacterCard } from "./character-card.js";
import { SpriteProgramSchema, type SpriteProgram } from "./sprite-program.js";
import { RuntimeConfigSchema, type RuntimeConfig, defaultRuntimeConfig } from "./runtime-config.js";
import { ResearchDocSchema, type ResearchDoc } from "./research-doc.js";
import { QualityReportSchema, type QualityReport } from "./quality-report.js";

/**
 * 角色包（CharacterBundle）：一次蒸馏或导入后落地的完整角色产物。
 *
 * 必含人设卡、精灵程序、运行时配置；深度蒸馏才附带调研文档与 Phase 4 质检报告。
 * 本文件只做 Zod 契约与纯解析，不读写磁盘、不触发 IPC。
 */

/**
 * 角色包 Zod 契约。`researchDocs` 最多 6 份；缺省字段表示快速版 / starter / 旧角色。
 */
export const CharacterBundleSchema = z.object({
  card: CharacterCardSchema,
  sprite: SpriteProgramSchema,
  runtime: RuntimeConfigSchema,
  /** 深度蒸馏才有；快速版 / starter / 旧角色都没有。 */
  researchDocs: z.array(ResearchDocSchema).max(6).optional(),
  /** 深度蒸馏才有，Phase 4 自检报告。 */
  qualityReport: QualityReportSchema.optional()
});

/** 与 `CharacterBundleSchema` 对应的 TypeScript 形态；可选字段语义同上。 */
export type CharacterBundle = {
  card: CharacterCard;
  sprite: SpriteProgram;
  runtime: RuntimeConfig;
  researchDocs?: ResearchDoc[];
  qualityReport?: QualityReport;
};

/**
 * 安全解析结果。`ok === true` 时带 `data`；失败时只带路径化的 `errors`，不抛异常。
 */
export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  errors?: { path: string; message: string }[];
}

/**
 * 把未知输入按角色包契约校验。
 *
 * @param input 磁盘 JSON、IPC 载荷或任意未知值
 * @returns 成功则 `data` 为完整角色包；失败则 `errors.path` 为点分字段路径
 */
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

/**
 * 只校验角色卡，不要求整包（精灵 / 运行时 / 调研）齐全。
 *
 * @param input 未知 JSON
 * @returns 成功则 `data` 为人设卡；失败结构同 `parseBundle`
 */
export function parseCard(input: unknown): ParseResult<CharacterCard> {
  const result = CharacterCardSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.errors.map((e) => ({ path: e.path.join("."), message: e.message }))
  };
}

/**
 * 只校验精灵程序（状态机 / 图集描述），用于单独导入动作包。
 *
 * @param input 未知 JSON
 * @returns 成功则 `data` 为精灵程序；失败结构同 `parseBundle`
 */
export function parseSprite(input: unknown): ParseResult<SpriteProgram> {
  const result = SpriteProgramSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.errors.map((e) => ({ path: e.path.join("."), message: e.message }))
  };
}

/** 再导出默认运行时配置，调用方只需从 bundle 入口取默认值。 */
export { defaultRuntimeConfig };
