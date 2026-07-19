export type StartViewTransition = (update: () => void) => unknown;

export type RunDetailTransitionOptions = {
  startViewTransition?: StartViewTransition;
  /** 距上次过渡不足此毫秒则跳过动画，避免连点排队。 */
  rapidWindowMs?: number;
  now?: () => number;
};

let lastStartedAt = 0;

/** 测试用：重置连点窗口时钟。 */
export function resetDetailTransitionClock(): void {
  lastStartedAt = 0;
}

/**
 * 将 DOM 更新交给浏览器的 View Transition 管理。
 * 不支持、或处于连点窗口内时立即更新，避免动画拖慢扫视选角色。
 */
export function runDetailTransition(
  update: () => void,
  options: StartViewTransition | RunDetailTransitionOptions = {}
): void {
  const opts: RunDetailTransitionOptions =
    typeof options === "function" ? { startViewTransition: options } : options;
  const now = (opts.now ?? Date.now)();
  const rapidWindowMs = opts.rapidWindowMs ?? 220;
  const rapid = lastStartedAt > 0 && now - lastStartedAt < rapidWindowMs;
  lastStartedAt = now;

  if (opts.startViewTransition && !rapid) {
    opts.startViewTransition(update);
    return;
  }
  update();
}
