import { useCallback, useEffect, useRef, useState } from "react";
import { ulid } from "ulid";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import type { ChatTurn } from "../../shared/ipc-contract.js";
import { useNuwa } from "./use-nuwa.js";
import { useT } from "./i18n/index.js";

export interface UiTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
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
  switchSession(sessionId: string): Promise<void>;
  retryLastUser(): void;
  clearError(): void;
  deleteTurn(turnId: string): Promise<void>;
  deleteTurnsFrom(turnId: string): Promise<void>;
  regenerateAssistant(assistantTurnId: string): Promise<void>;
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
  const t = useT();
  const [sessionId, setSessionId] = useState("");
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [pending, setPending] = useState("");
  const [phase, setPhase] = useState<StreamPhase>("idle");
  const [lastError, setLastError] = useState<{ code?: string; message: string } | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const pendingAssistantTurnIdRef = useRef<string | null>(null);

  const loadSession = useCallback(
    async (targetSessionId: string) => {
      if (!bundle) return;
      const recent = await nuwa.chat.getRecent(bundle.card.id, targetSessionId);
      setSessionId(targetSessionId);
      setTurns(toUiTurns(recent).slice(-(options.historyLimit ?? 24)));
      setPending("");
      setLastError(null);
      setPhase("idle");
      inFlightRef.current = null;
      pendingAssistantTurnIdRef.current = null;
    },
    [bundle, nuwa, options.historyLimit]
  );

  useEffect(() => {
    if (!bundle) {
      setSessionId("");
      setTurns([]);
      setPending("");
      setPhase("idle");
      inFlightRef.current = null;
      pendingAssistantTurnIdRef.current = null;
      return;
    }
    void (async () => {
      const active = await nuwa.chat.getActiveSession(bundle.card.id);
      await loadSession(active.sessionId);
    })();
  }, [bundle?.card.id, nuwa, loadSession]);

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
            createdAt: Date.now(),
            error: errObj
          }
        ]);
        inFlightRef.current = null;
        pendingAssistantTurnIdRef.current = null;
        return;
      }
      if (chunk.delta) {
        setPhase("streaming");
        setPending((cur) => cur + chunk.delta);
      }
      if (chunk.done) {
        const assistantId =
          chunk.assistantTurnId ?? pendingAssistantTurnIdRef.current ?? chunk.requestId + "-done";
        setPending((cur) => {
          if (cur.length > 0) {
            setTurns((prev) => [
              ...prev,
              {
                id: assistantId,
                role: "assistant",
                content: cur,
                createdAt: Date.now()
              }
            ]);
          }
          return "";
        });
        setPhase("idle");
        inFlightRef.current = null;
        pendingAssistantTurnIdRef.current = null;
      }
    });
  }, [nuwa]);

  const sendInternal = useCallback(
    async (text: string, opts?: { skipUserAppend?: boolean }) => {
      if (!bundle || !sessionId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setLastError(null);

      const userTurnId = ulid();
      if (!opts?.skipUserAppend) {
        setTurns((prev) => [
          ...prev,
          {
            id: userTurnId,
            role: "user",
            content: trimmed,
            createdAt: Date.now()
          }
        ]);
      }

      setPhase("thinking");
      try {
        const res = await nuwa.chat.send({
          characterId: bundle.card.id,
          sessionId,
          content: trimmed,
          surface: options.surface,
          userTurnId,
          skipUserAppend: opts?.skipUserAppend
        });
        inFlightRef.current = res.requestId;
        pendingAssistantTurnIdRef.current = res.assistantTurnId;
      } catch (e) {
        setPhase("idle");
        const message = e instanceof Error ? e.message : t("chat.sessionSendFailed");
        options.onError?.(message);
      }
    },
    [bundle, sessionId, nuwa, options.surface, options.onError, t]
  );

  const submit = useCallback(async (text: string) => sendInternal(text), [sendInternal]);

  const cancel = useCallback(async () => {
    if (inFlightRef.current == null) return;
    const id = inFlightRef.current;
    inFlightRef.current = null;
    pendingAssistantTurnIdRef.current = null;
    await nuwa.chat.cancel(id);
    setPending((cur) => {
      if (cur.length > 0) {
        setTurns((prev) => [
          ...prev,
          { id: id + "-cancel", role: "assistant", content: cur + " ⏹", createdAt: Date.now() }
        ]);
      }
      return "";
    });
    setPhase("idle");
    options.onInfo?.(t("chat.sessionCancelled"));
  }, [nuwa, options.onInfo, t]);

  const startNewSession = useCallback(async () => {
    if (!bundle) return;
    if (inFlightRef.current) await cancel();
    const r = await nuwa.chat.newSession(bundle.card.id);
    await loadSession(r.sessionId);
    options.onInfo?.(t("chat.sessionNewStarted"));
  }, [bundle, nuwa, cancel, loadSession, options.onInfo, t]);

  const switchSession = useCallback(
    async (targetSessionId: string) => {
      if (!bundle || targetSessionId === sessionId) return;
      if (inFlightRef.current) await cancel();
      const res = await nuwa.chat.switchSession({
        characterId: bundle.card.id,
        sessionId: targetSessionId
      });
      if (!res.ok) {
        options.onError?.(t("chat.sessionSwitchFailed"));
        return;
      }
      await loadSession(targetSessionId);
    },
    [bundle, sessionId, nuwa, cancel, loadSession, options.onError, t]
  );

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

  const deleteTurn = useCallback(
    async (turnId: string) => {
      if (!bundle || !sessionId) return;
      try {
        const res = await nuwa.chat.deleteTurn({
          characterId: bundle.card.id,
          sessionId,
          turnId
        });
        if (!res.ok) {
          options.onError?.(t("chat.sessionDeleteNotFound"));
          return;
        }
        setTurns((prev) => prev.filter((t) => t.id !== turnId));
        options.onInfo?.(t("chat.sessionDeleted"));
      } catch (e) {
        options.onError?.(e instanceof Error ? e.message : t("chat.sessionDeleteFailed"));
      }
    },
    [bundle, sessionId, nuwa, options.onInfo, options.onError, t]
  );

  const deleteTurnsFrom = useCallback(
    async (turnId: string) => {
      if (!bundle || !sessionId) return;
      try {
        const res = await nuwa.chat.deleteTurnsFrom({
          characterId: bundle.card.id,
          sessionId,
          turnId
        });
        if (!res.ok) {
          options.onError?.(t("chat.sessionDeleteNotFound"));
          return;
        }
        setTurns((prev) => {
          const idx = prev.findIndex((t) => t.id === turnId);
          if (idx < 0) return prev;
          return prev.slice(0, idx);
        });
        options.onInfo?.(t("chat.sessionDeleted"));
      } catch (e) {
        options.onError?.(e instanceof Error ? e.message : t("chat.sessionDeleteFailed"));
      }
    },
    [bundle, sessionId, nuwa, options.onInfo, options.onError, t]
  );

  const regenerateAssistant = useCallback(
    async (assistantTurnId: string) => {
      if (!bundle || !sessionId) return;
      if (inFlightRef.current) await cancel();

      const idx = turns.findIndex((t) => t.id === assistantTurnId);
      if (idx < 0) return;
      let userContent = "";
      for (let i = idx - 1; i >= 0; i--) {
        const prior = turns[i];
        if (prior?.role === "user") {
          userContent = prior.content;
          break;
        }
      }
      if (!userContent) return;

      try {
        const res = await nuwa.chat.deleteTurn({
          characterId: bundle.card.id,
          sessionId,
          turnId: assistantTurnId
        });
        if (!res.ok) {
          options.onError?.(t("chat.sessionRegenerateNotFound"));
          return;
        }
        setTurns((prev) => prev.filter((t) => t.id !== assistantTurnId));
        await sendInternal(userContent, { skipUserAppend: true });
        options.onInfo?.(t("chat.sessionRegenerating"));
      } catch (e) {
        options.onError?.(e instanceof Error ? e.message : t("chat.sessionRegenerateFailed"));
      }
    },
    [bundle, sessionId, turns, nuwa, cancel, sendInternal, options.onInfo, options.onError, t]
  );

  return {
    sessionId,
    turns,
    pending,
    phase,
    lastError,
    streaming: phase !== "idle",
    submit,
    cancel,
    startNewSession,
    switchSession,
    retryLastUser,
    clearError: () => setLastError(null),
    deleteTurn,
    deleteTurnsFrom,
    regenerateAssistant
  };
}

function toUiTurns(turns: ChatTurn[]): UiTurn[] {
  return turns
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => ({
      id: t.id,
      role: t.role as "user" | "assistant",
      content: t.content,
      createdAt: t.createdAt
    }));
}
