import type { Locale } from "./i18n/types.js";
import { zh } from "./i18n/locales/zh.js";
import { en } from "./i18n/locales/en.js";

const LOCALES = { zh, en } as const;

function timeStr(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = LOCALES[locale].time as Record<string, string>;
  let raw = dict[key] ?? (zh.time as Record<string, string>)[key] ?? key;
  if (params) {
    raw = raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
      params[k] != null ? String(params[k]) : ""
    );
  }
  return raw;
}

/** 聊天消息相对时间（悬浮时展示）。 */
export function formatChatTime(createdAt: number, locale: Locale = "zh", now = Date.now()): string {
  const diffMs = Math.max(0, now - createdAt);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return timeStr(locale, "justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return timeStr(locale, "minutesAgo", { count: diffMin });

  const d = new Date(createdAt);
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;

  return timeStr(locale, "monthDayTime", {
    month: d.getMonth() + 1,
    day: d.getDate(),
    hours: hh,
    minutes: mm
  });
}

/** 会话列表时间（更短）。 */
export function formatSessionListTime(
  updatedAt: number,
  locale: Locale = "zh",
  now = Date.now()
): string {
  const diffMs = Math.max(0, now - updatedAt);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return timeStr(locale, "justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return timeStr(locale, "minutesAgo", { count: diffMin });

  const d = new Date(updatedAt);
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;

  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  if (d.getFullYear() === today.getFullYear()) return `${mo}-${dd}`;
  return `${d.getFullYear()}-${mo}-${dd}`;
}
