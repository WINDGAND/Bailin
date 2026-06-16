/** 聊天消息相对时间（悬浮时展示）。 */
export function formatChatTime(createdAt: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - createdAt);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;

  const d = new Date(createdAt);
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;

  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}
