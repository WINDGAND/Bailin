import type { ImageGenerationConfigDTO, ImageTierName } from "../../../shared/ipc-contract.js";

const IMAGE_TIERS: ImageTierName[] = ["economy", "standard", "premium"];

/** 保存前校验生图档位；返回 i18n key 或 null。 */
export function validateImageConfig(
  config: ImageGenerationConfigDTO
): { key: string; tier?: ImageTierName } | null {
  for (const tier of IMAGE_TIERS) {
    const cfg = config.tiers[tier];
    if (cfg.paramMode !== "custom") continue;
    if (cfg.customBody === undefined) {
      return { key: "provider.imageCustomBodyInvalid", tier };
    }
    if (typeof cfg.customBody !== "object" || cfg.customBody === null || Array.isArray(cfg.customBody)) {
      return { key: "provider.imageCustomBodyInvalid", tier };
    }
  }
  return null;
}

export function parseCustomBodyJson(text: string): {
  ok: true;
  value: Record<string, unknown>;
} | {
  ok: false;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

/** 模型名启发式：非强制提示用。 */
export function suggestParamModeForModel(model: string): "openaiImages" | "providerDefault" | null {
  const lower = model.trim().toLowerCase();
  if (!lower) return null;
  if (/gpt-image|dall-e|dalle/.test(lower)) return "openaiImages";
  if (/doubao|seedream|gemini|imagen|flux|midjourney|stable-diffusion|sdxl/.test(lower)) {
    return "providerDefault";
  }
  return null;
}
