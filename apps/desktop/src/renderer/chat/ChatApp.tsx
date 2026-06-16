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
import { useToast } from "../shared/feedback.js";
import { ChatBubble } from "../shared/chat-bubble.js";
import { useChatSession } from "../shared/use-chat-session.js";

export function ChatApp(): JSX.Element {
  const nuwa = useNuwa();
  const { bundle } = useActiveCharacter();
  const { showToast } = useToast();

  const [input, setInput] = useState<string>("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chat = useChatSession(bundle, {
    surface: "chat",
    onInfo: (text) => showToast({ kind: "info", text }),
    onError: (text) => showToast({ kind: "error", text })
  });

  // ===== 自动滚到底部 =====
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.turns, chat.pending, chat.phase]);

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
      setInput("");
      await chat.submit(text);
    },
    [chat]
  );

  // ===== 新对话 =====
  const startNewSession = useCallback(async () => {
    await chat.startNewSession();
    textareaRef.current?.focus();
  }, [chat]);

  // ===== 重试 =====
  const retryLastUser = useCallback(() => {
    chat.retryLastUser();
  }, [chat]);

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
      if (chat.streaming) {
        void chat.cancel();
      } else {
        void submit(input);
      }
      return;
    }
    if (e.key === "ArrowUp" && input.trim().length === 0) {
      const lastUser = [...chat.turns].reverse().find((t) => t.role === "user");
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

  const streaming = chat.streaming;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div className="chat-panel">
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
              userSelect: "none",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16
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
          {chat.turns.length === 0 && !chat.pending && chat.phase === "idle" ? (
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

          {chat.turns.map((t) => (
            <ChatBubble
              key={t.id}
              role={t.role}
              content={t.content}
              error={t.error}
              onRetry={t.error ? retryLastUser : undefined}
              onGoSettings={
                t.error?.code === "AUTH_FAILED" || /401|auth|key/i.test(t.error?.message ?? "")
                  ? () => void nuwa.pet.openSettings()
                  : undefined
              }
            />
          ))}

          {chat.phase !== "idle" ? (
            <ChatBubble role="assistant" content={chat.pending} streamingKind={chat.phase} />
          ) : null}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (streaming) void chat.cancel();
            else void submit(input);
          }}
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid var(--grid)",
            background: "var(--paper-deep)",
            alignItems: "flex-end",
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16
          }}
        >
          <textarea
            ref={textareaRef}
            className="textarea"
            placeholder={
              streaming
                ? "正在回答…（按 Enter 中断）"
                : `想跟${bundle?.card.meta.name ?? "TA"}说点什么？`
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
              onClick={() => void chat.cancel()}
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
      {chat.lastError && !streaming ? (
        <div
          className="row gap-2 fade-in"
          style={{
            padding: "6px 12px",
            color: "var(--magenta)",
            fontSize: 12
          }}
        >
          <span>· 上次出错：{chat.lastError.message}</span>
          <button className="btn btn--ghost btn--sm" onClick={retryLastUser}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface Suggestion {
  id: string;
  title: string;
  hint: string;
  prompt: string;
}
