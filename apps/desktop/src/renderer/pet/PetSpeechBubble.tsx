import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { ChatBubble } from "../shared/chat-bubble.js";
import type { ChatSessionState, UiTurn } from "../shared/use-chat-session.js";
import type { BubbleMode } from "../../shared/ipc-contract.js";

export type BubbleDirection = "TL" | "TR" | "BL" | "BR" | "L" | "R";

/** 桌宠"现在说的这一句"——只渲染这一段，不堆历史。 */
export interface LatestSay {
  /** 唯一 id，用来区分内容刷新；whisper 用 evt.id，chat 流用 turn id 或 "pending"。 */
  id: string;
  text: string;
  /** whisper 来源：影响 greeting 模式的自动隐藏时长。 */
  source: "whisper" | "chat";
}

interface PetSpeechBubbleProps {
  bundle: CharacterBundle;
  chat: ChatSessionState;
  /** 桌宠"现在说的这一句"——只渲染这一段，不堆历史。 */
  latest: LatestSay | null;
  /** SegmentBuffer 里队列里还有多少段未播。>0 时显示"还有 N 段"角标。 */
  pendingCount: number;
  /** expanded 模式下展示的最近上下文（最多 5 轮）。 */
  recentTurns: UiTurn[];
  mode: BubbleMode;
  direction: BubbleDirection;
  /**
   * 正在 morph 到 ChatWindow：触发"放大消散"动画。
   * BubbleApp 在动画 ~160ms 时切窗，让 ChatWindow 接续淡入 → 视觉上"气泡膨胀成聊天窗"。
   */
  morphing: boolean;
  /** greeting → talking 升级（点气泡主体或再点桌宠）。 */
  onAdvanceToTalking: () => void;
  /** talking ↔ expanded 切换。 */
  onToggleExpand: () => void;
  /**
   * 点正文区时调；返回值告诉 shell 要不要继续走 mode 切换：
   *   - "advanced-segment"：buffer 跳到下一段了，点击已被吞掉，shell 不再切换；
   *   - "default"：buffer 没有动作，shell 按原逻辑切 mode。
   */
  onTapSaying: () => "advanced-segment" | "default";
  /** 收起气泡（×、Esc）。 */
  onClose: () => void;
  /** 打开完整 ChatWindow（右上角"展开 ↗"）。 */
  onOpenChat: () => void;
}

// 与 main/windows/bubble-window.ts 的 BUBBLE_LAYOUT 对应。
const OUTER_PADDING = 18;
const BUBBLE_WIDTH = 340;
const TAIL_LENGTH = 12;
const TAIL_EDGE_OFFSET = 30;
/**
 * Saying 区高度上限（约 3 行 14px lineHeight 1.5 + padding）。
 *
 * 单段 segment 永远 ≤ 30 字（见 segment-buffer.ts），3 行能稳稳放下；
 * 加这个上限是为了**显式声明气泡的形状语言**：
 *   "这是一句话气泡，不是滚动 feed"。
 * 内容超长 → 走 SegmentBuffer 分段轮播；用户想看全的 → 点 ↗ 进 ChatWindow。
 */
const SAYING_MAX_HEIGHT = 86;

// ===== 纯白派视觉 token（与原 var(--paper) / var(--ink) 解耦，强调"桌宠在桌面上的便签感") =====
const BUBBLE_BG = "#FFFFFF";
const BUBBLE_BORDER = "rgba(15, 23, 23, 0.10)";
const BUBBLE_BORDER_SOFT = "rgba(15, 23, 23, 0.06)";
const BUBBLE_INK = "#1B2222";
const BUBBLE_INK_FAINT = "rgba(27, 34, 34, 0.55)";
const BUBBLE_FOOTER_BG = "#FAFAF7";
const BUBBLE_PRIMARY = "#1F3A3A";

const FALLBACK_GREETING = "怎么啦？";

export function PetSpeechBubble(props: PetSpeechBubbleProps): JSX.Element {
  const {
    bundle,
    chat,
    latest,
    pendingCount,
    recentTurns,
    mode,
    direction,
    morphing,
    onAdvanceToTalking,
    onToggleExpand,
    onTapSaying,
    onClose,
    onOpenChat
  } = props;

  // 桌宠"现在说的这一句"——空时给一个 fallback，免得气泡空着。
  const sayText = useMemo(() => {
    const text = latest?.text?.trim();
    if (text) return text;
    if (chat.phase !== "idle") return ""; // 流式中：让 ChatBubble streamingKind 显示动画
    return FALLBACK_GREETING;
  }, [latest, chat.phase]);

  return (
    <div
      aria-label={`${bundle.card.meta.name} 的桌宠气泡`}
      className={morphing ? "pet-bubble-morph-out" : "fade-in-up"}
      style={{
        position: "absolute",
        left: OUTER_PADDING,
        top: OUTER_PADDING,
        width: BUBBLE_WIDTH,
        pointerEvents: morphing ? "none" : "auto",
        filter: "drop-shadow(0 18px 28px rgba(15, 23, 23, 0.18))",
        // morph 期间禁掉 transform-origin 让放大向中心偏聚拢，更像"展开"
        transformOrigin: "center center"
      }}
    >
      <BubbleShell
        mode={mode}
        bundle={bundle}
        sayText={sayText}
        sayingKey={latest?.id ?? "__empty"}
        pendingCount={pendingCount}
        chat={chat}
        recentTurns={recentTurns}
        onAdvanceToTalking={onAdvanceToTalking}
        onToggleExpand={onToggleExpand}
        onTapSaying={onTapSaying}
        onClose={onClose}
        onOpenChat={onOpenChat}
      />
      <BubbleTail direction={direction} />
    </div>
  );
}

// =============================================================
// 壳：把所有 mode 的差异收敛到这里，外层只关心位置与方位
// =============================================================

interface BubbleShellProps {
  mode: BubbleMode;
  bundle: CharacterBundle;
  sayText: string;
  /** 当前段的稳定 id；变化时 Saying 触发段切换动画。 */
  sayingKey: string;
  pendingCount: number;
  chat: ChatSessionState;
  recentTurns: UiTurn[];
  onAdvanceToTalking: () => void;
  onToggleExpand: () => void;
  onTapSaying: () => "advanced-segment" | "default";
  onClose: () => void;
  onOpenChat: () => void;
}

function BubbleShell(props: BubbleShellProps): JSX.Element {
  const {
    mode,
    bundle,
    sayText,
    sayingKey,
    pendingCount,
    chat,
    recentTurns,
    onAdvanceToTalking,
    onToggleExpand,
    onTapSaying,
    onClose,
    onOpenChat
  } = props;

  // 整个气泡主体可以接收点击：
  //   - greeting：点主体 → 升级到 talking（除非 buffer 还有未播段，那点 saying 区先吞为"跳到下一段"）
  //   - talking ↔ expanded：点主体切换（同样，saying 区点击优先用于跳段）
  function onShellClick(e: React.MouseEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-advance]")) return;
    // 命中 saying 区：先尝试跳段；如果没段可跳，再走 mode 切换。
    if (target.closest("[data-saying]")) {
      const result = onTapSaying();
      if (result === "advanced-segment") return;
    }
    if (mode === "greeting") onAdvanceToTalking();
    else onToggleExpand();
  }

  return (
    <section
      onClick={onShellClick}
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        background: BUBBLE_BG,
        border: `1px solid ${BUBBLE_BORDER}`,
        overflow: "hidden",
        cursor: mode === "greeting" ? "pointer" : "default",
        color: BUBBLE_INK
      }}
    >
      {/* 顶部按钮条：极简，只在右上角放需要的按钮 */}
      <TopActions
        mode={mode}
        characterName={bundle.card.meta.name}
        onClose={onClose}
        onOpenChat={onOpenChat}
        onToggleExpand={onToggleExpand}
      />

      {/* expanded 模式：在主体上方插一段最近上下文 */}
      {mode === "expanded" ? <HistoryStack turns={recentTurns} /> : null}

      {/* 桌宠"现在说的这一句"——只渲染一段文本，不堆历史 */}
      <Saying
        mode={mode}
        text={sayText}
        sayingKey={sayingKey}
        pendingCount={pendingCount}
        chat={chat}
      />

      {/* talking / expanded 才有输入框；greeting 不打扰 */}
      {mode !== "greeting" ? <Composer chat={chat} onClose={onClose} /> : null}
    </section>
  );
}

// =============================================================
// 顶部按钮条
// =============================================================

interface TopActionsProps {
  mode: BubbleMode;
  characterName: string;
  onClose: () => void;
  onOpenChat: () => void;
  onToggleExpand: () => void;
}

function TopActions(props: TopActionsProps): JSX.Element {
  const { mode, characterName, onClose, onOpenChat, onToggleExpand } = props;
  const showExpandHistory = mode !== "greeting";
  const showOpenChat = mode !== "greeting";
  return (
    <header
      data-no-advance
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 8px 6px 12px"
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.04em",
          color: BUBBLE_INK_FAINT,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {characterName}
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {showExpandHistory ? (
          <IconButton
            label={mode === "expanded" ? "收起上下文" : "展开上下文"}
            onClick={onToggleExpand}
          >
            {mode === "expanded" ? "▾" : "▴"}
          </IconButton>
        ) : null}
        {showOpenChat ? (
          <IconButton label="打开完整聊天" onClick={onOpenChat}>
            ↗
          </IconButton>
        ) : null}
        <IconButton label="收起气泡" onClick={onClose}>
          ×
        </IconButton>
      </div>
    </header>
  );
}

function IconButton(props: { label: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  const { label, onClick, children } = props;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        width: 24,
        height: 24,
        borderRadius: 8,
        color: BUBBLE_INK_FAINT,
        fontSize: 14,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms"
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(15,23,23,0.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

// =============================================================
// 桌宠现在说的这一句
// =============================================================

interface SayingProps {
  mode: BubbleMode;
  text: string;
  /** 段稳定 id；切换时触发淡入动画。 */
  sayingKey: string;
  pendingCount: number;
  chat: ChatSessionState;
}

function Saying({ mode, text, sayingKey, pendingCount, chat }: SayingProps): JSX.Element {
  const isStreaming = chat.phase !== "idle";
  const showCursor = isStreaming && text.length > 0;
  const hint = pendingCount > 0 ? `还有 ${pendingCount} 段，点这里继续` : null;
  return (
    <div
      data-saying
      style={{
        position: "relative",
        padding: mode === "greeting" ? "2px 14px 14px" : "4px 14px 12px"
      }}
    >
      <div
        style={{
          maxHeight: SAYING_MAX_HEIGHT,
          overflow: "hidden",
          fontSize: 14,
          lineHeight: 1.5,
          color: BUBBLE_INK,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: 22,
          cursor: pendingCount > 0 ? "pointer" : undefined
        }}
      >
        {/* 用 key 强制 React 复用差异：每段切换 → 重新挂载 → fade-in-up 动画自动跑一次。 */}
        <span key={sayingKey} className="fade-in-up" style={{ display: "inline-block" }}>
          {isStreaming && !text ? <TypingIndicator /> : text}
          {showCursor ? <span style={{ color: BUBBLE_INK_FAINT, marginLeft: 2 }}>▍</span> : null}
        </span>
      </div>
      {hint ? (
        <div
          className="fade-in"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: BUBBLE_INK_FAINT,
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <span style={{ display: "inline-block" }}>↓</span>
          <span>{hint}</span>
        </div>
      ) : null}
    </div>
  );
}

function TypingIndicator(): JSX.Element {
  return (
    <span style={{ color: BUBBLE_INK_FAINT, fontSize: 13 }}>
      <span className="dot" style={dotStyle(0)}>·</span>
      <span className="dot" style={dotStyle(1)}>·</span>
      <span className="dot" style={dotStyle(2)}>·</span>
    </span>
  );
}

function dotStyle(i: number): CSSProperties {
  // 复用全局 dots-bounce keyframe（design-system.css），避免新增样式入口。
  return {
    display: "inline-block",
    fontSize: 22,
    lineHeight: 0.5,
    margin: "0 1px",
    animation: `dots-bounce 1.1s ${i * 0.15}s infinite ease-in-out`
  };
}

// =============================================================
// 输入框：talking / expanded 共用
// =============================================================

interface ComposerProps {
  chat: ChatSessionState;
  onClose: () => void;
}

function Composer({ chat, onClose }: ComposerProps): JSX.Element {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 进入 talking 时（首次 mount Composer）自动 focus
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const target = Math.min(el.scrollHeight, 72);
    el.style.height = `${target}px`;
    // 内容低于 maxHeight：完全不显示滚动条；够多 → 切到 auto 让 webkit scrollbar 接管。
    el.style.overflow = el.scrollHeight > 72 ? "auto" : "hidden";
  }, [input]);

  async function submit(): Promise<void> {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await chat.submit(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (chat.streaming) void chat.cancel();
      else void submit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <form
      data-no-advance
      onSubmit={(e) => {
        e.preventDefault();
        if (chat.streaming) void chat.cancel();
        else void submit();
      }}
      style={{
        display: "flex",
        gap: 6,
        alignItems: "flex-end",
        padding: "8px 9px 10px",
        background: BUBBLE_FOOTER_BG,
        borderTop: `1px solid ${BUBBLE_BORDER_SOFT}`
      }}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={chat.streaming ? "它正在说… Enter 中断" : "回它一句…"}
        // 走轻量 className，让自定义 scrollbar 样式（bubble.html 里）能命中，
        // 而不会被全局 .textarea 类（design-system.css）的边距/min-height 污染。
        className="pet-bubble-input"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 32,
          maxHeight: 72,
          resize: "none",
          // 默认 hidden：内容没超出时完全没有滚动条占位；超出 maxHeight 时
          // textarea 会自动转成 scroll，由 webkit-scrollbar 自定义样式接管。
          overflow: "hidden",
          padding: "7px 9px",
          fontSize: 13,
          lineHeight: 1.35,
          border: `1px solid ${BUBBLE_BORDER}`,
          borderRadius: 10,
          background: "#FFFFFF",
          color: BUBBLE_INK,
          outline: "none",
          fontFamily: "inherit",
          boxSizing: "border-box"
        }}
      />
      <button
        type="submit"
        disabled={!chat.streaming && input.trim().length === 0}
        style={{
          minWidth: 48,
          height: 32,
          padding: "6px 10px",
          border: "none",
          borderRadius: 10,
          background: chat.streaming ? "#B85045" : BUBBLE_PRIMARY,
          color: "#FFFFFF",
          fontSize: 13,
          fontWeight: 500,
          cursor: chat.streaming ? "pointer" : input.trim().length ? "pointer" : "not-allowed",
          opacity: chat.streaming || input.trim().length ? 1 : 0.45,
          transition: "opacity 120ms"
        }}
      >
        {chat.streaming ? "停" : "发"}
      </button>
    </form>
  );
}

// =============================================================
// 上下文展开：expanded 模式独有
// =============================================================

interface HistoryStackProps {
  turns: UiTurn[];
}

function HistoryStack({ turns }: HistoryStackProps): JSX.Element {
  if (turns.length === 0) {
    return (
      <div
        data-no-advance
        style={{
          padding: "6px 14px",
          fontSize: 12,
          color: BUBBLE_INK_FAINT,
          borderBottom: `1px solid ${BUBBLE_BORDER_SOFT}`
        }}
      >
        还没有上下文。
      </div>
    );
  }
  return (
    <div
      data-no-advance
      style={{
        maxHeight: 200,
        overflowY: "auto",
        padding: "8px 12px 10px",
        borderBottom: `1px solid ${BUBBLE_BORDER_SOFT}`,
        background: "rgba(15, 23, 23, 0.02)"
      }}
    >
      {turns.map((t) => (
        <ChatBubble
          key={t.id}
          role={t.role}
          content={shortenForBubble(t.content)}
          error={t.error}
          compact
        />
      ))}
    </div>
  );
}

// =============================================================
// 6 方向尾巴：保留原有 SVG，但缩小一点 + 走纯白色 token
// =============================================================

function BubbleTail({ direction }: { direction: BubbleDirection }): JSX.Element {
  const isVertical = direction === "TL" || direction === "TR" || direction === "BL" || direction === "BR";
  const pointsDown = direction === "TL" || direction === "TR";
  const pointsUp = direction === "BL" || direction === "BR";
  const pointsRight = direction === "L";
  const pointsLeft = direction === "R";

  const wrapperStyle: CSSProperties = {
    position: "absolute",
    pointerEvents: "none"
  };

  if (pointsDown) {
    wrapperStyle.bottom = -TAIL_LENGTH + 1;
    if (direction === "TL") wrapperStyle.right = TAIL_EDGE_OFFSET - 9;
    else wrapperStyle.left = TAIL_EDGE_OFFSET - 9;
  } else if (pointsUp) {
    wrapperStyle.top = -TAIL_LENGTH + 1;
    if (direction === "BL") wrapperStyle.right = TAIL_EDGE_OFFSET - 9;
    else wrapperStyle.left = TAIL_EDGE_OFFSET - 9;
  } else if (pointsRight) {
    wrapperStyle.right = -TAIL_LENGTH + 1;
    wrapperStyle.top = "50%";
    wrapperStyle.transform = "translateY(-50%)";
  } else if (pointsLeft) {
    wrapperStyle.left = -TAIL_LENGTH + 1;
    wrapperStyle.top = "50%";
    wrapperStyle.transform = "translateY(-50%)";
  }

  if (isVertical) {
    const path = pointsDown ? "M 1 0 L 9 9 L 17 0" : "M 1 10 L 9 1 L 17 10";
    const fillPath = pointsDown ? "M 2 0 L 9 8 L 16 0 Z" : "M 2 10 L 9 2 L 16 10 Z";
    return (
      <svg aria-hidden="true" width="18" height="10" viewBox="0 0 18 10" style={wrapperStyle}>
        <path d={path} fill="none" stroke={BUBBLE_BORDER} strokeWidth="1" strokeLinejoin="miter" />
        <path d={fillPath} fill={BUBBLE_BG} />
      </svg>
    );
  }

  const path = pointsRight ? "M 0 1 L 9 9 L 0 17" : "M 10 1 L 1 9 L 10 17";
  const fillPath = pointsRight ? "M 0 2 L 8 9 L 0 16 Z" : "M 10 2 L 2 9 L 10 16 Z";
  return (
    <svg aria-hidden="true" width="10" height="18" viewBox="0 0 10 18" style={wrapperStyle}>
      <path d={path} fill="none" stroke={BUBBLE_BORDER} strokeWidth="1" strokeLinejoin="miter" />
      <path d={fillPath} fill={BUBBLE_BG} />
    </svg>
  );
}

function shortenForBubble(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) return normalized;
  return normalized.slice(0, 92) + "…";
}
