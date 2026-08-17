import type { ProactiveScenarioToggles, ProactiveSettings } from "../../shared/ipc-contract.js";
import {
  DEFAULT_SCENARIO_TOGGLES,
  deriveCompanionFrequency,
  frequencyToMaxPerHour,
  longActiveThresholdMinutes
} from "../../shared/proactive-companion.js";
import { clampPetDisplayScale, PET_DISPLAY_SCALE_DEFAULT } from "../../shared/pet-display-scale.js";
import type { LocalVault } from "../store/local-vault.js";

/**
 * 桌宠「主动陪伴」设置的读写与规范化。
 *
 * 位于 Electron 主进程（`apps/desktop`），给 `ProactiveOrchestrator`、设置页 IPC
 * 以及桌宠缩放共用。用户偏好以 JSON 存在 LocalVault；其余 `SETTING_PROACTIVE_*`
 * 键则记录 hush/专注截止时间、本小时配额与最近一次触发，供编排器做限流与冷却。
 */

/** LocalVault 键：完整 `ProactiveSettings` 的 JSON。 */
export const SETTING_PROACTIVE_SETTINGS = "proactive_settings_json";
/** LocalVault 键：hush（暂时闭嘴）截止时间戳，毫秒。 */
export const SETTING_PROACTIVE_HUSH_UNTIL = "proactive_hush_until";
/** LocalVault 键：一键专注模式截止时间戳，毫秒。 */
export const SETTING_PROACTIVE_FOCUS_UNTIL = "proactive_focus_until";
/** LocalVault 键：当前小时配额桶标识，与 `currentHourBucket()` 对齐（UTC `YYYY-MM-DDTHH`）。 */
export const SETTING_PROACTIVE_HOUR_BUCKET = "proactive_hour_bucket";
/** LocalVault 键：本小时内已消耗的 LLM 耳语次数（场景模板不计入）。 */
export const SETTING_PROACTIVE_HOUR_COUNT = "proactive_hour_count";
/** LocalVault 键：最近一次 LLM 耳语时间戳，用于冷却。 */
export const SETTING_PROACTIVE_LAST_LLM_AT = "proactive_last_llm_at";
/** LocalVault 键：最近一次智能截图时间戳，用于截图冷却。 */
export const SETTING_PROACTIVE_LAST_SCREENSHOT_AT = "proactive_last_screenshot_at";
/** LocalVault 键：最近一次触发原因（闲置 / 久坐 / unlock 等），供状态栏展示。 */
export const SETTING_PROACTIVE_LAST_REASON = "proactive_last_reason";
/** LocalVault 键：最近一次耳语触发时间戳。 */
export const SETTING_PROACTIVE_LAST_AT = "proactive_last_at";

/**
 * 主动陪伴的出厂默认：轻度频率、不启用勿扰时段、不感知屏幕。
 * `enabled` / `intensity` / `maxPerHour` 与 `companionFrequency: "light"` 保持一致，
 * 写入时仍会由 `normalizeProactiveSettings` 再同步一遍。
 */
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

/**
 * 从 vault 读取主动陪伴设置。
 * 缺省或 JSON 损坏时回退到 `DEFAULT_PROACTIVE_SETTINGS`，避免编排器读到半残对象。
 */
export function readProactiveSettings(vault: LocalVault): ProactiveSettings {
  const raw = vault.getSetting(SETTING_PROACTIVE_SETTINGS);
  if (!raw) return DEFAULT_PROACTIVE_SETTINGS;
  try {
    return normalizeProactiveSettings(JSON.parse(raw) as Partial<ProactiveSettings>);
  } catch {
    return DEFAULT_PROACTIVE_SETTINGS;
  }
}

/**
 * 规范化后写回 vault。
 * @returns 实际落盘的设置（白名单钳制后），供 IPC 回传给设置页。
 */
export function writeProactiveSettings(
  vault: LocalVault,
  input: ProactiveSettings
): ProactiveSettings {
  const normalized = normalizeProactiveSettings(input);
  vault.setSetting(SETTING_PROACTIVE_SETTINGS, JSON.stringify(normalized));
  return normalized;
}

/**
 * 把部分/旧版设置收敛成当前契约。
 *
 * `companionFrequency` 是唯一真源：`enabled`、`intensity`、`maxPerHour` 都由它推导，
 * 以兼容历史上分开存储这三项的数据。非法枚举（hush 时长、勿扰时钟、屏幕感知）回落到默认。
 */
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

/**
 * 「久坐未起」场景的阈值（分钟），随陪伴频率升高而缩短。
 * 编排器把它交给 `AmbientMonitor` 的活跃会话跟踪。
 */
export function getLongActiveThreshold(settings: ProactiveSettings): number {
  return longActiveThresholdMinutes(settings.companionFrequency);
}

/**
 * 当前是否处于勿扰时段。关闭勿扰时恒为 false。
 *
 * 起止相同时视为全天勿扰；`start > end`（如 22:00–08:00）按跨夜窗口处理，
 * 否则按当天闭开区间 `[start, end)`。
 */
export function isQuietHoursActive(settings: ProactiveSettings, now = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = minutesOfDay(settings.quietHoursStart);
  const end = minutesOfDay(settings.quietHoursEnd);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

/**
 * 小时配额桶：UTC ISO 的前 13 位，形如 `2026-08-17T12`。
 * 与本地钟点可能差几个小时，但能保证每个 UTC 小时的计数彼此独立、不会永久锁死。
 */
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

/** 仅接受白名单内的值，避免旧数据或脏输入写出非法枚举。 */
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
