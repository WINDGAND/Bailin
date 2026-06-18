import { useCallback, useEffect, useState } from "react";
import type { ProactiveBubblePlacement, ProactiveWhisperEvent } from "../../shared/ipc-contract.js";
import { ProactiveBubble, type ProactiveBubbleState } from "../pet/proactive-bubble.js";
import { useNuwa } from "../shared/use-nuwa.js";

export function ProactiveBubbleApp(): JSX.Element {
  const nuwa = useNuwa();
  const [bubble, setBubble] = useState<ProactiveBubbleState | null>(null);
  const [placement, setPlacement] = useState<ProactiveBubblePlacement>("above");
  const [hushMinutes, setHushMinutes] = useState(30);

  useEffect(() => {
    void nuwa.proactive.getSettings().then((s) => {
      setHushMinutes(s.defaultHushMinutes ?? 30);
    });
    return nuwa.on.proactiveSettingsChanged((s) => {
      setHushMinutes(s.defaultHushMinutes ?? 30);
    });
  }, [nuwa]);

  useEffect(() => {
    return nuwa.on.proactiveWhisper((evt) => {
      const e = evt as ProactiveWhisperEvent;
      setBubble({ id: e.id, text: e.text });
    });
  }, [nuwa]);

  useEffect(() => {
    return nuwa.on.proactiveBubblePlacement((payload) => {
      setPlacement(payload.placement);
    });
  }, [nuwa]);

  const dismissBubble = useCallback(() => {
    setBubble(null);
    void nuwa.proactiveBubble.dismiss();
  }, [nuwa]);

  if (!bubble) {
    return <div className="bubble-shell" aria-hidden />;
  }

  return (
    <div className={`bubble-shell bubble-shell--${placement}`}>
      <ProactiveBubble
        bubble={bubble}
        placement={placement}
        hushMinutes={hushMinutes}
        onDismiss={dismissBubble}
        onOpenChat={() => {
          dismissBubble();
          void nuwa.pet.openChat();
        }}
        onHush={(minutes) => void nuwa.pet.hush(minutes * 60 * 1000)}
      />
    </div>
  );
}
