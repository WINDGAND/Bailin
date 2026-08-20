/**
 * 主动陪伴频率与场景的共享映射。
 *
 * 设置页、主进程编排器与 IPC 契约共用本文件，把「关闭 / 轻度 / 适中 / 活跃 / 频繁」
 * 换算成每小时配额、久坐阈值和智能截图资格，避免各层各自硬编码不一致。
 * 本文件无 I/O、无副作用，只做纯函数推导。
 */
import type { CompanionFrequency, ProactiveScenarioToggles } from "./ipc-contract.js";

/**
 * 各触发场景的出厂开关。
 * `unlock` 默认关闭：解锁瞬间容易误触；久坐、闲置、回到前台默认开启。
 */
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

/** 每小时最多触发的 LLM 耳语次数；与五档频率一一对应。 */
export type CompanionMaxPerHour = 0 | 1 | 2 | 3 | 4;

/**
 * 把频率档位映射为每小时配额。
 * @param frequency 五档之一；`off` 得到 0，表示完全不主动开口。
 * @returns 0–4 的整型配额，供编排器做小时桶限流。
 */
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

/**
 * 把任意数字配额反推回最接近的频率档。
 * @param maxPerHour 可能来自旧设置或脏数据；≤0 视为关闭，≥4 一律视为频繁。
 */
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

/**
 * 久坐场景判定所需的连续前台分钟数。
 * 频率越高阈值越短；`off` / `light` 与未知档一律 60 分钟，避免轻度用户被频繁打扰。
 */
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

/**
 * 从新旧设置字段中推导出当前频率档。
 *
 * 读取优先级：显式 `companionFrequency` → 旧字段 `intensity` →
 * 关闭信号（`enabled === false` 或配额为 0）→ 数字配额反推 → 默认 `light`。
 * 用于把历史设置平滑迁到五档频率，而不改调用方存储结构。
 */
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
  // 显式关闭：总开关关掉、配额为 0，或旧 intensity 写成 off。
  if (input.intensity === "off" || input.enabled === false || input.maxPerHour === 0) {
    return "off";
  }
  if (typeof input.maxPerHour === "number") {
    return maxPerHourToFrequency(input.maxPerHour);
  }
  if (input.intensity === "standard") return "standard";
  return "light";
}

/**
 * 耳语触发原因，供气泡文案与状态栏展示。
 * `resume` 是回到前台，`manual` 是用户点桌宠，`llm` 是模型生成而非场景模板。
 */
export type WhisperScenarioKind =
  | "long_active"
  | "idle"
  | "active"
  | "unlock"
  | "resume"
  | "manual"
  | "llm";
