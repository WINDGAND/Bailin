/**
 * 聊天会话 React Hook：把主进程 chat IPC 接到气泡与独立聊天窗。
 *
 * 按 `bundle.card.id` 加载当前会话，订阅 `chatStream` 拼流式正文。
 * 超过 `STALL_TIMEOUT_MS` 无完成则取消请求并记 TIMEOUT。
 * `regenerateAssistant` 会先删助手回合，再以 `skipUserAppend` 重发上一条用户内容，
 * 避免列表里出现重复用户气泡。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ulid } from "ulid";
import type { CharacterBundle } from "@bailin/character-protocol";
import type { ChatTurn } from "../../shared/ipc-contract.js";
import { useBailin } from "./use-bailin.js";
import { useT } from "./i18n/index.js";

/** 渲染层回合；`error` 仅出现在失败 / 超时的助手气泡上。 */
export interface UiTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  error?: { code?: string; message: string };
}

/** 发送生命周期：空闲、等首 token、正在拼 delta。 */
export type StreamPhase = "idle" | "thinking" | "streaming";
/** 气泡菜单短聊 vs 独立聊天窗；传给 `chat.send` 的 surface。 */
export type ChatSurface = "bubble" | "chat";

/** Hook 对外状态与操作；`streaming` 是 `phase !== "idle"` 的便捷别名。 */
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

/** 流式卡住判定：thinking / streaming 持续这么久仍未 idle 则取消并报 TIMEOUT。 */
const STALL_TIMEOUT_MS = 100_000;

/**
 * 绑定某个角色包的聊天会话。
 * @param bundle 当前角色；为 null 时清空本地状态且不发 IPC。
 * @param options.surface 气泡或独立窗，影响主进程记录来源。
 * @param options.historyLimit 载入最近回合条数，默认 24。
 * @param options.onInfo / onError 可选 toast 回调，取消、超时、失败时触发。
 * @returns 会话状态与 submit / cancel / 删改重试等方法。
 * 副作用：订阅 `chatStream`、按角色切换加载活动会话、超时会调用 `chat.cancel`。
 */
export function useChatSession(
  bundle: CharacterBundle | null,
  options: {
    surface: ChatSurface;
    historyLimit?: number;
    onInfo?: (text: string) => void;
    onError?: (text: string) => void;
  }
): ChatSessionState {
  const bailin = useBailin();
  const t = useT();
  const [sessionId, setSessionId] = useState("");
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [pending, setPending] = useState("");
  const [phase, setPhase] = useState<StreamPhase>("idle");
  const [lastError, setLastError] = useState<{ code?: string; message: string } | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const pendingAssistantTurnIdRef = useRef<string | null>(null);
  const phaseRef = useRef<StreamPhase>("idle");
  phaseRef.current = phase;

  const loadSession = useCallback(
    async (targetSessionId: string) => {
      if (!bundle) return;
      const recent = await bailin.chat.getRecent(bundle.card.id, targetSessionId);
      setSessionId(targetSessionId);
      setTurns(toUiTurns(recent).slice(-(options.historyLimit ?? 24)));
      setPending("");
      setLastError(null);
      setPhase("idle");
      inFlightRef.current = null;
      pendingAssistantTurnIdRef.current = null;
    },
    [bundle, bailin, options.historyLimit]
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
      const active = await bailin.chat.getActiveSession(bundle.card.id);
      await loadSession(active.sessionId);
    })();
  }, [bundle?.card.id, bailin, loadSession]);

  useEffect(() => {
    return bailin.on.chatStream((chunk) => {
      // 只接受当前 in-flight 请求的 chunk，避免切换会话后旧流写进新列表。
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
  }, [bailin]);

  useEffect(() => {
    if (phase === "idle") return;
    const timer = window.setTimeout(() => {
      if (phaseRef.current === "idle") return;
      const requestId = inFlightRef.current;
      void (async () => {
        if (requestId) await bailin.chat.cancel(requestId);
        setPending("");
        setPhase("idle");
        const errObj = { code: "TIMEOUT", message: t("chat.sessionTimeout") };
        setLastError(errObj);
        if (requestId) {
          setTurns((prev) => [
            ...prev,
            {
              id: requestId + "-timeout",
              role: "assistant",
              content: "",
              createdAt: Date.now(),
              error: errObj
            }
          ]);
        }
        inFlightRef.current = null;
        pendingAssistantTurnIdRef.current = null;
        options.onError?.(errObj.message);
      })();
    }, STALL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, bailin, t, options.onError]);

  const sendInternal = useCallback(
    async (text: string, opts?: { skipUserAppend?: boolean }) => {
      if (!bundle || !sessionId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setLastError(null);

      const userTurnId = ulid();
      // regenerate 路径已有用户气泡，跳过再插一条，避免重复。
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
        const res = await bailin.chat.send({
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
    [bundle, sessionId, bailin, options.surface, options.onError, t]
  );

  const submit = useCallback(async (text: string) => sendInternal(text), [sendInternal]);

  const cancel = useCallback(async () => {
    if (inFlightRef.current == null) return;
    const id = inFlightRef.current;
    inFlightRef.current = null;
    pendingAssistantTurnIdRef.current = null;
    await bailin.chat.cancel(id);
    setPending((cur) => {
      if (cur.length > 0) {
        // 已流出的半截正文保留为一条助手消息，并以 ⏹ 标记用户主动取消。
        setTurns((prev) => [
          ...prev,
          { id: id + "-cancel", role: "assistant", content: cur + " ⏹", createdAt: Date.now() }
        ]);
      }
      return "";
    });
    setPhase("idle");
    options.onInfo?.(t("chat.sessionCancelled"));
  }, [bailin, options.onInfo, t]);

  const startNewSession = useCallback(async () => {
    if (!bundle) return;
    if (inFlightRef.current) await cancel();
    const r = await bailin.chat.newSession(bundle.card.id);
    await loadSession(r.sessionId);
    options.onInfo?.(t("chat.sessionNewStarted"));
  }, [bundle, bailin, cancel, loadSession, options.onInfo, t]);

  const switchSession = useCallback(
    async (targetSessionId: string) => {
      if (!bundle || targetSessionId === sessionId) return;
      if (inFlightRef.current) await cancel();
      const res = await bailin.chat.switchSession({
        characterId: bundle.card.id,
        sessionId: targetSessionId
      });
      if (!res.ok) {
        options.onError?.(t("chat.sessionSwitchFailed"));
        return;
      }
      await loadSession(targetSessionId);
    },
    [bundle, sessionId, bailin, cancel, loadSession, options.onError, t]
  );

  const retryLastUser = useCallback(() => {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser) return;
    setTurns((prev) => {
      // 只丢掉最近一条带 error 的助手气泡，再原样重发最后一条用户内容。
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
        const res = await bailin.chat.deleteTurn({
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
    [bundle, sessionId, bailin, options.onInfo, options.onError, t]
  );

  const deleteTurnsFrom = useCallback(
    async (turnId: string) => {
      if (!bundle || !sessionId) return;
      try {
        const res = await bailin.chat.deleteTurnsFrom({
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
    [bundle, sessionId, bailin, options.onInfo, options.onError, t]
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
        const res = await bailin.chat.deleteTurn({
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
    [bundle, sessionId, turns, bailin, cancel, sendInternal, options.onInfo, options.onError, t]
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

/** 持久化回合转 UI；系统 / 工具角色丢弃。无副作用。 */
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
