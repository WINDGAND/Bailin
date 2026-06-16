import { StreamCursor } from "./feedback.js";
import type { StreamPhase } from "./use-chat-session.js";

export interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  error?: { code?: string; message: string };
  streamingKind?: StreamPhase;
  compact?: boolean;
  onRetry?: () => void;
  onGoSettings?: () => void;
}

export function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const { role, content, error, streamingKind, compact = false, onRetry, onGoSettings } = props;
  const isUser = role === "user";

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
        margin: compact ? "5px 0" : "8px 0"
      }}
    >
      <div
        style={{
          maxWidth: compact ? "92%" : "86%",
          padding: compact ? "7px 10px" : "9px 13px",
          borderRadius: compact ? 12 : 13,
          background: isUser ? "var(--ink)" : "var(--paper-deep)",
          color: isUser ? "var(--paper)" : "var(--ink)",
          border: isUser ? "none" : "1px solid var(--grid)",
          fontSize: compact ? 13 : 14,
          lineHeight: compact ? 1.45 : 1.55,
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
