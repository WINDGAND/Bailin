/**
 * 主动陪伴编排器：把环境信号与定时 LLM 耳语收口成桌宠开口。
 *
 * 主进程唯一入口。`handleSignal` 走场景模板；`tickLlmWhisper` 走智能截图。
 * 开口前过 `checkGates`（开关、勿扰、专注、hush、聊天可见、桌宠隐藏、配额）。
 * 模板耳语不计入每小时配额；只有 LLM 层在 `publishWhisper` 里 +1。
 * 成功开口后一律按 `defaultHushMinutes` 写入 hush，避免连发。
 */
import { ulid } from "ulid";
import { IPC, type AmbientSignal, type ProactiveStatus } from "../../shared/ipc-contract.js";
import type { LLMAdapter } from "../adapters/llm-adapter.js";
import type { ScreenCaptureService } from "../capture/screen-capture.js";
import type { MemoryStore } from "../runtime/memory-store.js";
import type { LocalVault } from "../store/local-vault.js";
import {
  currentHourBucket,
  getLongActiveThreshold,
  isQuietHoursActive,
  readProactiveSettings,
  SETTING_PROACTIVE_FOCUS_UNTIL,
  SETTING_PROACTIVE_HOUR_BUCKET,
  SETTING_PROACTIVE_HOUR_COUNT,
  SETTING_PROACTIVE_HUSH_UNTIL,
  SETTING_PROACTIVE_LAST_AT,
  SETTING_PROACTIVE_LAST_LLM_AT,
  SETTING_PROACTIVE_LAST_REASON,
  SETTING_PROACTIVE_LAST_SCREENSHOT_AT,
  writeProactiveSettings
} from "./proactive-settings.js";
import { tryProactiveLlmWhisper } from "./proactive-llm-whisper.js";
import { renderWhisperTemplate, scenarioFromSignal } from "./whisper-templates.js";
import type { ProactiveSettings } from "../../shared/ipc-contract.js";

/**
 * 编排器依赖注入。
 * `broadcast` 把信号 / 耳语推给所有渲染进程；截图与 LLM 缺省时智能耳语会失败。
 */
export interface ProactiveOrchestratorDeps {
  vault: LocalVault;
  getActiveCharacterId: () => string | null;
  isChatVisible: () => boolean;
  isPetVisible: () => boolean;
  broadcast: (channel: string, payload: unknown) => void;
  getActiveMinutes?: () => number;
  getMinutesUntilLongActive?: () => number | null;
  resetActiveSessionAfterWhisper?: () => void;
  llm?: LLMAdapter;
  memory?: MemoryStore;
  screenCapture?: ScreenCaptureService;
}

/** 耳语原因：环境信号 kind，外加久坐与 LLM 两档。 */
type WhisperReason = AmbientSignal["kind"] | "long_active" | "llm";

/** 主动陪伴中枢：设置读写、环境信号处理、模板/LLM 耳语发布。 */
export class ProactiveOrchestrator {
  constructor(private readonly deps: ProactiveOrchestratorDeps) {}

  /** 读取规范化后的主动陪伴设置。无副作用。 */
  getSettings() {
    return readProactiveSettings(this.deps.vault);
  }

  /**
   * 规范化后写回 vault。
   * @returns 实际落盘的设置，供 IPC 回传设置页。
   */
  setSettings(input: Parameters<typeof writeProactiveSettings>[1]) {
    return writeProactiveSettings(this.deps.vault, input);
  }

  /**
   * 暂时闭嘴到 `now + durationMs`。
   * 时长 ≤0 时截止时间等于现在，相当于立刻解除。
   */
  hush(durationMs: number): void {
    const until = Date.now() + Math.max(0, durationMs);
    this.deps.vault.setSetting(SETTING_PROACTIVE_HUSH_UNTIL, String(until));
  }

  /** 进入专注模式到 `now + durationMs`；门控里视为比 hush 更强的静音。 */
  focusMode(durationMs: number): void {
    const until = Date.now() + Math.max(0, durationMs);
    this.deps.vault.setSetting(SETTING_PROACTIVE_FOCUS_UNTIL, String(until));
  }

  /** 聚合设置页状态栏所需字段；时间戳缺失则为 `undefined`。 */
  getStatus(): ProactiveStatus {
    const settings = this.getSettings();
    const activeMinutes = this.deps.getActiveMinutes?.() ?? 0;
    const threshold = getLongActiveThreshold(settings);
    return {
      enabled: settings.enabled,
      companionFrequency: settings.companionFrequency,
      maxPerHour: settings.maxPerHour,
      hushUntil: this.getHushUntil() ?? undefined,
      focusModeUntil: this.getFocusUntil() ?? undefined,
      utterancesThisHour: this.getHourCount(Date.now()).count,
      screenAwareness: settings.screenAwareness,
      lastReason: this.getLastReason() ?? undefined,
      lastAt: this.getLastAt() ?? undefined,
      activeMinutes,
      longActiveThresholdMinutes: threshold,
      minutesUntilLongActive: this.deps.getMinutesUntilLongActive?.() ?? null,
      lastScreenshotAt: this.getLastScreenshotAt() ?? undefined
    };
  }

  /**
   * 处理一条环境信号：先广播给渲染进程，再决定是否模板开口。
   * 锁屏只广播、永不耳语（`locked`）；场景开关关闭则 `scenario-disabled`。
   */
  async handleSignal(signal: AmbientSignal): Promise<{ ok: boolean; reason?: string }> {
    this.deps.broadcast(IPC.EventAmbientSignal, signal);
    if (signal.kind === "lock") {
      return { ok: false, reason: "locked" };
    }
    if (!this.isScenarioEnabled(signal)) {
      return { ok: false, reason: "scenario-disabled" };
    }
    return this.maybeTemplateWhisper(signal);
  }

  /**
   * 设置页「现在试一次」：合成信号并以 `force` 绕过多数门控（仍要求功能未关闭）。
   * @param reason 默认 `manual`。
   */
  async triggerNow(reason: AmbientSignal["kind"] = "manual"): Promise<{ ok: boolean; reason?: string }> {
    return this.maybeTemplateWhisper({ kind: reason, at: Date.now() } as AmbientSignal, {
      force: true
    });
  }

  /** 手动试一次智能截图（绕过勿扰/安静/配额/冷却，但仍需截图授权与视觉模型）。 */
  async triggerLlmWhisperNow(): Promise<{ ok: boolean; reason?: string }> {
    const settings = this.getSettings();
    if (!settings.enabled || settings.companionFrequency === "off") {
      return { ok: false, reason: "disabled" };
    }

    const characterId = this.deps.getActiveCharacterId();
    if (!characterId) return { ok: false, reason: "no-active-character" };
    const bundle = this.deps.vault.getCharacter(characterId);
    if (!bundle) return { ok: false, reason: "character-not-found" };
    if (!this.deps.llm || !this.deps.memory || !this.deps.screenCapture) {
      return { ok: false, reason: "llm-unavailable" };
    }

    const result = await tryProactiveLlmWhisper({
      bundle,
      settings,
      llm: this.deps.llm,
      memory: this.deps.memory,
      screenCapture: this.deps.screenCapture,
      lastLlmAt: null,
      force: true
    });
    if (!result.ok || !result.text) return { ok: false, reason: result.reason };

    if (result.screenshotAt) {
      this.deps.vault.setSetting(
        SETTING_PROACTIVE_LAST_SCREENSHOT_AT,
        String(result.screenshotAt)
      );
    }

    const bucket = this.getHourCount(Date.now());
    return this.publishWhisper({
      characterId,
      text: result.text,
      reason: "llm",
      layer: "llm",
      settings
    });
  }

  /**
   * 定时巡检智能截图耳语。走完整门控与小时配额；冷却由 `tryProactiveLlmWhisper` 内部处理。
   */
  async tickLlmWhisper(): Promise<{ ok: boolean; reason?: string }> {
    const settings = this.getSettings();
    const gate = this.checkGates(settings, { force: false });
    if (!gate.ok) return gate;

    const characterId = this.deps.getActiveCharacterId();
    if (!characterId) return { ok: false, reason: "no-active-character" };
    const bundle = this.deps.vault.getCharacter(characterId);
    if (!bundle) return { ok: false, reason: "character-not-found" };
    if (!this.deps.llm || !this.deps.memory || !this.deps.screenCapture) {
      return { ok: false, reason: "llm-unavailable" };
    }

    const bucket = this.getHourCount(Date.now());
    if (bucket.count >= settings.maxPerHour) {
      return { ok: false, reason: "hourly-quota" };
    }

    const result = await tryProactiveLlmWhisper({
      bundle,
      settings,
      llm: this.deps.llm,
      memory: this.deps.memory,
      screenCapture: this.deps.screenCapture,
      lastLlmAt: this.getLastLlmAt()
    });
    if (!result.ok || !result.text) return { ok: false, reason: result.reason };

    if (result.screenshotAt) {
      this.deps.vault.setSetting(
        SETTING_PROACTIVE_LAST_SCREENSHOT_AT,
        String(result.screenshotAt)
      );
    }

    return this.publishWhisper({
      characterId,
      text: result.text,
      reason: "llm",
      layer: "llm",
      settings
    });
  }

  /**
   * 按信号 kind 渲染场景模板并发布。
   * 久坐用 `activeMinutes`，闲置把秒数折成分钟塞进文案；其它场景不传分钟。
   */
  private async maybeTemplateWhisper(
    signal: AmbientSignal,
    options: { force?: boolean } = {}
  ): Promise<{ ok: boolean; reason?: string }> {
    const settings = this.getSettings();
    const gate = this.checkGates(settings, { force: options.force });
    if (!gate.ok) return gate;

    const characterId = this.deps.getActiveCharacterId();
    if (!characterId) return { ok: false, reason: "no-active-character" };
    const bundle = this.deps.vault.getCharacter(characterId);
    if (!bundle) return { ok: false, reason: "character-not-found" };

    const scenario = scenarioFromSignal(signal.kind);
    if (!scenario) return { ok: false, reason: "unknown-scenario" };

    const minutes =
      signal.kind === "long_active"
        ? signal.activeMinutes
        : signal.kind === "idle"
          ? Math.round(signal.idleSeconds / 60)
          : undefined;

    const text = renderWhisperTemplate(scenario, {
      name: bundle.card.meta.name,
      minutes
    });

    return this.publishWhisper({
      characterId,
      text,
      reason: signal.kind as WhisperReason,
      layer: "template",
      settings
    });
  }

  /**
   * 落盘最近一次触发、广播耳语事件，并按默认时长 hush。
   * 仅 `layer === "llm"` 时消耗小时配额并记录 `LAST_LLM_AT`；
   * 久坐成功后重置环境监视器的连续活跃计数。
   */
  private publishWhisper(input: {
    characterId: string;
    text: string;
    reason: WhisperReason;
    layer: "template" | "llm";
    settings: ProactiveSettings;
  }): { ok: boolean; reason?: string } {
    const now = Date.now();
    if (input.layer === "llm") {
      const bucket = this.getHourCount(now);
      this.setHourCount(bucket.bucket, bucket.count + 1);
    }
    this.deps.vault.setSetting(SETTING_PROACTIVE_LAST_REASON, input.reason);
    this.deps.vault.setSetting(SETTING_PROACTIVE_LAST_AT, String(now));
    if (input.layer === "llm") {
      this.deps.vault.setSetting(SETTING_PROACTIVE_LAST_LLM_AT, String(now));
    }
    if (input.reason === "long_active") {
      this.deps.resetActiveSessionAfterWhisper?.();
    }

    this.deps.broadcast(IPC.EventProactiveWhisper, {
      id: ulid(),
      characterId: input.characterId,
      text: input.text,
      reason: input.reason,
      layer: input.layer,
      createdAt: now
    });

    this.hush(input.settings.defaultHushMinutes * 60 * 1000);
    return { ok: true };
  }

  /**
   * 自动触发的门控。`force` 可绕过勿扰 / 专注 / hush / 聊天可见 / 桌宠隐藏 / 配额为 0，
   * 但不能绕过总开关或频率 `off`。
   */
  private checkGates(
    settings: ProactiveSettings,
    opts: { force?: boolean }
  ): { ok: true } | { ok: false; reason: string } {
    if (!settings.enabled || settings.companionFrequency === "off") {
      return { ok: false, reason: "disabled" };
    }
    if (!opts.force && isQuietHoursActive(settings)) {
      return { ok: false, reason: "quiet-hours" };
    }
    const focusUntil = this.getFocusUntil();
    if (!opts.force && focusUntil && focusUntil > Date.now()) {
      return { ok: false, reason: "focus-mode" };
    }
    const hushUntil = this.getHushUntil();
    if (!opts.force && hushUntil && hushUntil > Date.now()) {
      return { ok: false, reason: "hushed" };
    }
    if (!opts.force && this.deps.isChatVisible()) {
      return { ok: false, reason: "chat-visible" };
    }
    if (!opts.force && !this.deps.isPetVisible()) {
      return { ok: false, reason: "pet-hidden" };
    }
    if (!opts.force && settings.maxPerHour === 0) {
      return { ok: false, reason: "quota-disabled" };
    }
    return { ok: true };
  }

  /**
   * 场景开关。`resume` 与 `unlock` 共用「解锁」开关；`manual` 始终允许。
   * `lock` 不会走到这里（`handleSignal` 已提前返回）。
   */
  private isScenarioEnabled(signal: AmbientSignal): boolean {
    const toggles = this.getSettings().scenarioToggles;
    switch (signal.kind) {
      case "long_active":
        return toggles.longActive;
      case "idle":
        return toggles.idle;
      case "active":
        return toggles.returnActive;
      case "unlock":
      case "resume":
        return toggles.unlock;
      case "manual":
        return true;
      default:
        return false;
    }
  }

  private getHushUntil(): number | null {
    return this.readTimestamp(SETTING_PROACTIVE_HUSH_UNTIL);
  }

  private getFocusUntil(): number | null {
    return this.readTimestamp(SETTING_PROACTIVE_FOCUS_UNTIL);
  }

  private getLastLlmAt(): number | null {
    return this.readTimestamp(SETTING_PROACTIVE_LAST_LLM_AT);
  }

  private getLastAt(): number | null {
    return this.readTimestamp(SETTING_PROACTIVE_LAST_AT);
  }

  private getLastScreenshotAt(): number | null {
    return this.readTimestamp(SETTING_PROACTIVE_LAST_SCREENSHOT_AT);
  }

  private getLastReason(): WhisperReason | null {
    const raw = this.deps.vault.getSetting(SETTING_PROACTIVE_LAST_REASON);
    if (!raw) return null;
    return raw as WhisperReason;
  }

  private readTimestamp(key: string): number | null {
    const raw = this.deps.vault.getSetting(key);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * 读本小时 LLM 耳语计数。vault 里的桶标识与当前 UTC 小时不一致时视为 0，
   * 不立刻写回，等下一次 `setHourCount` 再换桶。
   */
  private getHourCount(now: number): { bucket: string; count: number } {
    const bucket = currentHourBucket(now);
    const savedBucket = this.deps.vault.getSetting(SETTING_PROACTIVE_HOUR_BUCKET);
    if (savedBucket !== bucket) return { bucket, count: 0 };
    const count = Number.parseInt(this.deps.vault.getSetting(SETTING_PROACTIVE_HOUR_COUNT) ?? "0", 10);
    return { bucket, count: Number.isFinite(count) ? count : 0 };
  }

  private setHourCount(bucket: string, count: number): void {
    this.deps.vault.setSetting(SETTING_PROACTIVE_HOUR_BUCKET, bucket);
    this.deps.vault.setSetting(SETTING_PROACTIVE_HOUR_COUNT, String(count));
  }
}
