/**
 * 主动陪伴的「截图耳语」：在用户未开口时拍一张主屏缩略图，让带视觉的 LLM 说一句短关心。
 *
 * 由 `ProactiveOrchestrator` 在配额与场景通过后调用。本文件只负责门禁、截图与一次流式生成，
 * 不写设置、不更新小时计数；成功后调用方用返回的 `screenshotAt` 记录冷却。
 * 失败一律 `{ ok: false, reason }`，reason 供状态栏/日志区分「用户关了截图」与「模型空回复」。
 */
import { buildSystemPrompt } from "@bailin/prompts";
import type { CharacterBundle } from "@bailin/character-protocol";
import { profileForPrompt } from "../../shared/profile.js";
import type { LLMAdapter } from "../adapters/llm-adapter.js";
import type { MemoryStore } from "../runtime/memory-store.js";
import { GLOBAL_REFUSAL_LIST } from "../safety/safety-policy.js";
import type { ScreenCaptureService } from "../capture/screen-capture.js";
import type { ProactiveSettings } from "../../shared/ipc-contract.js";
import { frequencySupportsSmartScreenshot } from "../../shared/proactive-companion.js";

/** 两次 LLM 耳语的最短间隔（30 分钟）。`force` 为 true 时跳过此冷却。 */
const LLM_MIN_INTERVAL_MS = 30 * 60 * 1000;

/**
 * 一次截图耳语的结果。
 * `ok` 为 true 时必有 `text` 与 `screenshotAt`；失败时 `reason` 为稳定英文码，便于编排器分支。
 */
export interface ProactiveLlmWhisperResult {
  ok: boolean;
  text?: string;
  reason?: string;
  screenshotAt?: number;
}

/**
 * 尝试生成一句基于桌面截图的主动耳语。
 *
 * 前置门禁（任一不满足即早退，不截图、不打模型）：
 * - 陪伴频率未开智能截图（`llm-not-standard`；`force` 可跳过）
 * - 屏幕感知不是 `screenshots`（`llm-screenshots-off`）
 * - 系统/权限不允许截屏（`llm-capture-blocked`）
 * - 距上次 LLM 耳语不足 30 分钟（`llm-interval`；`force` 可跳过）
 * - 当前 LLM 适配器无视觉能力（`llm-no-vision`）
 *
 * 通过后门捕获主屏缩略图，把角色系统提示 + 用户画像拼进 prompt，温度封顶 0.9、最多 120 token。
 * 流式拼接 delta；中途 `error` 块立即失败。空正文视为 `llm-empty`。
 *
 * @param input.bundle 当前桌宠角色包（人设卡 + 运行时 LLM 参数）
 * @param input.settings 主动陪伴设置（频率与屏幕感知）
 * @param input.llm 已选好的对话适配器
 * @param input.memory 用于把用户画像编进系统提示，本函数只读
 * @param input.screenCapture 主屏缩略图采集
 * @param input.lastLlmAt 上次 LLM 耳语时间戳；`null` 表示从未触发
 * @param input.force 为 true 时跳过频率与冷却门禁（设置页「立即试一句」）
 * @returns 成功带耳语文案与截图时间；失败仅带 reason，无副作用
 */
export async function tryProactiveLlmWhisper(input: {
  bundle: CharacterBundle;
  settings: ProactiveSettings;
  llm: LLMAdapter;
  memory: MemoryStore;
  screenCapture: ScreenCaptureService;
  lastLlmAt: number | null;
  force?: boolean;
}): Promise<ProactiveLlmWhisperResult> {
  const { bundle, settings, llm, memory, screenCapture, lastLlmAt, force = false } = input;
  if (!force && !frequencySupportsSmartScreenshot(settings.companionFrequency)) {
    return { ok: false, reason: "llm-not-standard" };
  }
  if (settings.screenAwareness !== "screenshots") {
    return { ok: false, reason: "llm-screenshots-off" };
  }
  if (!screenCapture.canCapture(settings)) {
    return { ok: false, reason: "llm-capture-blocked" };
  }
  if (!force && lastLlmAt && Date.now() - lastLlmAt < LLM_MIN_INTERVAL_MS) {
    return { ok: false, reason: "llm-interval" };
  }
  const vision = llm.detectVisionCapability();
  if (!vision.vision) {
    return { ok: false, reason: "llm-no-vision" };
  }

  const snapshot = await screenCapture.capturePrimaryThumbnail();
  if (!snapshot) return { ok: false, reason: "llm-capture-failed" };

  const profile = memory.getProfile();
  const flat = profileForPrompt(profile);
  const systemPromptBase = buildSystemPrompt({
    card: bundle.card,
    userProfile: {
      preferredName: flat.preferredName,
      factsByCategory: flat.factsByCategory
    },
    safety: { globalRefusalList: GLOBAL_REFUSAL_LIST },
    isFirstActivation: false
  });
  const systemPrompt = `${systemPromptBase}

【主动陪伴 · 截图气泡】
用户没有主动发起对话。你看到了一张桌面截图缩略图。
请用 1-2 句中文短句（12-40 字）轻声关心或提醒，符合你的性格。
不要分析屏幕细节，不要提 OCR 内容，不要像客服。`;

  let text = "";
  for await (const chunk of llm.chatStream({
    systemPrompt,
    modelOverride: vision.visionModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "【主动陪伴】请根据截图说一句话。"
          },
          { type: "image", url: snapshot.dataUrl, detail: "low" }
        ]
      }
    ],
    temperature: Math.min(bundle.runtime.llm.temperature, 0.9),
    maxTokens: 120,
    stream: true
  })) {
    if (chunk.kind === "delta") text += chunk.text;
    if (chunk.kind === "error") return { ok: false, reason: chunk.code ?? "llm-error" };
  }

  text = text.trim();
  if (!text) return { ok: false, reason: "llm-empty" };
  return { ok: true, text, screenshotAt: snapshot.capturedAt };
}

/** 供编排器在调用前预判冷却，避免重复进入本函数再被 `llm-interval` 挡回。 */
export { LLM_MIN_INTERVAL_MS };
