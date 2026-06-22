import type { ResearchAgentId } from "@bailin/character-protocol";
import type { Locale } from "../../shared/i18n/types.js";
import {
  APPEARANCE_PHASE_AUTO_SEARCH_VISION,
  APPEARANCE_PHASE_FALLBACK_NO_IMAGES,
  APPEARANCE_PHASE_FALLBACK_NO_VISION,
  APPEARANCE_PHASE_FALLBACK_VISION_FAILED,
  APPEARANCE_PHASE_MATERIAL_ONLY,
  APPEARANCE_PHASE_USER_TEXT,
  APPEARANCE_PHASE_USER_VISION,
  APPEARANCE_PHASE_WEB_TEXT
} from "../../../shared/appearance-phase-message.js";

type TFn = (key: string, params?: Record<string, string | number>) => string;

const PHASE_EXACT: Record<string, string> = {
  "启动中…": "distill.phaseStarting",
  已启动: "distill.phaseStarted",
  完成: "distill.phaseComplete",
  "启动 6 路并行调研…": "distill.phaseResearchStart",
  "正在用调研结果提炼心智模型与表达 DNA…": "distill.phaseSynthesizing",
  "正在用调研结果提炼心智模型与表达风格…": "distill.phaseSynthesizing",
  "提炼完成，继续装配人格卡…": "distill.phaseSynthContinuing",
  "装配人格卡…": "distill.phaseBuildingCard",
  [APPEARANCE_PHASE_USER_VISION]: "distill.phaseAppearanceUserVision",
  [APPEARANCE_PHASE_USER_TEXT]: "distill.phaseAppearanceUserText",
  [APPEARANCE_PHASE_AUTO_SEARCH_VISION]: "distill.phaseAppearanceAutoSearchVision",
  [APPEARANCE_PHASE_WEB_TEXT]: "distill.phaseAppearanceWebText",
  [APPEARANCE_PHASE_MATERIAL_ONLY]: "distill.phaseAppearanceMaterialOnly",
  [APPEARANCE_PHASE_FALLBACK_NO_VISION]: "distill.phaseAppearanceFallbackNoVision",
  [APPEARANCE_PHASE_FALLBACK_NO_IMAGES]: "distill.phaseAppearanceFallbackNoImages",
  [APPEARANCE_PHASE_FALLBACK_VISION_FAILED]: "distill.phaseAppearanceFallbackVisionFailed",
  "正在画桌宠的 hatch-pet 精灵图…": "distill.phaseBuildingSprite",
  "正在绘制桌宠像素形象…": "distill.phaseBuildingSprite",
  "运行质量自检…": "distill.phaseQualityCheck",
  "补跑 1 路调研…": "distill.phaseResearchSupplement",
  "补跑 2 路调研…": "distill.phaseResearchSupplement",
  "补跑 3 路调研…": "distill.phaseResearchSupplement",
  "补跑 4 路调研…": "distill.phaseResearchSupplement",
  "补跑 5 路调研…": "distill.phaseResearchSupplement",
  "补跑 6 路调研…": "distill.phaseResearchSupplement",
  "分析用户素材覆盖范围…": "distill.phaseMaterialCoverage"
};

export function agentNameKey(id: ResearchAgentId): string {
  return `distill.agent${id}`;
}

export function translatePhaseMessage(raw: string, t: TFn, locale: Locale): string {
  const exact = PHASE_EXACT[raw];
  if (exact) return t(exact);

  const researchDone = raw.match(/^调研完成（成功 (\d+)\/6，失败 (\d+)），等待你确认$/);
  if (researchDone) {
    return t("distill.phaseResearchDone", {
      ok: researchDone[1]!,
      failed: researchDone[2]!
    });
  }

  const locked = raw.match(/^已锁定调研对象：(.+)$/);
  if (locked) {
    const rest = locked[1]!;
    const parsed = rest.match(/^(.+?)(?: \/ ([^（]+))?(?:（(.+)）)?$/);
    const name = parsed?.[1] ?? rest;
    const english = parsed?.[2];
    const context = parsed?.[3];
    const englishPart = english ? ` / ${english}` : "";
    const contextPart = context
      ? locale === "zh"
        ? `（${context}）`
        : ` (${context})`
      : "";
    return t("distill.phaseLockedTarget", { name, english: englishPart, context: contextPart });
  }

  const supplement = raw.match(/^补跑 (\d+) 路调研…$/);
  if (supplement) {
    return t("distill.phaseResearchSupplement", { count: supplement[1]! });
  }

  const synthRetry = raw.match(/^第 (\d+) 轮提炼中[：:]/);
  if (synthRetry) {
    return t("distill.phaseResynthesizing", { round: synthRetry[1]! });
  }

  return raw;
}
