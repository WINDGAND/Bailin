import { useEffect, useRef } from "react";
import type { SpriteEvent } from "@nuwa-pet/character-protocol";
import type { AmbientSignal, ChatStreamChunk, ChatVisibilityEvent } from "../../shared/ipc-contract.js";
import { useNuwa } from "../shared/use-nuwa.js";

/**
 * 桌宠窗口统一订阅聊天流 / 对话可见性 / 环境信号，并转为 SpriteEvent。
 * 仅转发与当前激活角色匹配的事件。
 */
export function usePetSpriteEvents(
  characterId: string | undefined,
  sendSpriteEvent: (kind: SpriteEvent) => void
): void {
  const nuwa = useNuwa();
  const streamingRef = useRef(false);

  useEffect(() => {
    if (!characterId) return;
    return nuwa.on.chatStream((raw) => {
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
  }, [characterId, nuwa, sendSpriteEvent]);

  useEffect(() => {
    if (!characterId) return;
    return nuwa.on.chatVisibility((raw) => {
      const evt = raw as ChatVisibilityEvent;
      if (evt.characterId && evt.characterId !== characterId) return;
      sendSpriteEvent(evt.visible ? "chatOpen" : "chatClose");
    });
  }, [characterId, nuwa, sendSpriteEvent]);

  useEffect(() => {
    return nuwa.on.ambientSignal((raw) => {
      const signal = raw as AmbientSignal;
      if (signal.kind === "lock") {
        sendSpriteEvent("screenLock");
      } else if (signal.kind === "unlock" || signal.kind === "resume") {
        sendSpriteEvent("screenUnlock");
      }
    });
  }, [nuwa, sendSpriteEvent]);
}
