import { useCallback, useEffect, useRef, useState } from "react";
import type { ProactiveBubblePlacement } from "../../shared/ipc-contract.js";
import { useT } from "../shared/i18n/index.js";

const AUTO_DISMISS_MS = 4500;

export interface ProactiveBubbleState {
  id: string;
  text: string;
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
    timerRef.current = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return clearTimer;
  }, [bubble, paused, onDismiss, clearTimer]);

  if (!bubble) return null;

  return (
    <div
      className={`proactive-bubble proactive-bubble--${placement}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
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
