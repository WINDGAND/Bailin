import type { ProactiveSettings } from "../../shared/ipc-contract.js";
import { clampPetDisplayScale, PET_DISPLAY_SCALE_DEFAULT } from "../../shared/pet-display-scale.js";
import type { LocalVault } from "../store/local-vault.js";

export const SETTING_PROACTIVE_SETTINGS = "proactive_settings_json";
export const SETTING_PROACTIVE_HUSH_UNTIL = "proactive_hush_until";
export const SETTING_PROACTIVE_HOUR_BUCKET = "proactive_hour_bucket";
export const SETTING_PROACTIVE_HOUR_COUNT = "proactive_hour_count";

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  enabled: true,
  intensity: "light",
  maxPerHour: 1,
  defaultHushMinutes: 30,
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
  const intensity = pick(
    input.intensity,
    ["off", "light", "standard"] as const,
    DEFAULT_PROACTIVE_SETTINGS.intensity
  );
  const enabled = input.enabled ?? intensity !== "off";
  return {
    enabled: enabled && intensity !== "off",
    intensity,
    maxPerHour: pick(input.maxPerHour, [0, 1, 2], DEFAULT_PROACTIVE_SETTINGS.maxPerHour),
    defaultHushMinutes: pick(
      input.defaultHushMinutes,
      [15, 30, 60],
      DEFAULT_PROACTIVE_SETTINGS.defaultHushMinutes
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
