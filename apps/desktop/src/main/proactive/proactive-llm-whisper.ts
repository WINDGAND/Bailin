import { buildSystemPrompt } from "@nuwa-pet/nuwa-prompts";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { profileForPrompt } from "../../shared/profile.js";
import type { LLMAdapter } from "../adapters/llm-adapter.js";
import type { MemoryStore } from "../runtime/memory-store.js";
import { GLOBAL_REFUSAL_LIST } from "../safety/safety-policy.js";
import type { ScreenCaptureService } from "../capture/screen-capture.js";
import type { ProactiveSettings } from "../../shared/ipc-contract.js";
import { frequencySupportsSmartScreenshot } from "../../shared/proactive-companion.js";

const LLM_MIN_INTERVAL_MS = 30 * 60 * 1000;

export interface ProactiveLlmWhisperResult {
  ok: boolean;
  text?: string;
  reason?: string;
  screenshotAt?: number;
}

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

export { LLM_MIN_INTERVAL_MS };
