import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { ProactiveBubblePlacement } from "../../shared/ipc-contract.js";
import { useT } from "../shared/i18n/index.js";

const AUTO_DISMISS_MS = 4500;
/** prefers-reduced-motion 用户需要更长的阅读时间（认知障碍 / 老年用户常用）。 */
const AUTO_DISMISS_MS_REDUCED = 9000;

export interface ProactiveBubbleState {
  id: string;
  text: string;
}

interface ProactiveBubbleProps {
  bubble: ProactiveBubbleState | null;
  placement: ProactiveBubblePlacement;
  onDismiss: () => void;
  onOpenChat: () => void;
}

/** 监听 prefers-reduced-motion 变化，组件可响应式拿到当前值。 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export const ProactiveBubble = forwardRef<HTMLDivElement, ProactiveBubbleProps>(
  function ProactiveBubble({ bubble, placement, onDismiss, onOpenChat }, ref): JSX.Element | null {
    const t = useT();
    const reducedMotion = usePrefersReducedMotion();
    // 鼠标悬停 / 键盘聚焦 都应暂停自动消失计时；任一为 true 就 paused。
    const [mouseInside, setMouseInside] = useState(false);
    const [keyboardFocused, setKeyboardFocused] = useState(false);
    const paused = mouseInside || keyboardFocused;
    const timerRef = useRef<number | null>(null);

    const clearTimer = useCallback(() => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }, []);

    useEffect(() => {
      clearTimer();
      if (!bubble || paused) return;
      const dismissMs = reducedMotion ? AUTO_DISMISS_MS_REDUCED : AUTO_DISMISS_MS;
      timerRef.current = window.setTimeout(onDismiss, dismissMs);
      return clearTimer;
    }, [bubble, paused, reducedMotion, onDismiss, clearTimer]);

    if (!bubble) return null;

    return (
      <div
        ref={ref}
        className={`proactive-bubble proactive-bubble--${placement}`}
        // 屏幕阅读器：气泡出现时通报新文字内容，但不打断用户当前任务。
        role="status"
        aria-live="polite"
        aria-atomic="true"
        onMouseEnter={() => setMouseInside(true)}
        onMouseLeave={() => setMouseInside(false)}
        // React 合成 onFocus/onBlur 在 parent 上能接住所有 descendant 的焦点变化。
        onFocus={() => setKeyboardFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setKeyboardFocused(false);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="proactive-bubble__close"
          aria-label={t("pet.bubbleClose")}
          onClick={onDismiss}
        >
          ×
        </button>
        <button type="button" className="proactive-bubble__text" onClick={onOpenChat}>
          {bubble.text}
        </button>
        <div className="proactive-bubble__tail" aria-hidden />
      </div>
    );
  }
);
