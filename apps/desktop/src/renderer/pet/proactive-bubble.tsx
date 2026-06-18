import { useCallback, useEffect, useRef, useState } from "react";
import type { ProactiveBubblePlacement } from "../../shared/ipc-contract.js";
import { PROACTIVE_BUBBLE_EXTRA_HEIGHT } from "../../shared/pet-display-scale.js";
import { useT } from "../shared/i18n/index.js";

const AUTO_DISMISS_MS = 4500;
/** 越过屏幕中线后保持当前方位，避免布局切换引起 screenY 反馈振荡。 */
const PLACEMENT_HYSTERESIS_PX = 80;

export interface ProactiveBubbleState {
  id: string;
  text: string;
}

export function resolveProactiveBubblePlacement(
  current: ProactiveBubblePlacement | null = null
): ProactiveBubblePlacement {
  const extra = PROACTIVE_BUBBLE_EXTRA_HEIGHT;
  const petZoneH = Math.max(0, window.innerHeight - extra);
  // 用桌宠活动区中心作锚点；整窗中心在 above/below 切换时会跳 extra/2，导致来回翻转。
  const anchorY =
    current === "above"
      ? window.screenY + extra + petZoneH / 2
      : window.screenY + petZoneH / 2;

  const mid = window.screen.height / 2;

  if (current === "above") {
    return anchorY > mid - PLACEMENT_HYSTERESIS_PX ? "above" : "below";
  }
  if (current === "below") {
    return anchorY > mid + PLACEMENT_HYSTERESIS_PX ? "above" : "below";
  }
  return anchorY > mid ? "above" : "below";
}

interface ProactiveBubbleProps {
  bubble: ProactiveBubbleState | null;
  placement: ProactiveBubblePlacement;
  hushMinutes: number;
  onDismiss: () => void;
  onOpenChat: () => void;
  onHush: (minutes: number) => void;
}

export function ProactiveBubble({
  bubble,
  placement,
  hushMinutes,
  onDismiss,
  onOpenChat,
  onHush
}: ProactiveBubbleProps): JSX.Element | null {
  const t = useT();
  const [paused, setPaused] = useState(false);
  const [justOpened, setJustOpened] = useState(false);
  const hadBubbleRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!bubble) {
      hadBubbleRef.current = false;
      setJustOpened(false);
      return;
    }
    const firstInSession = !hadBubbleRef.current;
    hadBubbleRef.current = true;
    if (!firstInSession) return;
    setJustOpened(true);
    const tId = window.setTimeout(() => setJustOpened(false), 250);
    return () => window.clearTimeout(tId);
  }, [bubble?.id]);

  useEffect(() => {
    clearTimer();
    if (!bubble || paused) return;
    timerRef.current = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return clearTimer;
  }, [bubble, paused, onDismiss, clearTimer]);

  if (!bubble) return null;

  return (
    <div
      className={`proactive-bubble proactive-bubble--${placement}${justOpened ? " proactive-bubble--show" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ ["--bubble-extra" as string]: `${PROACTIVE_BUBBLE_EXTRA_HEIGHT}px` }}
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
      <div className="proactive-bubble__actions">
        <button
          type="button"
          className="proactive-bubble__action"
          onClick={() => {
            onHush(hushMinutes);
            onDismiss();
          }}
        >
          {t("pet.bubbleHush", { minutes: hushMinutes })}
        </button>
      </div>
      <div className="proactive-bubble__tail" aria-hidden />
    </div>
  );
}
