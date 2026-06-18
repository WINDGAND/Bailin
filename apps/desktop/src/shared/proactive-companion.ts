import type { CompanionFrequency, ProactiveScenarioToggles } from "./ipc-contract.js";

export const DEFAULT_SCENARIO_TOGGLES: ProactiveScenarioToggles = {
  longActive: true,
  idle: true,
  returnActive: true,
  unlock: false
};

/** 从低到高；UI 下拉与配额推导共用。 */
export const COMPANION_FREQUENCIES: readonly CompanionFrequency[] = [
  "off",
  "light",
  "standard",
  "active",
  "intense"
] as const;

export type CompanionMaxPerHour = 0 | 1 | 2 | 3 | 4;

export function frequencyToMaxPerHour(frequency: CompanionFrequency): CompanionMaxPerHour {
  switch (frequency) {
    case "off":
      return 0;
    case "light":
      return 1;
    case "standard":
      return 2;
    case "active":
      return 3;
    case "intense":
      return 4;
  }
}

export function maxPerHourToFrequency(maxPerHour: number): CompanionFrequency {
  if (maxPerHour <= 0) return "off";
  if (maxPerHour === 1) return "light";
  if (maxPerHour === 2) return "standard";
  if (maxPerHour === 3) return "active";
  return "intense";
}

/** 「适中」及以上可启用智能截图（自动触发仍受单独冷却约束）。 */
export function frequencySupportsSmartScreenshot(frequency: CompanionFrequency): boolean {
  return frequency === "standard" || frequency === "active" || frequency === "intense";
}

export function longActiveThresholdMinutes(frequency: CompanionFrequency): number {
  switch (frequency) {
    case "intense":
      return 30;
    case "active":
      return 35;
    case "standard":
      return 45;
    case "light":
    case "off":
    default:
      return 60;
  }
}

export function deriveCompanionFrequency(input: {
  companionFrequency?: CompanionFrequency;
  intensity?: CompanionFrequency | "off" | "light" | "standard";
  maxPerHour?: number;
  enabled?: boolean;
}): CompanionFrequency {
  if (input.companionFrequency && COMPANION_FREQUENCIES.includes(input.companionFrequency)) {
    return input.companionFrequency;
  }
  if (input.intensity && COMPANION_FREQUENCIES.includes(input.intensity as CompanionFrequency)) {
    return input.intensity as CompanionFrequency;
  }
  if (input.intensity === "off" || input.enabled === false || input.maxPerHour === 0) {
    return "off";
  }
  if (typeof input.maxPerHour === "number") {
    return maxPerHourToFrequency(input.maxPerHour);
  }
  if (input.intensity === "standard") return "standard";
  return "light";
}

export type WhisperScenarioKind =
  | "long_active"
  | "idle"
  | "active"
  | "unlock"
  | "resume"
  | "manual"
  | "llm";
