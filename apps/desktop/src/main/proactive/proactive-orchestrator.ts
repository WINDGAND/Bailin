import { ulid } from "ulid";
import { IPC, type AmbientSignal, type ProactiveStatus } from "../../shared/ipc-contract.js";
import type { LocalVault } from "../store/local-vault.js";
import {
  currentHourBucket,
  isQuietHoursActive,
  readProactiveSettings,
  SETTING_PROACTIVE_HOUR_BUCKET,
  SETTING_PROACTIVE_HOUR_COUNT,
  SETTING_PROACTIVE_HUSH_UNTIL,
  writeProactiveSettings
} from "./proactive-settings.js";

export interface ProactiveOrchestratorDeps {
  vault: LocalVault;
  getActiveCharacterId: () => string | null;
  isChatVisible: () => boolean;
  broadcast: (channel: string, payload: unknown) => void;
  /** 悄悄话已经发出去后调用——通常用来弹出气泡窗口让用户看到。 */
  onWhisperPublished?: () => void;
}

export class ProactiveOrchestrator {
  private lastReason: AmbientSignal["kind"] | undefined;
  private lastAt: number | undefined;

  constructor(private readonly deps: ProactiveOrchestratorDeps) {}

  getSettings() {
    return readProactiveSettings(this.deps.vault);
  }

  setSettings(input: Parameters<typeof writeProactiveSettings>[1]) {
    return writeProactiveSettings(this.deps.vault, input);
  }

  hush(durationMs: number): void {
    const until = Date.now() + Math.max(0, durationMs);
    this.deps.vault.setSetting(SETTING_PROACTIVE_HUSH_UNTIL, String(until));
  }

  getStatus(): ProactiveStatus {
    const settings = this.getSettings();
    return {
      enabled: settings.enabled,
      hushUntil: this.getHushUntil() ?? undefined,
      utterancesThisHour: this.getHourCount(Date.now()).count,
      screenAwareness: settings.screenAwareness,
      lastReason: this.lastReason,
      lastAt: this.lastAt
    };
  }

  async handleSignal(signal: AmbientSignal): Promise<{ ok: boolean; reason?: string }> {
    this.deps.broadcast(IPC.EventAmbientSignal, signal);
    return this.maybeWhisper(signal);
  }

  async triggerNow(reason: AmbientSignal["kind"] = "manual"): Promise<{ ok: boolean; reason?: string }> {
    return this.maybeWhisper({ kind: reason, at: Date.now() } as AmbientSignal, { force: true });
  }

  private async maybeWhisper(
    signal: AmbientSignal,
    options: { force?: boolean } = {}
  ): Promise<{ ok: boolean; reason?: string }> {
    const settings = this.getSettings();
    if (!settings.enabled || settings.intensity === "off") return { ok: false, reason: "disabled" };
    if (!options.force && isQuietHoursActive(settings)) return { ok: false, reason: "quiet-hours" };
    const hushUntil = this.getHushUntil();
    if (!options.force && hushUntil && hushUntil > Date.now()) return { ok: false, reason: "hushed" };
    if (!options.force && this.deps.isChatVisible()) return { ok: false, reason: "chat-visible" };
    if (!options.force && signal.kind === "lock") return { ok: false, reason: "locked" };
    if (!options.force && settings.maxPerHour === 0) return { ok: false, reason: "quota-disabled" };

    const bucket = this.getHourCount(Date.now());
    if (!options.force && bucket.count >= settings.maxPerHour) {
      return { ok: false, reason: "hourly-quota" };
    }

    const characterId = this.deps.getActiveCharacterId();
    if (!characterId) return { ok: false, reason: "no-active-character" };
    const bundle = this.deps.vault.getCharacter(characterId);
    if (!bundle) return { ok: false, reason: "character-not-found" };

    const text = makeWhisperText(signal.kind, bundle.card.meta.name);
    this.lastReason = signal.kind;
    this.lastAt = Date.now();
    this.setHourCount(bucket.bucket, bucket.count + 1);
    this.deps.broadcast(IPC.EventProactiveWhisper, {
      id: ulid(),
      characterId,
      text,
      reason: signal.kind,
      createdAt: this.lastAt
    });
    this.deps.onWhisperPublished?.();
    return { ok: true };
  }

  private getHushUntil(): number | null {
    const raw = this.deps.vault.getSetting(SETTING_PROACTIVE_HUSH_UNTIL);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

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

function makeWhisperText(reason: AmbientSignal["kind"], name: string): string {
  switch (reason) {
    case "idle":
      return `${name}小声说：你停了好一会儿。卡住的话，我可以陪你拆一下。`;
    case "active":
      return `${name}探头：回来啦。刚才那段要继续吗？`;
    case "unlock":
    case "resume":
      return `${name}眨眨眼：欢迎回来。先慢慢接上节奏。`;
    case "manual":
      return `${name}在这儿。想让我陪你看哪件事？`;
    default:
      return `${name}轻轻碰了碰你：我在旁边。`;
  }
}
