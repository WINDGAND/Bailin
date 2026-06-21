import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { useActiveCharacter, useNuwa } from "../shared/use-nuwa.js";
import { PetRenderer } from "../shared/pet-renderer.js";
import { useConfirm, useToast } from "../shared/feedback.js";
import { ChatBubble } from "../shared/chat-bubble.js";
import { useChatSession } from "../shared/use-chat-session.js";
import { useChatScroll } from "../shared/use-chat-scroll.js";
import { copyToClipboard } from "../shared/copy-to-clipboard.js";
import { usePlatformModKey } from "../shared/use-platform-mod-key.js";
import { Icon } from "../shared/icon.js";
import { ChatResizeHandles } from "./ChatResizeHandles.js";
import { ChatHistoryPanel } from "./ChatHistoryPanel.js";
import type { ProfileChange, ProfileUpdatedEvent } from "../../shared/ipc-contract.js";
import { useT } from "../shared/i18n/index.js";

export function ChatApp(): JSX.Element {
  const nuwa = useNuwa();
  const t = useT();
  const modKey = usePlatformModKey();
  const { bundle } = useActiveCharacter();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [input, setInput] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [emptyShake, setEmptyShake] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const emptyShakeTimerRef = useRef<number | null>(null);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    // 关闭后焦点还原到 history 触发按钮，满足 a11y dialog 焦点管理。
    window.setTimeout(() => historyButtonRef.current?.focus(), 0);
  }, []);

  /**
   * 提交空 input 时触发：抖动 form + 给屏幕阅读器 announce 提示。
   * 用 rAF "强制"重置 → 设值，让连按 Enter 时第二次也能再触发动画。
   */
  const triggerEmptyShake = useCallback(() => {
    if (emptyShakeTimerRef.current !== null) {
      window.clearTimeout(emptyShakeTimerRef.current);
    }
    setEmptyShake(false);
    requestAnimationFrame(() => {
      setEmptyShake(true);
      emptyShakeTimerRef.current = window.setTimeout(() => setEmptyShake(false), 500);
    });
  }, []);

  useEffect(
    () => () => {
      if (emptyShakeTimerRef.current !== null) window.clearTimeout(emptyShakeTimerRef.current);
    },
    []
  );
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

  const profileToastBuf = useRef<ProfileChange[]>([]);
  const profileToastTimer = useRef<number | null>(null);

  useEffect(() => {
    return nuwa.on.profileUpdated((evt: ProfileUpdatedEvent) => {
      profileToastBuf.current.push(...evt.changes.filter((c) => !c.kind.startsWith("remove")));
      if (profileToastTimer.current !== null) {
        window.clearTimeout(profileToastTimer.current);
      }
      profileToastTimer.current = window.setTimeout(() => {
        const adds = profileToastBuf.current;
        profileToastBuf.current = [];
        profileToastTimer.current = null;
        if (adds.length === 0) return;
        const summary = adds
          .slice(0, 2)
          .map((c) => c.text)
          .join("、");
        showToast({
          kind: "info",
          text: t("chat.profileRemembered", { summary }),
          ttlMs: 5000,
          onClick: () => void nuwa.pet.openSettings("memory")
        });
      }, 500);
    });
  }, [nuwa, showToast, t]);

  useEffect(() => {
    return () => {
      if (profileToastTimer.current !== null) {
        window.clearTimeout(profileToastTimer.current);
      }
    };
  }, []);

  // ===== 差异化建议（取自 card） =====
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!bundle) return [];
    const list: Suggestion[] = [];
    const firstMM = bundle.card.mentalModels[0];
    if (firstMM) {
      list.push({
        id: "mm",
        title: t("chat.suggestionMmTitle", { name: firstMM.name }),
        hint: firstMM.oneLiner.slice(0, 60),
        prompt: t("chat.suggestionMmPrompt", { name: firstMM.name })
      });
    }
    if (bundle.card.meta.quoteOneLiner) {
      list.push({
        id: "quote",
        title: t("chat.suggestionQuoteTitle"),
        hint: bundle.card.meta.quoteOneLiner.slice(0, 70),
        prompt: t("chat.suggestionQuotePrompt", { quote: bundle.card.meta.quoteOneLiner })
      });
    }
    list.push({
      id: "stuck",
      title: t("chat.suggestionStuckTitle"),
      hint: t("chat.suggestionStuckHint"),
      prompt: t("chat.suggestionStuckPrompt")
    });
    return list.slice(0, 3);
  }, [bundle, t]);

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
          closeHistory();
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
  }, [nuwa, startNewSession, historyOpen, closeHistory]);

  // ===== textarea 自动高度 + 快捷键 =====
  function onTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      // 走 form 的 onSubmit 统一逻辑（含空检查 + shake / streaming 取消）
      e.currentTarget.form?.requestSubmit();
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
          <div className="chat-panel__header" style={{ position: "relative" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                className="display display--section"
                style={{
                  fontSize: 15,
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0
                }}
              >
                {bundle?.card.meta.name ?? t("chat.noCharacter")}
              </div>
              {bundle && bundle.card.mentalModels.length > 0 ? (
                <CharacterInfoButton bundle={bundle} t={t} />
              ) : null}
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
              {bundle.card.meta.track === "companion"
                ? t("chat.trackCompanion")
                : t("chat.trackUtility")}
            </span>
          ) : null}
          <button
            ref={historyButtonRef}
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="btn btn--icon"
            data-hint={t("chat.historyHint")}
            data-hint-placement="bottom"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label={t("chat.historyAria")}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            disabled={!bundle}
          >
            <HistoryIcon />
          </button>
          <button
            type="button"
            onClick={() => void startNewSession()}
            className="btn btn--icon"
            data-hint={t("chat.newChatHint", { mod: modKey })}
            data-hint-placement="bottom"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label={t("chat.newChatAria")}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            onClick={() => void nuwa.chat.hide()}
            className="btn btn--icon"
            data-hint={t("chat.closeHint")}
            data-hint-placement="bottom"
            data-hint-align="end"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label={t("chat.closeAria")}
          >
            <CloseIcon />
          </button>
        </div>

          {/* Body */}
          <div className="chat-panel__body-wrap">
            <div
              ref={listRef}
              className="chat-panel__body"
              role="log"
              aria-live="polite"
              aria-label={t("chat.messageListAria")}
            >
          {chat.turns.length === 0 && !chat.pending && chat.phase === "idle" ? (
            <div className="stack fade-in-up" style={{ marginTop: 4 }}>
              <div className="eyebrow">{t("chat.suggestionsEyebrow")}</div>
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  className="suggestion fade-in-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                  aria-label={`${s.title}：${s.hint}`}
                  onClick={() => void submit(s.prompt)}
                >
                  <span className="suggestion__row">
                    <span className="suggestion__index" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="suggestion__title">{s.title}</span>
                    <span className="suggestion__arrow" aria-hidden="true">
                      <Icon name="chevron-right" size={14} strokeWidth={1.6} />
                    </span>
                  </span>
                  <span className="suggestion__hint">{s.hint}</span>
                </button>
              ))}
            </div>
          ) : null}

          {chat.turns.map((turn) => (
            <ChatBubble
              key={turn.id}
              role={turn.role}
              content={turn.content}
              createdAt={turn.createdAt}
              error={turn.error}
              onRetry={turn.error ? retryLastUser : undefined}
              onGoSettings={
                turn.error?.code === "AUTH_FAILED" || /401|auth|key/i.test(turn.error?.message ?? "")
                  ? () => void nuwa.pet.openSettings()
                  : undefined
              }
              onCopy={() => {
                void copyToClipboard(turn.content, {
                  onSuccess: () =>
                    showToast({ kind: "info", text: t("feedback.toastCopiedShort") }),
                  onFailure: () =>
                    showToast({ kind: "error", text: t("feedback.toastCopyFailed") })
                });
              }}
              onDelete={() => {
                if (turn.role === "user") {
                  // 用户消息删除会级联删除后续所有 turns（不可逆），必须 confirm。
                  void (async () => {
                    const ok = await confirm({
                      title: t("chat.deleteUserTurnTitle"),
                      body: t("chat.deleteUserTurnBody"),
                      confirmLabel: t("common.confirmDelete"),
                      cancelLabel: t("common.thinkAgain"),
                      danger: true
                    });
                    if (ok) void chat.deleteTurnsFrom(turn.id);
                  })();
                } else {
                  // 助手消息删除可通过 regenerate 恢复，单击即删（参考 ChatGPT / Claude 体验）。
                  void chat.deleteTurn(turn.id);
                }
              }}
              onEdit={
                turn.role === "user"
                  ? () => {
                      setInput(turn.content);
                      void chat.deleteTurnsFrom(turn.id);
                      textareaRef.current?.focus();
                    }
                  : undefined
              }
              onQuote={
                turn.role === "assistant"
                  ? () => {
                      const quoted = turn.content
                        .split("\n")
                        .map((line) => `> ${line}`)
                        .join("\n");
                      setInput((cur) => (cur.trim() ? `${cur}\n\n${quoted}\n\n` : `${quoted}\n\n`));
                      textareaRef.current?.focus();
                    }
                  : undefined
              }
              onRegenerate={
                turn.role === "assistant" ? () => void chat.regenerateAssistant(turn.id) : undefined
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
              aria-label={t("chat.scrollDown")}
            >
              <ChevronDownIcon />
            </button>
          ) : null}
        </div>

        {/* Input */}
        <form
          className={`chat-panel__footer${emptyShake ? " shake-once" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (streaming) {
              void chat.cancel();
              return;
            }
            if (input.trim().length === 0) {
              // 不再 disabled send 按钮；空提交反馈：抖动 form + SR live 区提示。
              triggerEmptyShake();
              textareaRef.current?.focus();
              return;
            }
            void submit(input);
          }}
        >
          <textarea
            ref={textareaRef}
            className="textarea"
            aria-label={t("chat.inputAria")}
            placeholder={
              streaming
                ? t("chat.placeholderStreaming")
                : t("chat.placeholderIdle", {
                    name: bundle?.card.meta.name ?? t("chat.defaultName")
                  })
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
              data-hint={t("chat.cancelHint")}
              aria-label={t("chat.cancelAria")}
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn--magenta btn--send"
              data-hint={t("chat.sendHint")}
              aria-label={t("chat.sendAria")}
            >
              <SendIcon />
            </button>
          )}
          {/* SR-only live 区：空提交时朗读"请先输入内容"。键盘 / 鼠标用户看 form 抖动。 */}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {emptyShake ? t("chat.emptyInputHint") : ""}
          </span>
        </form>

        {bundle && historyOpen ? (
          <ChatHistoryPanel
            open={historyOpen}
            characterId={bundle.card.id}
            activeSessionId={chat.sessionId}
            onClose={closeHistory}
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
          <span>
            {t("chat.lastErrorPrefix")}
            {chat.lastError.message}
          </span>
          <button className="btn btn--ghost btn--sm" onClick={retryLastUser}>
            {t("chat.retry")}
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

function InfoIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}

function CharacterInfoButton({
  bundle,
  t
}: {
  bundle: CharacterBundle;
  t: (key: string, params?: Record<string, string>) => string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // 点击落在按钮或 popover 内都不应关闭。
      // 旧代码用 btnRef.current.closest('.char-info-popover') 永远 false（按钮不是 popover 后代），
      // 导致点击 popover 内部时本应不关，实际全关。
      if (btnRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const mms = bundle.card.mentalModels.slice(0, 3);
  const quote = bundle.card.meta.quoteOneLiner;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="char-info-btn"
        aria-label={t("chat.charInfoAria")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <InfoIcon />
      </button>
      {open ? (
        <div ref={popoverRef} className="char-info-popover" role="tooltip">
          <div className="char-info-popover__name">{bundle.card.meta.name}</div>
          {bundle.card.meta.sourceName ? (
            <div className="char-info-popover__source">{bundle.card.meta.sourceName}</div>
          ) : null}
          {mms.length > 0 ? (
            <>
              <div className="char-info-popover__section">{t("chat.charInfoMmLabel")}</div>
              <div className="char-info-popover__mm">
                {mms.map((mm) => (
                  <div key={mm.name} className="char-info-popover__mm-item">
                    <div className="char-info-popover__mm-name">{mm.name}</div>
                    <div className="char-info-popover__mm-liner">{mm.oneLiner}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {quote ? (
            <>
              <div className="char-info-popover__divider" />
              <div className="char-info-popover__quote">「{quote}」</div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
