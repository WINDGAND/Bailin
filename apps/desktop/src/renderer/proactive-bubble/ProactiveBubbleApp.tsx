import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProactiveBubblePlacement, ProactiveWhisperEvent } from "../../shared/ipc-contract.js";
import { ProactiveBubble, type ProactiveBubbleState } from "../pet/proactive-bubble.js";
import { useNuwa } from "../shared/use-nuwa.js";

/** 气泡尖角在盒外占用的额外高度（absolute tail）。 */
const PROACTIVE_BUBBLE_TAIL_GUTTER_PX = 8;

export function ProactiveBubbleApp(): JSX.Element {
  const nuwa = useNuwa();
  const [bubble, setBubble] = useState<ProactiveBubbleState | null>(null);
  const [placement, setPlacement] = useState<ProactiveBubblePlacement>("above");
  const bubbleRef = useRef<HTMLDivElement>(null);
  const lastReportedSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    return nuwa.on.proactiveWhisper((evt) => {
      const e = evt as ProactiveWhisperEvent;
      lastReportedSizeRef.current = null;
      setBubble({ id: e.id, text: e.text });
    });
  }, [nuwa]);

  useEffect(() => {
    return nuwa.on.proactiveBubblePlacement((payload) => {
      setPlacement(payload.placement);
    });
  }, [nuwa]);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!bubble || !el) return;

    let raf = 0;
    const reportSize = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const width = Math.ceil(rect.width);
        const height = Math.ceil(rect.height) + PROACTIVE_BUBBLE_TAIL_GUTTER_PX;
        const last = lastReportedSizeRef.current;
        if (last && last.width === width && last.height === height) return;
        lastReportedSizeRef.current = { width, height };
        void nuwa.proactiveBubble.resize({ width, height });
      });
    };

    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [bubble, placement, nuwa]);

  const dismissBubble = useCallback(() => {
    setBubble(null);
    lastReportedSizeRef.current = null;
    void nuwa.proactiveBubble.dismiss();
  }, [nuwa]);

  if (!bubble) {
    return <div className="bubble-shell" aria-hidden />;
  }

  return (
    <div className={`bubble-shell bubble-shell--${placement}`}>
      <ProactiveBubble
        ref={bubbleRef}
        bubble={bubble}
        placement={placement}
        onDismiss={dismissBubble}
        onOpenChat={() => {
          dismissBubble();
          void nuwa.pet.openChat();
        }}
      />
    </div>
  );
}
