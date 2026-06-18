import type { ProactiveScenarioToggles, ProactiveSettings } from "../../shared/ipc-contract.js";
import {
  DEFAULT_SCENARIO_TOGGLES,
  deriveCompanionFrequency,
  frequencyToMaxPerHour,
  longActiveThresholdMinutes
} from "../../shared/proactive-companion.js";
import { clampPetDisplayScale, PET_DISPLAY_SCALE_DEFAULT } from "../../shared/pet-display-scale.js";
import type { LocalVault } from "../store/local-vault.js";

export const SETTING_PROACTIVE_SETTINGS = "proactive_settings_json";
export const SETTING_PROACTIVE_HUSH_UNTIL = "proactive_hush_until";
export const SETTING_PROACTIVE_FOCUS_UNTIL = "proactive_focus_until";
export const SETTING_PROACTIVE_HOUR_BUCKET = "proactive_hour_bucket";
export const SETTING_PROACTIVE_HOUR_COUNT = "proactive_hour_count";
export const SETTING_PROACTIVE_LAST_LLM_AT = "proactive_last_llm_at";
export const SETTING_PROACTIVE_LAST_SCREENSHOT_AT = "proactive_last_screenshot_at";
export const SETTING_PROACTIVE_LAST_REASON = "proactive_last_reason";
export const SETTING_PROACTIVE_LAST_AT = "proactive_last_at";

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  enabled: true,
  intensity: "light",
  maxPerHour: 1,
  companionFrequency: "light",
  scenarioToggles: { ...DEFAULT_SCENARIO_TOGGLES },
  defaultHushMinutes: 30,
  defaultFocusMinutes: 25,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  screenAwareness: "off",
  petDisplayScale: PET_DISPLAY_SCALE_DEFAULT
};

export function readProactiveSettings(vault: LocalVault): ProactiveSettings {
  const raw = vault.getSetting(SETTING_PROACTIVE_SETTINGS);
  if (!raw) return DEFAULT_PROACTIVE_SETTINGS;
  try {
    return normalizeProactiveSettings(JSON.parse(raw) as Partial<ProactiveSettings>);
  } catch {
    return DEFAULT_PROACTIVE_SETTINGS;
  }
}

export function writeProactiveSettings(
  vault: LocalVault,
  input: ProactiveSettings
): ProactiveSettings {
  const normalized = normalizeProactiveSettings(input);
  vault.setSetting(SETTING_PROACTIVE_SETTINGS, JSON.stringify(normalized));
  return normalized;
}

export function normalizeProactiveSettings(
  input: Partial<ProactiveSettings>
): ProactiveSettings {
  const companionFrequency = deriveCompanionFrequency(input);
  const maxPerHour = frequencyToMaxPerHour(companionFrequency);
  const enabled = companionFrequency !== "off";
  const scenarioToggles = normalizeScenarioToggles(input.scenarioToggles);
  return {
    enabled,
    intensity: companionFrequency,
    maxPerHour,
    companionFrequency,
    scenarioToggles,
    defaultHushMinutes: pick(
      input.defaultHushMinutes,
      [15, 30, 60],
      DEFAULT_PROACTIVE_SETTINGS.defaultHushMinutes
    ),
    defaultFocusMinutes: pick(
      input.defaultFocusMinutes,
      [15, 25, 30, 45, 60],
      DEFAULT_PROACTIVE_SETTINGS.defaultFocusMinutes
    ),
    quietHoursEnabled: input.quietHoursEnabled ?? DEFAULT_PROACTIVE_SETTINGS.quietHoursEnabled,
    quietHoursStart: normalizeTime(input.quietHoursStart, DEFAULT_PROACTIVE_SETTINGS.quietHoursStart),
    quietHoursEnd: normalizeTime(input.quietHoursEnd, DEFAULT_PROACTIVE_SETTINGS.quietHoursEnd),
    screenAwareness: pick(
      input.screenAwareness,
      ["off", "signals", "screenshots"],
      DEFAULT_PROACTIVE_SETTINGS.screenAwareness
    ),
    petDisplayScale: clampPetDisplayScale(
      input.petDisplayScale ?? DEFAULT_PROACTIVE_SETTINGS.petDisplayScale
    )
  };
}

export function getLongActiveThreshold(settings: ProactiveSettings): number {
  return longActiveThresholdMinutes(settings.companionFrequency);
}

export function isQuietHoursActive(settings: ProactiveSettings, now = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = minutesOfDay(settings.quietHoursStart);
  const end = minutesOfDay(settings.quietHoursEnd);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

export function currentHourBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 13);
}

function normalizeScenarioToggles(input: Partial<ProactiveScenarioToggles> | undefined): ProactiveScenarioToggles {
  return {
    longActive: input?.longActive ?? DEFAULT_SCENARIO_TOGGLES.longActive,
    idle: input?.idle ?? DEFAULT_SCENARIO_TOGGLES.idle,
    returnActive: input?.returnActive ?? DEFAULT_SCENARIO_TOGGLES.returnActive,
    unlock: input?.unlock ?? DEFAULT_SCENARIO_TOGGLES.unlock
  };
}

function pick<const T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function minutesOfDay(value: string): number {
  const [h, m] = value.split(":").map((n) => Number.parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}
