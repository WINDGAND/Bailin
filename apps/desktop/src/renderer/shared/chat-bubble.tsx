import { useCallback } from "react";
import { StreamCursor, useToast } from "./feedback.js";
import { formatChatTime } from "./format-chat-time.js";
import { ChatMarkdown } from "./chat-markdown.js";
import { useT, useI18n } from "./i18n/index.js";
import type { StreamPhase } from "./use-chat-session.js";
import { copyToClipboard } from "./copy-to-clipboard.js";

export interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  error?: { code?: string; message: string };
  streamingKind?: StreamPhase;
  compact?: boolean;
  interactive?: boolean;
  onRetry?: () => void;
  onGoSettings?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onQuote?: () => void;
  onRegenerate?: () => void;
}

export function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { showToast } = useToast();
  const {
    role,
    content,
    createdAt,
    error,
    streamingKind,
    compact = false,
    interactive = true,
    onRetry,
    onGoSettings,
    onCopy,
    onDelete,
    onEdit,
    onQuote,
    onRegenerate
  } = props;
  const isUser = role === "user";

  // 默认复制：调用 onCopy 由父组件统一处理 toast（ChatApp 已接 copyToClipboard）；
  // 未传 onCopy 时本地直接调 copyToClipboard 并显式 toast 失败。
  const handleCopy = useCallback(async () => {
    if (onCopy) {
      onCopy();
      return;
    }
    await copyToClipboard(content, {
      onSuccess: () => showToast({ kind: "info", text: t("feedback.toastCopiedShort") }),
      onFailure: () => showToast({ kind: "error", text: t("feedback.toastCopyFailed") })
    });
  }, [content, onCopy, showToast, t]);

  if (error) {
    return (
      <div
        className="fade-in-up"
        style={{
          margin: compact ? "6px 0" : "10px 0",
          padding: compact ? "8px 10px" : "10px 12px",
          background: "rgba(178, 24, 88, 0.06)",
          border: "1px solid var(--magenta-soft)",
          borderRadius: 12,
          color: "var(--ink)"
        }}
      >
        <div className="eyebrow" style={{ color: "var(--magenta)", marginBottom: 4 }}>
          {t("chat.bubbleErrorTitle")}
        </div>
        <div className="body-md" style={{ color: "var(--ink-soft)", marginBottom: 8 }}>
          {error.message}
        </div>
        <div className="row gap-2">
          {onRetry ? (
            <button type="button" className="btn btn--magenta btn--sm" onClick={onRetry}>
              {t("chat.retry")}
            </button>
          ) : null}
          {onGoSettings ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onGoSettings}>
              {t("chat.goSettingsKey")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const isStreamingThinking = streamingKind === "thinking" && content.length === 0;
  const isStreamingDelta = streamingKind === "streaming";
  const hasMetaBar = interactive && streamingKind == null && content.length > 0;

  const userActions = [
    { key: "delete", label: t("chat.actionDelete"), icon: <IconTrash />, onClick: onDelete },
    { key: "edit", label: t("chat.actionEdit"), icon: <IconEdit />, onClick: onEdit },
    { key: "copy", label: t("chat.actionCopy"), icon: <IconCopy />, onClick: () => void handleCopy() }
  ];

  const assistantActions = [
    { key: "copy", label: t("chat.actionCopy"), icon: <IconCopy />, onClick: () => void handleCopy() },
    { key: "quote", label: t("chat.actionQuote"), icon: <IconQuote />, onClick: onQuote },
    { key: "regen", label: t("chat.actionRegenerate"), icon: <IconRegenerate />, onClick: onRegenerate },
    { key: "delete", label: t("chat.actionDelete"), icon: <IconTrash />, onClick: onDelete }
  ];

  const actions = (isUser ? userActions : assistantActions).filter((a) => a.onClick);

  return (
    <div
      className={`chat-row ${isUser ? "chat-row--user" : "chat-row--assistant"}${
        hasMetaBar ? " chat-row--interactive" : ""
      }`}
    >
      <div className="chat-row__stack">
        {hasMetaBar ? (
          <div
            className={`chat-row__time chat-row__meta ${isUser ? "chat-row__time--user" : "chat-row__time--assistant"}`}
            aria-hidden={createdAt == null}
          >
            {createdAt != null ? formatChatTime(createdAt, locale) : "\u00a0"}
          </div>
        ) : null}

        <div
          className={`chat-bubble ${isUser ? "chat-bubble--user" : "chat-bubble--assistant"}${
            compact ? " chat-bubble--compact" : ""
          }`}
        >
          {isUser || !content ? (
            content
          ) : (
            <ChatMarkdown text={content} />
          )}
          {isStreamingThinking ? <StreamCursor kind="thinking" /> : null}
          {isStreamingDelta ? <StreamCursor kind="streaming" /> : null}
        </div>

        {hasMetaBar && actions.length > 0 ? (
          <div
            className={`chat-row__actions chat-row__meta ${isUser ? "chat-row__actions--user" : "chat-row__actions--assistant"}`}
          >
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                className="chat-row__action"
                onClick={(e) => {
                  e.stopPropagation();
                  a.onClick?.();
                }}
              >
                <span className="chat-row__action-icon" aria-hidden="true">
                  {a.icon}
                </span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IconCopy(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTrash(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}

function IconEdit(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function IconQuote(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M7.17 6A5 5 0 0 0 2 11v7h7v-7H6.5a3.5 3.5 0 0 1 3.67-3.5L7.17 6zm10 0A5 5 0 0 0 12 11v7h7v-7h-2.5a3.5 3.5 0 0 1 3.67-3.5L17.17 6z" />
    </svg>
  );
}

function IconRegenerate(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
