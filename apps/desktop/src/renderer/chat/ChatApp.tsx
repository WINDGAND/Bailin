import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { useActiveCharacter, useNuwa } from "../shared/use-nuwa.js";
import { PetRenderer } from "../shared/pet-renderer.js";
import { StreamCursor, useToast } from "../shared/feedback.js";

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: { code?: string; message: string };
}

type StreamPhase = "idle" | "thinking" | "streaming";

export function ChatApp(): JSX.Element {
  const nuwa = useNuwa();
  const { bundle } = useActiveCharacter();
  const { showToast } = useToast();

  const [sessionId, setSessionId] = useState<string>("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string>("");
  const [phase, setPhase] = useState<StreamPhase>("idle");
  const [input, setInput] = useState<string>("");
  const [lastError, setLastError] = useState<{ code?: string; message: string } | null>(null);

  const inFlightRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ===== 初始化会话 + 拉历史 =====
  useEffect(() => {
    if (!bundle) return;
    void (async () => {
      const r = await nuwa.chat.newSession(bundle.card.id);
      setSessionId(r.sessionId);
      const recent = await nuwa.chat.getRecent(bundle.card.id);
      setTurns(
        recent
          .filter((t) => t.role === "user" || t.role === "assistant")
          .map((t) => ({ id: t.id, role: t.role as "user" | "assistant", content: t.content }))
      );
    })();
  }, [bundle, nuwa]);

  // ===== 订阅流式回包 =====
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
        if (phase !== "streaming") setPhase("streaming");
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
  }, [nuwa, phase]);

  // ===== 自动滚到底部 =====
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending, phase]);

  // ===== 差异化建议（取自 card） =====
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!bundle) return [];
    const list: Suggestion[] = [];
    const firstMM = bundle.card.mentalModels[0];
    if (firstMM) {
      list.push({
        id: "mm",
        title: `用「${firstMM.name}」看一件事`,
        hint: firstMM.oneLiner.slice(0, 60),
        prompt: `用你的「${firstMM.name}」模型，帮我看看：`
      });
    }
    if (bundle.card.meta.quoteOneLiner) {
      list.push({
        id: "quote",
        title: "我想多聊聊你这句话",
        hint: bundle.card.meta.quoteOneLiner.slice(0, 70),
        prompt: `你说过：「${bundle.card.meta.quoteOneLiner}」我想多聊聊这句话背后的意思。`
      });
    }
    list.push({
      id: "stuck",
      title: "我现在卡在一件事上",
      hint: "把背景一句话讲完，等你拆它",
      prompt: "我现在卡在一件事上："
    });
    return list.slice(0, 3);
  }, [bundle]);

  // ===== 发送 =====
  const submit = useCallback(
    async (text: string) => {
      if (!bundle || !sessionId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setInput("");
      setLastError(null);
      const userTurn: Turn = {
        id: Math.random().toString(36).slice(2),
        role: "user",
        content: trimmed
      };
      setTurns((prev) => [...prev, userTurn]);
      setPhase("thinking");
      try {
        const res = await nuwa.chat.send({
          characterId: bundle.card.id,
          sessionId,
          content: trimmed
        });
        inFlightRef.current = res.requestId;
      } catch (e) {
        setPhase("idle");
        showToast({
          kind: "error",
          text: e instanceof Error ? e.message : "发送失败"
        });
      }
    },
    [bundle, sessionId, nuwa, showToast]
  );

  // ===== 中断流式 =====
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
    showToast({ kind: "info", text: "已中断这次回答" });
  }, [nuwa, showToast]);

  // ===== 新对话 =====
  const startNewSession = useCallback(async () => {
    if (!bundle) return;
    if (inFlightRef.current) await cancel();
    const r = await nuwa.chat.newSession(bundle.card.id);
    setSessionId(r.sessionId);
    setTurns([]);
    setPending("");
    setLastError(null);
    setPhase("idle");
    showToast({ kind: "success", text: "新对话已开始" });
    textareaRef.current?.focus();
  }, [bundle, nuwa, cancel, showToast]);

  // ===== 重试 =====
  const retryLastUser = useCallback(() => {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (lastUser) {
      // 去掉最后一条错误的 assistant turn
      setTurns((prev) => {
        const idx = [...prev].reverse().findIndex((t) => t.error);
        if (idx < 0) return prev;
        const realIdx = prev.length - 1 - idx;
        return prev.filter((_, i) => i !== realIdx);
      });
      setLastError(null);
      void submit(lastUser.content);
    }
  }, [turns, submit]);

  // ===== 全局键盘 =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void nuwa.chat.hide();
        return;
      }
      if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void startNewSession();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nuwa, startNewSession]);

  // ===== textarea 自动高度 + 快捷键 =====
  function onTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (inFlightRef.current) {
        void cancel();
      } else {
        void submit(input);
      }
      return;
    }
    if (e.key === "ArrowUp" && input.trim().length === 0) {
      const lastUser = [...turns].reverse().find((t) => t.role === "user");
      if (lastUser) {
        e.preventDefault();
        setInput(lastUser.content);
      }
    }
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 120);
    el.style.height = `${next}px`;
  }, [input]);

  const streaming = inFlightRef.current != null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        padding: 12,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div
        className="card"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: 0,
          background: "var(--paper)"
        }}
      >
        {/* Header */}
        <div
          style={
            {
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px 10px 16px",
              borderBottom: "1px solid var(--grid)",
              WebkitAppRegion: "drag",
              userSelect: "none"
            } as React.CSSProperties
          }
        >
          <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {bundle ? (
              <PetRenderer program={bundle.sprite} width={36} height={36} />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--paper-deep)"
                }}
              />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="display display--section"
              style={{
                fontSize: 15,
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {bundle?.card.meta.name ?? "未选择角色"}
            </div>
            <div className="mono" style={{ fontSize: 11, marginTop: 2 }}>
              {bundle?.card.meta.sourceName ?? ""}
            </div>
          </div>
          {bundle ? (
            <span
              className={`badge badge--${bundle.card.meta.track}`}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              {bundle.card.meta.track === "companion" ? "陪伴" : "实用"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void startNewSession()}
            className="btn btn--icon"
            data-hint="新对话 · Ctrl+L"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label="新对话"
          >
            ↻
          </button>
          <button
            type="button"
            onClick={() => void nuwa.chat.hide()}
            className="btn btn--icon"
            data-hint="关闭 · Esc"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          ref={listRef}
          style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}
        >
          {turns.length === 0 && !pending && phase === "idle" ? (
            <div className="stack fade-in-up" style={{ marginTop: 4 }}>
              <div className="eyebrow">不知道说什么？</div>
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  className="suggestion fade-in-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => void submit(s.prompt)}
                >
                  <span className="suggestion__title">{s.title}</span>
                  <span className="suggestion__hint">{s.hint}</span>
                </button>
              ))}
            </div>
          ) : null}

          {turns.map((t, i) => (
            <ChatBubble
              key={t.id}
              role={t.role}
              content={t.content}
              error={t.error}
              indexFromEnd={turns.length - 1 - i}
              onRetry={t.error ? retryLastUser : undefined}
              onGoSettings={
                t.error?.code === "AUTH_FAILED" || /401|auth|key/i.test(t.error?.message ?? "")
                  ? () => void nuwa.pet.openSettings()
                  : undefined
              }
            />
          ))}

          {phase !== "idle" ? (
            <ChatBubble role="assistant" content={pending} streamingKind={phase} />
          ) : null}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (streaming) void cancel();
            else void submit(input);
          }}
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid var(--grid)",
            background: "var(--paper-deep)",
            alignItems: "flex-end"
          }}
        >
          <textarea
            ref={textareaRef}
            className="textarea"
            placeholder={
              streaming
                ? "正在回答…（按 Enter 中断）"
                : "Enter 发送 · Shift+Enter 换行 · ↑ 找回上一条"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextareaKeyDown}
            rows={1}
            style={{
              minHeight: 38,
              maxHeight: 120,
              resize: "none",
              padding: "9px 12px",
              fontFamily: "var(--font-body)"
            }}
            autoFocus
          />
          {streaming ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void cancel()}
              data-hint="中断 · Enter"
              aria-label="中断"
              style={{ minWidth: 64 }}
            >
              ◼ 中断
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn--magenta"
              disabled={input.trim().length === 0}
              data-hint="发送 · Enter"
              aria-label="发送"
              style={{ minWidth: 64 }}
            >
              发送
            </button>
          )}
        </form>
      </div>

      {/* 持久错误提示条（次要） */}
      {lastError && !streaming ? (
        <div
          className="row gap-2 fade-in"
          style={{
            padding: "6px 12px",
            color: "var(--magenta)",
            fontSize: 12
          }}
        >
          <span>· 上次出错：{lastError.message}</span>
          <button className="btn btn--ghost btn--sm" onClick={retryLastUser}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}

// =============================================================
// ChatBubble
// =============================================================

interface Suggestion {
  id: string;
  title: string;
  hint: string;
  prompt: string;
}

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  error?: { code?: string; message: string };
  streamingKind?: StreamPhase;
  indexFromEnd?: number;
  onRetry?: () => void;
  onGoSettings?: () => void;
}

function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const { role, content, error, streamingKind, onRetry, onGoSettings } = props;
  const isUser = role === "user";

  if (error) {
    return (
      <div
        className="fade-in-up"
        style={{
          margin: "10px 0",
          padding: "10px 12px",
          background: "rgba(178, 24, 88, 0.06)",
          border: "1px solid var(--magenta-soft)",
          borderRadius: 12,
          color: "var(--ink)"
        }}
      >
        <div
          className="eyebrow"
          style={{ color: "var(--magenta)", marginBottom: 4 }}
        >
          出错了
        </div>
        <div className="body-md" style={{ color: "var(--ink-soft)", marginBottom: 8 }}>
          {error.message}
        </div>
        <div className="row gap-2">
          {onRetry ? (
            <button type="button" className="btn btn--magenta btn--sm" onClick={onRetry}>
              重试
            </button>
          ) : null}
          {onGoSettings ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onGoSettings}>
              去设置改 Key
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const isStreamingThinking = streamingKind === "thinking" && content.length === 0;
  const isStreamingDelta = streamingKind === "streaming";

  return (
    <div
      className="fade-in-up"
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        margin: "8px 0"
      }}
    >
      <div
        style={{
          maxWidth: "86%",
          padding: "9px 13px",
          borderRadius: 13,
          background: isUser ? "var(--ink)" : "var(--paper-deep)",
          color: isUser ? "var(--paper)" : "var(--ink)",
          border: isUser ? "none" : "1px solid var(--grid)",
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        }}
      >
        {content}
        {isStreamingThinking ? <StreamCursor kind="thinking" /> : null}
        {isStreamingDelta ? <StreamCursor kind="streaming" /> : null}
      </div>
    </div>
  );
}
