import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProactiveBubblePlacement, ProactiveWhisperEvent } from "../../shared/ipc-contract.js";
import { ProactiveBubble, type ProactiveBubbleState } from "../pet/proactive-bubble.js";
import { useBailin } from "../shared/use-bailin.js";
import { useReducedMotion } from "../shared/use-reduced-motion.js";

/** 气泡尖角在盒外占用的额外高度（absolute tail）。 */
const PROACTIVE_BUBBLE_TAIL_GUTTER_PX = 8;

export function ProactiveBubbleApp(): JSX.Element {
  const bailin = useBailin();
  const reducedMotion = useReducedMotion();
  const [bubble, setBubble] = useState<ProactiveBubbleState | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [placement, setPlacement] = useState<ProactiveBubblePlacement>("above");
  const bubbleRef = useRef<HTMLDivElement>(null);
  const lastReportedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return bailin.on.proactiveWhisper((evt) => {
      const e = evt as ProactiveWhisperEvent;
      lastReportedSizeRef.current = null;
      // 新耳语顶掉进行中的退场态
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      setLeaving(false);
      setBubble({ id: e.id, text: e.text });
    });
  }, [bailin]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return bailin.on.proactiveBubblePlacement((payload) => {
      setPlacement(payload.placement);
    });
  }, [bailin]);

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
        void bailin.proactiveBubble.resize({ width, height });
      });
    };

    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [bubble, placement, bailin]);

  const dismissBubble = useCallback(() => {
    if (reducedMotion) {
      setBubble(null);
      lastReportedSizeRef.current = null;
      void bailin.proactiveBubble.dismiss();
      return;
    }
    // 先播 160ms 退场动画，再真正卸载 + 通知主进程
    setLeaving(true);
    if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setLeaving(false);
      setBubble(null);
      lastReportedSizeRef.current = null;
      void bailin.proactiveBubble.dismiss();
    }, 170);
  }, [bailin, reducedMotion]);

  if (!bubble) {
    return <div className="bubble-shell" aria-hidden />;
  }

  return (
    <div className={`bubble-shell bubble-shell--${placement}`}>
      <ProactiveBubble
        ref={bubbleRef}
        bubble={bubble}
        placement={placement}
        leaving={leaving}
        onDismiss={dismissBubble}
        onOpenChat={() => {
          dismissBubble();
          void bailin.pet.openChat();
        }}
      />
    </div>
  );
}
