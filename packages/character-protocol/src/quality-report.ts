import { z } from "zod";

/**
 * QualityReport：女娲 Phase 4 质量自检的结构化产出。
 * 落到 CharacterBundle.qualityReport，UI 详情页可展开查看。
 * 对应 huashu-nuwa SKILL.md 第 525 行附近的「通过标准」表。
 */
export const QualityCheckItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  pass: z.boolean(),
  /** 量化分（0..1），1 = 完全达标；0 = 完全不达标；用于 UI 显示进度条。 */
  score: z.number().min(0).max(1),
  /** 简短的判断依据，告诉用户为什么过/不过。 */
  reason: z.string().max(400)
});

export type QualityCheckItem = z.infer<typeof QualityCheckItemSchema>;

export const QualityReportSchema = z.object({
  /** Phase 4 总评：pass = 全部硬指标过；warn = 有软指标不过；fail = 有硬指标不过。 */
  verdict: z.enum(["pass", "warn", "fail"]),
  /** 0..1 加权总分。 */
  overallScore: z.number().min(0).max(1),
  items: z.array(QualityCheckItemSchema),
  /** 风格测试：用 100 字示例 + LLM 评分（1..10）。 */
  voiceTest: z
    .object({
      sample: z.string().min(1).max(800),
      score: z.number().int().min(1).max(10),
      critique: z.string().max(400)
    })
    .optional(),
  /** 产生这份报告时的时间戳。 */
  createdAt: z.number().int().nonnegative()
});

export type QualityReport = z.infer<typeof QualityReportSchema>;
