/**
 * Provider preset 共享数据。
 *
 * SetupWizard（首启）和 ApiKeyPanel（设置页）都消费这份清单。
 * 改一处即可两处生效，避免文案漂移。
 */

import type { ImageGenerationConfigDTO } from "../../../shared/ipc-contract.js";

export interface ProviderPreset {
  id: string;
  label: string;
  kind: "openai-compatible" | "anthropic-compatible";
  baseUrl: string;
  model: string;
  /** 推荐的 vision 模型（参考图读图）。可选；若提供，UI 会一并填入 visionModel 字段。 */
  visionModel?: string;
  /** 一句话产品向说明，hover tooltip 用。不要写技术细节，写 "用户为什么选它"。 */
  note?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com",
    model: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    note: "官方直连。联网调研、视觉读图都内置支持，最稳。"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    note: "便宜的主模型；不支持联网调研，深度创建不可用。"
  },
  {
    id: "moonshot",
    label: "Moonshot",
    kind: "openai-compatible",
    baseUrl: "https://api.moonshot.cn",
    model: "moonshot-v1-8k",
    note: "国产长上下文；联网与视觉能力依模型而定。"
  },
  {
    id: "ohmygpt",
    label: "OhMyGPT",
    kind: "openai-compatible",
    baseUrl: "https://api.ohmygpt.com/v1",
    model: "deepseek-v4-flash",
    visionModel: "bytedance/doubao-seed-2.0-lite-260428",
    note: "中转。主模型用 DeepSeek，深度创建时会自动切换联网检索模型。"
  },
  {
    id: "claude",
    label: "Claude",
    kind: "anthropic-compatible",
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-5-sonnet-latest",
    visionModel: "claude-3-5-sonnet-latest",
    note: "Anthropic 直连。视觉与联网均原生支持。"
  }
];

/** 未保存任何生图配置时，个性化配置区展示用的空壳（模型字段留空）。 */
export const EMPTY_IMAGE_CONFIG: ImageGenerationConfigDTO = {
  useLLMProvider: true,
  defaultTier: "standard",
  tiers: {
    economy: { model: "", size: "1024x1024", quality: "low", estimatedCostUsd: 0 },
    standard: { model: "", size: "1024x1024", quality: "medium", estimatedCostUsd: 0 },
    premium: { model: "", size: "1024x1536", quality: "high", estimatedCostUsd: 0 }
  }
};

/** 推荐生图三档默认配置（OhMyGPT / OpenAI 一键接入共用）。 */
export const DEFAULT_IMAGE_CONFIG: ImageGenerationConfigDTO = {
  useLLMProvider: true,
  defaultTier: "standard",
  tiers: {
    economy: {
      model: "gpt-image-1-mini",
      size: "1024x1024",
      quality: "low",
      estimatedCostUsd: 0.005
    },
    standard: {
      model: "gpt-image-2",
      size: "1024x1024",
      quality: "medium",
      estimatedCostUsd: 0.032
    },
    premium: {
      model: "gpt-image-2",
      size: "1024x1536",
      quality: "high",
      estimatedCostUsd: 0.18
    }
  }
};

export type BundleFeature = "chat" | "vision" | "webSearch" | "imageGen";

export type BundleFaqId = "ohmygpt" | "openai" | "deepseek";

export interface RecommendedBundle {
  id: string;
  /** i18n key: provider.bundles.{id}.label */
  recommended?: boolean;
  capabilities: Record<BundleFeature, boolean>;
  faqId: BundleFaqId;
  llm: {
    kind: "openai-compatible" | "anthropic-compatible";
    baseUrl: string;
    model: string;
    visionModel: string;
  };
  image: ImageGenerationConfigDTO;
}

export const RECOMMENDED_BUNDLES: RecommendedBundle[] = [
  {
    id: "ohmygpt",
    recommended: true,
    faqId: "ohmygpt",
    capabilities: {
      chat: true,
      vision: true,
      webSearch: true,
      imageGen: true
    },
    llm: {
      kind: "openai-compatible",
      baseUrl: "https://api.ohmygpt.com/v1",
      model: "deepseek-v4-flash",
      visionModel: "bytedance/doubao-seed-2.0-lite-260428"
    },
    image: { ...DEFAULT_IMAGE_CONFIG, useLLMProvider: true }
  },
  {
    id: "openai",
    faqId: "openai",
    capabilities: {
      chat: true,
      vision: true,
      webSearch: true,
      imageGen: true
    },
    llm: {
      kind: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      visionModel: "gpt-4o-mini"
    },
    image: { ...DEFAULT_IMAGE_CONFIG, useLLMProvider: true }
  },
  {
    id: "deepseek",
    faqId: "deepseek",
    capabilities: {
      chat: true,
      vision: false,
      webSearch: false,
      imageGen: false
    },
    llm: {
      kind: "openai-compatible",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      visionModel: "bytedance/doubao-seed-2.0-lite-260428"
    },
    image: { ...DEFAULT_IMAGE_CONFIG, useLLMProvider: true }
  }
];

export const DEFAULT_BUNDLE_ID = "ohmygpt";

/** 作者同款模型选型（UI 指引与快速上手展示用）。 */
export const AUTHOR_MODEL_STACK = {
  relay: { label: "OhMyGPT", baseUrl: "https://api.ohmygpt.com/v1" },
  chat: { model: "deepseek-v4-flash", role: "chat" as const },
  vision: { model: "bytedance/doubao-seed-2.0-lite-260428", role: "vision" as const },
  webSearch: { model: "gpt-4o-mini-search-preview", role: "webSearch" as const },
  imageGen: { model: "gpt-image-2", tier: "standard", role: "imageGen" as const }
};

export type ModelRoleId = "chat" | "vision" | "webSearch" | "imageGen";

export const MODEL_ROLE_IDS: ModelRoleId[] = ["chat", "vision", "webSearch", "imageGen"];

export function getRecommendedBundle(id: string): RecommendedBundle | undefined {
  return RECOMMENDED_BUNDLES.find((b) => b.id === id);
}

export function bundleMatchesConfig(
  bundle: RecommendedBundle,
  config: {
    kind: string;
    baseUrl: string;
    model: string;
    visionModel: string;
  }
): boolean {
  const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  return (
    bundle.llm.kind === config.kind &&
    norm(bundle.llm.baseUrl) === norm(config.baseUrl) &&
    bundle.llm.model === config.model &&
    bundle.llm.visionModel === config.visionModel
  );
}

/**
 * Vision 模型推荐。当用户切换主 provider 时，UI 给的"读图模型"快捷选项。
 * 与 LLMAdapter 的白名单（VISION_MODEL_KEYWORDS）保持松耦合：这里只是 UX 帮助。
 */
export interface VisionModelPreset {
  id: string;
  label: string;
  model: string;
  hint: string;
}

export const VISION_MODEL_PRESETS: VisionModelPreset[] = [
  {
    id: "doubao-seed",
    label: "豆包 Seed",
    model: "bytedance/doubao-seed-2.0-lite-260428",
    hint: "OhMyGPT 默认；中文 / 二次元角色识别好"
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    model: "gpt-4o-mini",
    hint: "OpenAI 直连最划算的视觉模型"
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    model: "gpt-4o",
    hint: "高质量视觉，比 mini 准但贵 10 倍"
  },
  {
    id: "claude-haiku",
    label: "Claude Haiku 3.5",
    model: "claude-3-5-haiku-latest",
    hint: "Anthropic 路线最便宜的视觉模型"
  }
];

export const DEFAULT_VISION_MODEL = "bytedance/doubao-seed-2.0-lite-260428";
