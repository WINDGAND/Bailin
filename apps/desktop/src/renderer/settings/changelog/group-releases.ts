/**
 * 将 GitHub Release 列表按本地日历日分组，供更新日志面板按日渲染。
 *
 * 输入须已按发布时间从新到旧排好：只与「上一组」比 dayKey，同日则并入，换日才开新组。
 * 时区默认取运行环境；测试可注入 IANA 时区，保证 dayKey / 文案稳定。
 * 纯函数，无副作用。
 */
import type { ReleaseSummary } from "../../../shared/ipc-contract.js";

/** 同一本地日内的一组 Release；`items` 保持调用方给定的相对顺序。 */
export interface ReleaseDayGroup {
  /** 本地时区下的 YYYY-MM-DD，用作分组键。 */
  dayKey: string;
  /** 日期 + 星期的完整标题（兼容旧调用方）。 */
  dayLabel: string;
  /** 日期部分，如 2026年7月15日。 */
  dayTitle: string;
  /** 星期部分，如 周三 / Friday。 */
  dayWeekday: string;
  /** 该日条目，含本地时区的时分标签 `timeLabel`。 */
  items: Array<ReleaseSummary & { timeLabel: string }>;
}

function resolveTimeZone(timeZone?: string): string {
  return timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatDayKey(date: Date, timeZone: string): string {
  // en-CA 固定产出 YYYY-MM-DD，分组键与界面 locale 文案无关
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDayParts(
  date: Date,
  locale: "zh" | "en",
  timeZone: string
): { dayTitle: string; dayWeekday: string; dayLabel: string } {
  if (locale === "zh") {
    const dayTitle = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
    const dayWeekday = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      weekday: "short"
    }).format(date);
    return { dayTitle, dayWeekday, dayLabel: `${dayTitle}${dayWeekday}` };
  }

  const dayTitle = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
  const dayWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long"
  }).format(date);
  return { dayTitle, dayWeekday, dayLabel: `${dayWeekday}, ${dayTitle}` };
}

function formatTimeLabel(date: Date, locale: "zh" | "en", timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    // h23：避免 en-US 把午夜格式化成 24:00
    hourCycle: "h23"
  }).format(date);
}

/**
 * 按本地日历日把 Release 收成若干组。
 *
 * @param releases 已按发布时间降序的摘要列表
 * @param locale 日期 / 星期 / 时刻文案语言
 * @param timeZone 可选 IANA 时区；缺省用 `Intl` 解析的系统时区
 * @returns 按出现顺序排列的日分组；空输入得到空数组
 */
export function groupReleasesByDay(
  releases: ReleaseSummary[],
  locale: "zh" | "en",
  timeZone?: string
): ReleaseDayGroup[] {
  const tz = resolveTimeZone(timeZone);
  const groups: ReleaseDayGroup[] = [];

  for (const release of releases) {
    const publishedAt = new Date(release.publishedAt);
    const dayKey = formatDayKey(publishedAt, tz);
    const lastGroup = groups.at(-1);

    const item = {
      ...release,
      timeLabel: formatTimeLabel(publishedAt, locale, tz)
    };

    // 只并入上一组：未预先按时间排序时，同日条目可能裂成多组
    if (lastGroup?.dayKey === dayKey) {
      lastGroup.items.push(item);
      continue;
    }

    const parts = formatDayParts(publishedAt, locale, tz);
    groups.push({
      dayKey,
      dayLabel: parts.dayLabel,
      dayTitle: parts.dayTitle,
      dayWeekday: parts.dayWeekday,
      items: [item]
    });
  }

  return groups;
}
