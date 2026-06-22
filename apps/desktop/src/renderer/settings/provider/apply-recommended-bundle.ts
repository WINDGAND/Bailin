import type { ImageGenerationConfigDTO, ImageTierName } from "../../../shared/ipc-contract.js";
import type { RecommendedBundle, BundleFeature } from "./presets.js";
import { validateImageConfig } from "./image-tier-validation.js";

export type ReadinessKey = BundleFeature;

export type ReadinessState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; latencyMs?: number; detail?: string }
  | { status: "fail"; reason: string; hintKey?: string }
  | { status: "unavailable"; reason: string };

export type ReadinessMap = Record<ReadinessKey, ReadinessState>;

export const IDLE_READINESS: ReadinessMap = {
  chat: { status: "idle" },
  vision: { status: "idle" },
  webSearch: { status: "idle" },
  imageGen: { status: "idle" }
};

interface BailinProviderApis {
  llm: {
    setProvider(input: {
      kind: string;
      baseUrl: string;
      model: string;
      visionModel: string;
      webSearchModel: string;
      apiKey: string;
    }): Promise<{ ok: boolean; error?: string }>;
    testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  };
  imageGen: {
    setConfig(input: unknown): Promise<{ ok: boolean; error?: string }>;
    test(tier?: string): Promise<{
      ok: boolean;
      latencyMs?: number;
      model?: string;
      error?: string;
      requestFields?: string[];
    }>;
  };
  characters: {
    probeVision(): Promise<{ ok: boolean; latencyMs?: number; reason?: string }>;
    probeWebSearch(): Promise<{
      ok: boolean;
      realWebSearch: boolean;
      citations: number;
      latencyMs?: number;
      reason?: string;
    }>;
  };
}

export interface ApplyBundleResult {
  saveOk: boolean;
  saveError?: string;
  readiness: ReadinessMap;
  allRequiredPassed: boolean;
}

export interface CustomProviderInput {
  kind: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  webSearchModel: string;
  apiKey: string;
  imageConfig: ImageGenerationConfigDTO;
  imageApiKey?: string;
}

type ProgressFn = (key: ReadinessKey, state: ReadinessState) => void;

async function saveOhMyGptBundle(
  bailin: BailinProviderApis,
  bundle: RecommendedBundle,
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  const llmSave = await bailin.llm.setProvider({
    kind: bundle.llm.kind,
    baseUrl: bundle.llm.baseUrl,
    model: bundle.llm.model,
    visionModel: bundle.llm.visionModel,
    webSearchModel: bundle.llm.webSearchModel,
    apiKey
  });
  if (!llmSave.ok) return { ok: false, error: llmSave.error };

  const imgSave = await bailin.imageGen.setConfig(bundle.image);
  if (!imgSave.ok) return { ok: false, error: imgSave.error };

  return { ok: true };
}

async function saveCustomProvider(
  bailin: BailinProviderApis,
  input: CustomProviderInput
): Promise<{ ok: boolean; error?: string }> {
  const llmSave = await bailin.llm.setProvider({
    kind: input.kind,
    baseUrl: input.baseUrl,
    model: input.model,
    visionModel: input.visionModel,
    webSearchModel: input.webSearchModel,
    apiKey: input.apiKey
  });
  if (!llmSave.ok) return { ok: false, error: llmSave.error };

  const payload: ImageGenerationConfigDTO = {
    ...input.imageConfig,
    apiKey: input.imageConfig.useLLMProvider ? undefined : input.imageApiKey || undefined
  };
  const imgSave = await bailin.imageGen.setConfig(payload);
  if (!imgSave.ok) return { ok: false, error: imgSave.error };

  return { ok: true };
}

async function runChatTest(
  bailin: BailinProviderApis,
  onProgress: ProgressFn
): Promise<ReadinessState> {
  onProgress("chat", { status: "running" });
  const chatTest = await bailin.llm.testConnection();
  const state: ReadinessState = chatTest.ok
    ? { status: "ok", latencyMs: chatTest.latencyMs }
    : { status: "fail", reason: chatTest.error ?? "connection failed" };
  onProgress("chat", state);
  return state;
}

async function runVisionTest(
  bailin: BailinProviderApis,
  onProgress: ProgressFn
): Promise<ReadinessState> {
  onProgress("vision", { status: "running" });
  try {
    const v = await bailin.characters.probeVision();
    const state: ReadinessState = v.ok
      ? { status: "ok", latencyMs: v.latencyMs }
      : { status: "fail", reason: v.reason ?? "vision probe failed" };
    onProgress("vision", state);
    return state;
  } catch (e) {
    const state: ReadinessState = {
      status: "fail",
      reason: e instanceof Error ? e.message : String(e)
    };
    onProgress("vision", state);
    return state;
  }
}

async function runWebSearchTest(
  bailin: BailinProviderApis,
  onProgress: ProgressFn
): Promise<ReadinessState> {
  onProgress("webSearch", { status: "running" });
  try {
    const w = await bailin.characters.probeWebSearch();
    const ok = w.ok && w.realWebSearch;
    const state: ReadinessState = ok
      ? { status: "ok", latencyMs: w.latencyMs, detail: String(w.citations) }
      : {
          status: "fail",
          reason: w.reason ?? (w.ok ? "no citations" : "web probe failed")
        };
    onProgress("webSearch", state);
    return state;
  } catch (e) {
    const state: ReadinessState = {
      status: "fail",
      reason: e instanceof Error ? e.message : String(e)
    };
    onProgress("webSearch", state);
    return state;
  }
}

async function runImageGenTest(
  bailin: BailinProviderApis,
  tier: string,
  imageConfig: ImageGenerationConfigDTO,
  onProgress: ProgressFn
): Promise<ReadinessState> {
  onProgress("imageGen", { status: "running" });
  try {
    const img = await bailin.imageGen.test(tier);
    const tierCfg = imageConfig.tiers[tier as ImageTierName];
    if (img.ok) {
      const detailParts = [img.model, img.requestFields?.join(", ")].filter(Boolean);
      const state: ReadinessState = {
        status: "ok",
        latencyMs: img.latencyMs,
        detail: detailParts.length > 0 ? detailParts.join(" · ") : undefined
      };
      onProgress("imageGen", state);
      return state;
    }
    const reason = img.error ?? "image test failed";
    const paramMode = tierCfg.paramMode ?? "openaiImages";
    const errLower = reason.toLowerCase();
    const suggestHint =
      paramMode === "openaiImages" &&
      (errLower.includes("quality") || errLower.includes("size") || errLower.includes("invalid"));
    const state: ReadinessState = {
      status: "fail",
      reason,
      ...(suggestHint ? { hintKey: "provider.imageGenTestParamHint" } : {})
    };
    onProgress("imageGen", state);
    return state;
  } catch (e) {
    const state: ReadinessState = {
      status: "fail",
      reason: e instanceof Error ? e.message : String(e)
    };
    onProgress("imageGen", state);
    return state;
  }
}

/** OhMyGPT 一键接入：写入作者预设，仅验证 Key + 主模型。 */
export async function applyOhMyGptBundle(
  bailin: BailinProviderApis,
  bundle: RecommendedBundle,
  apiKey: string,
  onProgress: ProgressFn
): Promise<ApplyBundleResult> {
  const readiness: ReadinessMap = { ...IDLE_READINESS };

  const save = await saveOhMyGptBundle(bailin, bundle, apiKey);
  if (!save.ok) {
    return {
      saveOk: false,
      saveError: save.error,
      readiness,
      allRequiredPassed: false
    };
  }

  readiness.chat = await runChatTest(bailin, onProgress);
  const allRequiredPassed = readiness.chat.status === "ok";

  return { saveOk: true, readiness, allRequiredPassed };
}

/** 个性化配置：保存用户填写项，四项全部实测。 */
export async function verifyCustomProvider(
  bailin: BailinProviderApis,
  input: CustomProviderInput,
  onProgress: ProgressFn
): Promise<ApplyBundleResult> {
  const readiness: ReadinessMap = { ...IDLE_READINESS };

  const imageValidation = validateImageConfig(input.imageConfig);
  if (imageValidation) {
    return {
      saveOk: false,
      saveError: imageValidation.key,
      readiness,
      allRequiredPassed: false
    };
  }

  const save = await saveCustomProvider(bailin, input);
  if (!save.ok) {
    return {
      saveOk: false,
      saveError: save.error,
      readiness,
      allRequiredPassed: false
    };
  }

  readiness.chat = await runChatTest(bailin, onProgress);
  readiness.vision = await runVisionTest(bailin, onProgress);
  readiness.webSearch = await runWebSearchTest(bailin, onProgress);
  readiness.imageGen = await runImageGenTest(
    bailin,
    input.imageConfig.defaultTier,
    input.imageConfig,
    onProgress
  );

  const required: ReadinessKey[] = ["chat", "vision", "webSearch", "imageGen"];
  const allRequiredPassed = required.every((k) => readiness[k].status === "ok");

  return { saveOk: true, readiness, allRequiredPassed };
}

/** @deprecated 使用 applyOhMyGptBundle 或 verifyCustomProvider */
export async function applyRecommendedBundle(
  bailin: BailinProviderApis,
  bundle: RecommendedBundle,
  apiKey: string,
  onProgress: ProgressFn,
  _unavailableReason: (feature: ReadinessKey) => string
): Promise<ApplyBundleResult> {
  return applyOhMyGptBundle(bailin, bundle, apiKey, onProgress);
}
