import type { ReleaseSummary } from "../../../shared/ipc-contract.js";

export interface ReleaseDayGroup {
  /** YYYY-MM-DD in local timezone */
  dayKey: string;
  /** preformatted heading for UI (date + weekday combined, kept for callers) */
  dayLabel: string;
  /** Date portion, e.g. 2026年7月15日 */
  dayTitle: string;
  /** Weekday portion, e.g. 周三 / Friday */
  dayWeekday: string;
  items: Array<ReleaseSummary & { timeLabel: string }>;
}

function resolveTimeZone(timeZone?: string): string {
  return timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatDayKey(date: Date, timeZone: string): string {
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
    hourCycle: "h23"
  }).format(date);
}

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
