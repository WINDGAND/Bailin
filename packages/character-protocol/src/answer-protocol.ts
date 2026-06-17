import { z } from "zod";

/** 单条回答路由：从心智模型反推的「遇到某类问题怎么想」。 */
export const AnswerRouteSchema = z.object({
  id: z.string().min(1),
  /** 路由名，如「看激励结构」「逆向想失败」。 */
  label: z.string().min(1).max(80),
  /** 何时启用此路由。 */
  when: z.string().min(1).max(240),
  /** 2~4 步具体思考动作。 */
  steps: z.array(z.string().min(1).max(200)).min(1).max(6),
  /** 关联的心智模型名称（可选）。 */
  linkedModels: z.array(z.string()).max(3).optional()
});

export type AnswerRoute = z.infer<typeof AnswerRouteSchema>;

/**
 * 轻量 Agentic Protocol：运行时「遇到新问题怎么思考」的路由表。
 * 蒸馏时从心智模型反推，写入 CharacterCard 供 buildSystemPrompt 消费。
 */
export const AnswerProtocolSchema = z.object({
  /** Step 1 问题分类指引（事实 / 框架 / 混合）。 */
  classifyHint: z.string().min(1).max(500),
  routes: z.array(AnswerRouteSchema).min(3).max(5)
});

export type AnswerProtocol = z.infer<typeof AnswerProtocolSchema>;

export function isAnswerProtocolValid(
  protocol: AnswerProtocol | undefined | null
): protocol is AnswerProtocol {
  if (!protocol) return false;
  const parsed = AnswerProtocolSchema.safeParse(protocol);
  return parsed.success;
}
