import { useEffect, useRef } from "react";
import type { SpriteEvent } from "@bailin/character-protocol";
import type {
  AmbientSignal,
  ChatStreamChunk,
  ChatVisibilityEvent,
  ProactiveWhisperEvent
} from "../../shared/ipc-contract.js";
import { useBailin } from "../shared/use-bailin.js";

/**
 * 桌宠窗口统一订阅聊天流 / 对话可见性 / 环境信号，并转为 SpriteEvent。
 * 仅转发与当前激活角色匹配的事件。
 */
export function usePetSpriteEvents(
  characterId: string | undefined,
  sendSpriteEvent: (kind: SpriteEvent) => void
): void {
  const bailin = useBailin();
  const streamingRef = useRef(false);

  useEffect(() => {
    if (!characterId) return;
    return bailin.on.chatStream((raw) => {
      const chunk = raw as ChatStreamChunk;
      if (chunk.characterId && chunk.characterId !== characterId) return;

      if (chunk.phase === "thinking") {
        streamingRef.current = false;
        sendSpriteEvent("responseStart");
        return;
      }

      if (chunk.cancelled || (chunk.done && chunk.error)) {
        streamingRef.current = false;
        sendSpriteEvent("chatError");
        return;
      }

      if (!chunk.done && chunk.delta) {
        if (!streamingRef.current) {
          streamingRef.current = true;
          sendSpriteEvent("responseStreaming");
        }
        return;
      }

      if (chunk.done && !chunk.error) {
        streamingRef.current = false;
        sendSpriteEvent("responseEnd");
      }
    });
  }, [characterId, bailin, sendSpriteEvent]);

  useEffect(() => {
    if (!characterId) return;
    return bailin.on.chatVisibility((raw) => {
      const evt = raw as ChatVisibilityEvent;
      if (evt.characterId && evt.characterId !== characterId) return;
      sendSpriteEvent(evt.visible ? "chatOpen" : "chatClose");
    });
  }, [characterId, bailin, sendSpriteEvent]);

  useEffect(() => {
    return bailin.on.ambientSignal((raw) => {
      const signal = raw as AmbientSignal;
      if (signal.kind === "lock") {
        sendSpriteEvent("screenLock");
      } else if (signal.kind === "unlock" || signal.kind === "resume") {
        sendSpriteEvent("screenUnlock");
      }
    });
  }, [bailin, sendSpriteEvent]);

  // 主动耳语联动：气泡出现 = 宠物开口；气泡自动消失后若聊天窗没开，收回 idle。
  useEffect(() => {
    if (!characterId) return;
    let timer: number | null = null;
    const off = bailin.on.proactiveWhisper((raw) => {
      const evt = raw as ProactiveWhisperEvent;
      if (evt.characterId && evt.characterId !== characterId) return;
      if (timer !== null) window.clearTimeout(timer);
      sendSpriteEvent("chatOpen");
      // 5200ms = 气泡 AUTO_DISMISS 4500 + 余量
      timer = window.setTimeout(() => {
        timer = null;
        void bailin.chat
          .isVisible()
          .then((visible) => {
            if (!visible) sendSpriteEvent("chatClose");
          })
          .catch(() => sendSpriteEvent("chatClose"));
      }, 5200);
    });
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      off();
    };
  }, [characterId, bailin, sendSpriteEvent]);
}
