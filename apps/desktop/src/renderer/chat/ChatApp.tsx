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
import { useChatScroll } from "../shared/use-chat-scroll.js";
import { ChatResizeHandles } from "./ChatResizeHandles.js";
import { ChatHistoryPanel } from "./ChatHistoryPanel.js";

export function ChatApp(): JSX.Element {
  const nuwa = useNuwa();
  const { bundle } = useActiveCharacter();
  const { showToast } = useToast();

  const [input, setInput] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chat = useChatSession(bundle, {
    surface: "chat",
    onInfo: (text) => showToast({ kind: "info", text }),
    onError: (text) => showToast({ kind: "error", text })
  });
  const { showScrollDown, scrollToLatest, forceScrollOnNextUpdate } = useChatScroll(listRef, {
    turnsLength: chat.turns.length,
    pending: chat.pending,
    phase: chat.phase
  });

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
      forceScrollOnNextUpdate();
      setInput("");
      await chat.submit(text);
    },
    [chat, forceScrollOnNextUpdate]
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
        if (historyOpen) {
          setHistoryOpen(false);
          return;
        }
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
  }, [nuwa, startNewSession, historyOpen]);

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

  const CHAT_INPUT_MAX_HEIGHT = 120;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, CHAT_INPUT_MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > CHAT_INPUT_MAX_HEIGHT ? "auto" : "hidden";
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
      <ChatResizeHandles />
      <div className="chat-panel">
        {/* Header */}
        <div className="chat-panel__header">
          <div className="chat-panel__avatar" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {bundle ? (
              <PetRenderer program={bundle.sprite} width={36} height={36} />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
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
            onClick={() => setHistoryOpen(true)}
            className="btn btn--icon"
            data-hint="历史对话"
            data-hint-placement="bottom"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label="历史对话"
            disabled={!bundle}
          >
            <HistoryIcon />
          </button>
          <button
            type="button"
            onClick={() => void startNewSession()}
            className="btn btn--icon"
            data-hint="新对话 · Ctrl+L"
            data-hint-placement="bottom"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label="新对话"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            onClick={() => void nuwa.chat.hide()}
            className="btn btn--icon"
            data-hint="关闭 · Esc"
            data-hint-placement="bottom"
            data-hint-align="end"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label="关闭"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="chat-panel__body-wrap">
          <div ref={listRef} className="chat-panel__body">
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
              createdAt={t.createdAt}
              error={t.error}
              onRetry={t.error ? retryLastUser : undefined}
              onGoSettings={
                t.error?.code === "AUTH_FAILED" || /401|auth|key/i.test(t.error?.message ?? "")
                  ? () => void nuwa.pet.openSettings()
                  : undefined
              }
              onCopy={() => {
                void navigator.clipboard.writeText(t.content).then(() => {
                  showToast({ kind: "info", text: "已复制" });
                });
              }}
              onDelete={() => {
                if (t.role === "user") {
                  void chat.deleteTurnsFrom(t.id);
                } else {
                  void chat.deleteTurn(t.id);
                }
              }}
              onEdit={
                t.role === "user"
                  ? () => {
                      setInput(t.content);
                      void chat.deleteTurnsFrom(t.id);
                      textareaRef.current?.focus();
                    }
                  : undefined
              }
              onQuote={
                t.role === "assistant"
                  ? () => {
                      const quoted = t.content
                        .split("\n")
                        .map((line) => `> ${line}`)
                        .join("\n");
                      setInput((cur) => (cur.trim() ? `${cur}\n\n${quoted}\n\n` : `${quoted}\n\n`));
                      textareaRef.current?.focus();
                    }
                  : undefined
              }
              onRegenerate={
                t.role === "assistant" ? () => void chat.regenerateAssistant(t.id) : undefined
              }
            />
          ))}

          {chat.phase !== "idle" ? (
            <ChatBubble
              role="assistant"
              content={chat.pending}
              streamingKind={chat.phase}
              interactive={false}
            />
          ) : null}
          </div>
          {showScrollDown ? (
            <button
              type="button"
              className="chat-scroll-down fade-in"
              onClick={scrollToLatest}
              aria-label="回到底部"
            >
              <ChevronDownIcon />
            </button>
          ) : null}
        </div>

        {/* Input */}
        <form
          className="chat-panel__footer"
          onSubmit={(e) => {
            e.preventDefault();
            if (streaming) void chat.cancel();
            else void submit(input);
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
            autoFocus
          />
          {streaming ? (
            <button
              type="button"
              className="btn btn--danger btn--cancel"
              onClick={() => void chat.cancel()}
              data-hint="中断 · Enter"
              aria-label="中断"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn--magenta btn--send"
              disabled={input.trim().length === 0}
              data-hint="发送 · Enter"
              aria-label="发送"
            >
              <SendIcon />
            </button>
          )}
        </form>

        {bundle && historyOpen ? (
          <ChatHistoryPanel
            open={historyOpen}
            characterId={bundle.card.id}
            activeSessionId={chat.sessionId}
            onClose={() => setHistoryOpen(false)}
            onSwitch={(sessionId) => {
              forceScrollOnNextUpdate();
              void chat.switchSession(sessionId);
            }}
            onNewSession={() => void startNewSession()}
            onInfo={(text) => showToast({ kind: "info", text })}
            onError={(text) => showToast({ kind: "error", text })}
          />
        ) : null}
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

function CloseIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HistoryIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M3 12h12M3 18h8" />
      <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SendIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9l20-7Z" />
    </svg>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}
