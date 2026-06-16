import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import type { ChatTurn } from "../../shared/ipc-contract.js";
import { useNuwa } from "./use-nuwa.js";

export interface UiTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: { code?: string; message: string };
}

export type StreamPhase = "idle" | "thinking" | "streaming";
export type ChatSurface = "bubble" | "chat";

export interface ChatSessionState {
  sessionId: string;
  turns: UiTurn[];
  pending: string;
  phase: StreamPhase;
  lastError: { code?: string; message: string } | null;
  streaming: boolean;
  submit(text: string): Promise<void>;
  cancel(): Promise<void>;
  startNewSession(): Promise<void>;
  retryLastUser(): void;
  clearError(): void;
}

export function useChatSession(
  bundle: CharacterBundle | null,
  options: {
    surface: ChatSurface;
    historyLimit?: number;
    onInfo?: (text: string) => void;
    onError?: (text: string) => void;
  }
): ChatSessionState {
  const nuwa = useNuwa();
  const [sessionId, setSessionId] = useState("");
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [pending, setPending] = useState("");
  const [phase, setPhase] = useState<StreamPhase>("idle");
  const [lastError, setLastError] = useState<{ code?: string; message: string } | null>(null);
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bundle) {
      setSessionId("");
      setTurns([]);
      setPending("");
      setPhase("idle");
      inFlightRef.current = null;
      return;
    }
    void (async () => {
      const r = await nuwa.chat.newSession(bundle.card.id);
      setSessionId(r.sessionId);
      const recent = await nuwa.chat.getRecent(bundle.card.id);
      setTurns(toUiTurns(recent).slice(-(options.historyLimit ?? 24)));
      setPending("");
      setLastError(null);
      setPhase("idle");
      inFlightRef.current = null;
    })();
  }, [bundle?.card.id, nuwa, options.historyLimit]);

  useEffect(() => {
    return nuwa.on.chatStream((chunk) => {
      if (chunk.requestId !== inFlightRef.current) return;
      if (chunk.error) {
        setPending("");
        setPhase("idle");
        const errObj = { code: chunk.finishReason, message: chunk.error };
        setLastError(errObj);
        setTurns((prev) => [
          ...prev,
          {
            id: chunk.requestId + "-err",
            role: "assistant",
            content: "",
            error: errObj
          }
        ]);
        inFlightRef.current = null;
        return;
      }
      if (chunk.delta) {
        setPhase("streaming");
        setPending((cur) => cur + chunk.delta);
      }
      if (chunk.done) {
        setPending((cur) => {
          if (cur.length > 0) {
            setTurns((prev) => [
              ...prev,
              { id: chunk.requestId + "-done", role: "assistant", content: cur }
            ]);
          }
          return "";
        });
        setPhase("idle");
        inFlightRef.current = null;
      }
    });
  }, [nuwa]);

  const submit = useCallback(
    async (text: string) => {
      if (!bundle || !sessionId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setLastError(null);
      setTurns((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          role: "user",
          content: trimmed
        }
      ]);
      setPhase("thinking");
      try {
        const res = await nuwa.chat.send({
          characterId: bundle.card.id,
          sessionId,
          content: trimmed,
          surface: options.surface
        });
        inFlightRef.current = res.requestId;
      } catch (e) {
        setPhase("idle");
        const message = e instanceof Error ? e.message : "发送失败";
        options.onError?.(message);
      }
    },
    [bundle, sessionId, nuwa, options.surface, options.onError]
  );

  const cancel = useCallback(async () => {
    if (inFlightRef.current == null) return;
    const id = inFlightRef.current;
    inFlightRef.current = null;
    await nuwa.chat.cancel(id);
    setPending((cur) => {
      if (cur.length > 0) {
        setTurns((prev) => [
          ...prev,
          { id: id + "-cancel", role: "assistant", content: cur + " ⏹" }
        ]);
      }
      return "";
    });
    setPhase("idle");
    options.onInfo?.("已中断这次回答");
  }, [nuwa, options.onInfo]);

  const startNewSession = useCallback(async () => {
    if (!bundle) return;
    if (inFlightRef.current) await cancel();
    const r = await nuwa.chat.newSession(bundle.card.id);
    setSessionId(r.sessionId);
    setTurns([]);
    setPending("");
    setLastError(null);
    setPhase("idle");
    options.onInfo?.("新对话已开始");
  }, [bundle, nuwa, cancel, options.onInfo]);

  const retryLastUser = useCallback(() => {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser) return;
    setTurns((prev) => {
      const idx = [...prev].reverse().findIndex((t) => t.error);
      if (idx < 0) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== realIdx);
    });
    setLastError(null);
    void submit(lastUser.content);
  }, [turns, submit]);

  return {
    sessionId,
    turns,
    pending,
    phase,
    lastError,
    streaming: inFlightRef.current != null,
    submit,
    cancel,
    startNewSession,
    retryLastUser,
    clearError: () => setLastError(null)
  };
}

function toUiTurns(turns: ChatTurn[]): UiTurn[] {
  return turns
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => ({ id: t.id, role: t.role as "user" | "assistant", content: t.content }));
}
