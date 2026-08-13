export type StartViewTransition = (update: () => void) => unknown;

export type NamedTransitionElement = {
  style: { viewTransitionName: string };
};

export type RunDetailTransitionOptions = {
  startViewTransition?: StartViewTransition;
  /** 距上次过渡不足此毫秒则跳过动画，避免连点排队。 */
  rapidWindowMs?: number;
  now?: () => number;
  /** 仅在过渡期间写入，结束后必须清掉，否则会盖住 toast。 */
  namedElement?: NamedTransitionElement | null;
  viewTransitionName?: string;
  /** 有可见 toast 时不要开 View Transition：过渡层会盖住 top-layer popover。 */
  skipViewTransition?: boolean;
};

let lastStartedAt = 0;

/** 测试用：重置连点窗口时钟。 */
export function resetDetailTransitionClock(): void {
  lastStartedAt = 0;
}

function toastIsVisible(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(".toast-stack .toast") != null;
}

function whenTransitionFinished(result: unknown): Promise<void> {
  if (result && typeof result === "object" && "finished" in result) {
    const finished = (result as { finished?: unknown }).finished;
    if (finished != null && typeof (finished as Promise<void>).then === "function") {
      return Promise.resolve(finished as Promise<void>).then(
        () => undefined,
        () => undefined
      );
    }
  }
  return Promise.resolve();
}

/**
 * 将 DOM 更新交给浏览器的 View Transition 管理。
 * 不支持、或处于连点窗口内、或已有 toast 时立即更新，避免过渡层盖住提示。
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

  const named = opts.namedElement;
  const name = opts.viewTransitionName ?? "library-detail";
  const clearName = (): void => {
    if (named) named.style.viewTransitionName = "";
  };
  const skipForToast = Boolean(opts.skipViewTransition) || toastIsVisible();

  if (opts.startViewTransition && !rapid && !skipForToast) {
    if (named) named.style.viewTransitionName = name;
    let result: unknown;
    try {
      result = opts.startViewTransition(update);
    } catch {
      update();
      clearName();
      return;
    }
    void whenTransitionFinished(result).finally(() => {
      clearName();
    });
    return;
  }
  update();
}
