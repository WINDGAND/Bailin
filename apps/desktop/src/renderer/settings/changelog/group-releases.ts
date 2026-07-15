import type { ReleaseSummary } from "../../../shared/ipc-contract.js";

export interface ReleaseDayGroup {
  /** YYYY-MM-DD in local timezone */
  dayKey: string;
  /** preformatted heading for UI */
  dayLabel: string;
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

function formatDayLabel(date: Date, locale: "zh" | "en", timeZone: string): string {
  if (locale === "zh") {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

function formatTimeLabel(date: Date, locale: "zh" | "en", timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
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

    groups.push({
      dayKey,
      dayLabel: formatDayLabel(publishedAt, locale, tz),
      items: [item]
    });
  }

  return groups;
}
