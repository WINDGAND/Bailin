/**
 * 设置页供应商接入：把推荐套餐或自定义表单写入主进程，再按模式实测聊天 / 视觉 / 联网 / 生图。
 *
 * 云端一键套餐只测 Key + 主模型；自定义四项全测且必须全过；本地只强制聊天通过，
 * 其余失败会降成 `unavailable` 以免挡住接入。进度经 `onProgress` 推到就绪清单，本文件不碰磁盘。
 */
import type { ImageGenerationConfigDTO, ImageTierName } from "../../../shared/ipc-contract.js";
import type { RecommendedBundle, BundleFeature } from "./presets.js";
import { validateImageConfig } from "./image-tier-validation.js";

/** 就绪清单上的一项能力，与套餐功能开关一一对应。 */
export type ReadinessKey = BundleFeature;

/**
 * 单项实测状态。
 * `unavailable` 仅本地模式使用：能力没配或测失败，但不阻断接入。
 */
export type ReadinessState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; latencyMs?: number; detail?: string }
  | { status: "fail"; reason: string; hintKey?: string }
  | { status: "unavailable"; reason: string };

/** 四项能力的当前实测结果。 */
export type ReadinessMap = Record<ReadinessKey, ReadinessState>;

/** 保存前的空闲快照，避免 UI 残留上一次实测。 */
export const IDLE_READINESS: ReadinessMap = {
  chat: { status: "idle" },
  vision: { status: "idle" },
  webSearch: { status: "idle" },
  imageGen: { status: "idle" }
};

/** 设置页调用的主进程 IPC 子集；本模块不直接 import electron。 */
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

/**
 * 一次接入的汇总结果。
 *
 * @property saveOk 供应商配置是否写入成功
 * @property saveError 失败时的错误文案或 i18n key
 * @property readiness 四项实测（未测项保持 idle）
 * @property allRequiredPassed 当前模式要求的必过项是否全部 `ok`
 */
export interface ApplyBundleResult {
  saveOk: boolean;
  saveError?: string;
  readiness: ReadinessMap;
  allRequiredPassed: boolean;
}

/**
 * 自定义 / 本地表单字段。
 * `imageApiKey` 仅在生图不复用 LLM Key 时使用。
 */
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

/** 把单项状态推到就绪清单；实现方可同步写 React state。 */
type ProgressFn = (key: ReadinessKey, state: ReadinessState) => void;

/**
 * 写入 OhMyGPT 套餐的 LLM + 生图预设。
 *
 * @returns `ok: false` 时携带主进程错误；任一步失败立即返回，不继续写生图。
 */
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

/**
 * 写入用户填写的 LLM 与生图配置。
 * 生图若勾选 `useLLMProvider`，不把独立 imageApiKey 传下去（沿用聊天 Key）。
 */
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

  // 复用 LLM Key 时清掉独立 key，避免主进程误用过期的生图 Key
  const payload: ImageGenerationConfigDTO = {
    ...input.imageConfig,
    apiKey: input.imageConfig.useLLMProvider ? undefined : input.imageApiKey || undefined
  };
  const imgSave = await bailin.imageGen.setConfig(payload);
  if (!imgSave.ok) return { ok: false, error: imgSave.error };

  return { ok: true };
}

/**
 * 测聊天连通性：只打 testConnection，不探视觉 / 联网。
 * 副作用：立刻 `onProgress("chat", ...)`。
 */
async function runChatTest(
  bailin: BailinProviderApis,
  onProgress: ProgressFn
): Promise<ReadinessState> {
  onProgress("chat", { status: "running" });
  const chatTest = await bailin.llm.testConnection();
  const state: ReadinessState = chatTest.ok
    ? { status: "ok", latencyMs: chatTest.latencyMs }
    : { status: "fail", reason: chatTest.error ?? "连接失败：未返回具体错误信息" };
  onProgress("chat", state);
  return state;
}

/**
 * 探视觉模型。probe 抛错时记为 fail，不向上抛。
 */
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

/**
 * 探联网搜索。主进程 `ok` 仍可能是假搜索（无真实 citations），必须同时 `realWebSearch`。
 */
async function runWebSearchTest(
  bailin: BailinProviderApis,
  onProgress: ProgressFn
): Promise<ReadinessState> {
  onProgress("webSearch", { status: "running" });
  try {
    const w = await bailin.characters.probeWebSearch();
    // 中转可能返回 ok 但没有真实联网；没 citations 一律当失败
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

/**
 * 按当前默认档位测生图。
 * OpenAI Images 风格参数若撞上 quality/size/invalid，附带 hintKey 提示切换 paramMode。
 */
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
    // 常见是把非 OpenAI 接口当成 Images API 打，提示用户改参数模式而不是只显示原文
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

/**
 * 云端一键接入：写入所选 bundle 预设，仅验证 Key + 主模型。
 *
 * @param bailin 主进程 IPC
 * @param bundle 推荐套餐（含 LLM / 生图预设）
 * @param apiKey 用户填写的云端 Key
 * @param onProgress 聊天实测进度回调
 * @returns 保存失败时 `allRequiredPassed` 为 false；成功则只看聊天是否 `ok`
 */
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

/**
 * 个性化配置：保存用户填写项，四项全部实测。
 *
 * `validateImageConfig` 返回非空表示校验失败（i18n key），此时不写入、不实测。
 *
 * @param bailin 主进程 IPC
 * @param input 自定义表单
 * @param onProgress 四项实测进度回调
 * @returns 聊天 / 视觉 / 联网 / 生图全部 `ok` 时 `allRequiredPassed` 才为 true
 */
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

/**
 * 本地模型：保存后仅要求聊天通过。
 * 视觉 / 联网 / 生图标记为 unavailable（可带原因），不阻断接入。
 *
 * 已填写对应模型时仍会实测；失败不记 `fail`，而是降成 `unavailable`，避免本地缺能力时被四项全过闸门拦住。
 *
 * @param bailin 主进程 IPC
 * @param input 本地表单（模型名可空）
 * @param onProgress 实测或「未配置」进度回调
 * @returns 仅聊天 `ok` 即 `allRequiredPassed`
 */
export async function verifyLocalProvider(
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

  const softUnavailable = (reason: string): ReadinessState => ({
    status: "unavailable",
    reason
  });

  if (input.visionModel.trim()) {
    const vision = await runVisionTest(bailin, onProgress);
    readiness.vision =
      vision.status === "ok"
        ? vision
        : softUnavailable(
            vision.status === "fail" ? vision.reason : "provider.local.unavailableVisionDefault"
          );
  } else {
    readiness.vision = softUnavailable("provider.local.unavailableVisionUnset");
    onProgress("vision", readiness.vision);
  }

  if (input.webSearchModel.trim()) {
    const web = await runWebSearchTest(bailin, onProgress);
    readiness.webSearch =
      web.status === "ok"
        ? web
        : softUnavailable(
            web.status === "fail" ? web.reason : "provider.local.unavailableWebDefault"
          );
  } else {
    readiness.webSearch = softUnavailable("provider.local.unavailableWebUnset");
    onProgress("webSearch", readiness.webSearch);
  }

  const hasImageModel = Object.values(input.imageConfig.tiers).some((tier) =>
    Boolean(tier.model?.trim())
  );
  if (hasImageModel) {
    const img = await runImageGenTest(
      bailin,
      input.imageConfig.defaultTier,
      input.imageConfig,
      onProgress
    );
    readiness.imageGen =
      img.status === "ok"
        ? img
        : softUnavailable(
            img.status === "fail" ? img.reason : "provider.local.unavailableImageDefault"
          );
  } else {
    readiness.imageGen = softUnavailable("provider.local.unavailableImageUnset");
    onProgress("imageGen", readiness.imageGen);
  }

  const allRequiredPassed = readiness.chat.status === "ok";
  return { saveOk: true, readiness, allRequiredPassed };
}

/**
 * @deprecated 使用 applyOhMyGptBundle 或 verifyCustomProvider
 *
 * 旧入口，忽略 `_unavailableReason`，行为等同 `applyOhMyGptBundle`。
 */
export async function applyRecommendedBundle(
  bailin: BailinProviderApis,
  bundle: RecommendedBundle,
  apiKey: string,
  onProgress: ProgressFn,
  _unavailableReason: (feature: ReadinessKey) => string
): Promise<ApplyBundleResult> {
  return applyOhMyGptBundle(bailin, bundle, apiKey, onProgress);
}
