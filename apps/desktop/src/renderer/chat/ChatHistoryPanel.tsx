import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ChatSessionSummary } from "../../shared/ipc-contract.js";
import { formatSessionListTime } from "../shared/format-chat-time.js";
import { useConfirm } from "../shared/feedback.js";
import { useNuwa } from "../shared/use-nuwa.js";
import { useT, useI18n } from "../shared/i18n/index.js";
import { useFocusTrap } from "../shared/use-focus-trap.js";
import { Icon } from "../shared/icon.js";

export interface ChatHistoryPanelProps {
  open: boolean;
  characterId: string;
  activeSessionId: string;
  onClose(): void;
  onSwitch(sessionId: string): void;
  onNewSession(): void;
  onInfo(text: string): void;
  onError(text: string): void;
}

export function ChatHistoryPanel(props: ChatHistoryPanelProps): JSX.Element | null {
  const {
    open,
    characterId,
    activeSessionId,
    onClose,
    onSwitch,
    onNewSession,
    onInfo,
    onError
  } = props;
  const t = useT();
  const { locale } = useI18n();
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const newButtonRef = useRef<HTMLButtonElement | null>(null);
  /** 当前打开三点菜单对应的触发按钮（用于 Esc 关菜单后焦点还原）。 */
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);
  /** 当前打开的三点菜单 panel（用于键盘 ArrowKeys 导航）。 */
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  /** 按标题过滤会话；空查询返回全部。 */
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  /** 打开 panel 时清空搜索（避免上一次搜索的残留影响新会话查找）。 */
  useEffect(() => {
    if (open) setSearchQuery("");
  }, [open]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await nuwa.chat.listSessions(characterId);
      setSessions(list);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("chat.historyToastLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [characterId, nuwa, onError, t]);

  useEffect(() => {
    if (!open) return;
    void loadSessions();
  }, [open, loadSessions]);

  useEffect(() => {
    if (open) {
      setMenuSessionId(null);
      setRenamingId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setMenuSessionId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (renamingId) {
          setRenamingId(null);
          return;
        }
        if (menuSessionId) {
          setMenuSessionId(null);
          // 关菜单后焦点回到对应三点按钮，满足 a11y menu 关闭后焦点还原。
          window.setTimeout(() => openTriggerRef.current?.focus(), 0);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, renamingId, menuSessionId]);

  // dialog 打开时把焦点移入「新对话」按钮 + Tab/Shift+Tab 在 panel 内 trap；
  // 三点菜单展开时让位，由下方 menu 导航 useEffect 接管 Tab。
  useFocusTrap({
    enabled: open,
    containerRef: panelRef,
    initialFocusRef: newButtonRef,
    paused: menuSessionId !== null
  });

  // 三点菜单打开时：焦点入首项 + Arrow/Home/End/Tab 在菜单内循环。
  useEffect(() => {
    if (!menuSessionId) return;
    const focusFirst = window.setTimeout(() => {
      const first = menuPanelRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      const panel = menuPanelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const activeIdx = items.indexOf(document.activeElement as HTMLElement);
      const focusAt = (n: number): void => {
        e.preventDefault();
        items[n]?.focus();
      };
      if (e.key === "ArrowDown") {
        focusAt(activeIdx < 0 ? 0 : (activeIdx + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        focusAt(activeIdx < 0 ? items.length - 1 : (activeIdx - 1 + items.length) % items.length);
      } else if (e.key === "Home") {
        focusAt(0);
      } else if (e.key === "End") {
        focusAt(items.length - 1);
      } else if (e.key === "Tab") {
        const dir = e.shiftKey ? -1 : 1;
        focusAt(activeIdx < 0 ? 0 : (activeIdx + dir + items.length) % items.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusFirst);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuSessionId]);

  useEffect(() => {
    if (!renamingId) return;
    const timer = window.setTimeout(() => {
      const el = renameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [renamingId]);

  const handleRename = useCallback(
    async (sessionId: string) => {
      const title = renameValue.trim();
      if (!title) {
        onError(t("chat.historyToastTitleEmpty"));
        return;
      }
      try {
        const res = await nuwa.chat.renameSession({ characterId, sessionId, title });
        if (!res.ok) {
          onError(t("chat.historyToastRenameFailed"));
          return;
        }
        setRenamingId(null);
        setMenuSessionId(null);
        onInfo(t("chat.historyToastRenamed"));
        await loadSessions();
      } catch (e) {
        onError(e instanceof Error ? e.message : t("chat.historyToastRenameFailed"));
      }
    },
    [characterId, nuwa, renameValue, loadSessions, onInfo, onError, t]
  );

  const handleDelete = useCallback(
    async (session: ChatSessionSummary) => {
      const ok = await confirm({
        title: t("chat.historyDeleteTitle", { title: session.title }),
        body: (
          <span>
            {t("chat.historyDeleteBody")}
            <p style={{ marginTop: 8, color: "var(--ink-soft)" }}>
              {t("chat.historyDeleteIrreversible")}
            </p>
          </span>
        ),
        confirmLabel: t("common.confirmDelete"),
        cancelLabel: t("common.thinkAgain"),
        danger: true
      });
      if (!ok) return;
      try {
        const res = await nuwa.chat.deleteSession({
          characterId,
          sessionId: session.id
        });
        if (!res.ok) {
          onError(t("chat.historyToastDeleteFailed"));
          return;
        }
        setMenuSessionId(null);
        onInfo(t("chat.historyToastDeleted"));
        if (session.id === activeSessionId) {
          const active = await nuwa.chat.getActiveSession(characterId);
          onSwitch(active.sessionId);
        }
        await loadSessions();
      } catch (e) {
        onError(e instanceof Error ? e.message : t("chat.historyToastDeleteFailed"));
      }
    },
    [characterId, nuwa, activeSessionId, onSwitch, loadSessions, onInfo, onError, confirm, t]
  );

  if (!open) return null;

  return (
    <div className="chat-history">
      <button
        type="button"
        className="chat-history__backdrop"
        onClick={onClose}
        aria-label={t("chat.historyCloseBackdrop")}
      />
      <div
        ref={panelRef}
        className="chat-history__panel fade-in-up"
        role="dialog"
        aria-modal="true"
        aria-label={t("chat.historyPanelAria")}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <button
          ref={newButtonRef}
          type="button"
          className="chat-history__new"
          onClick={() => {
            onNewSession();
            onClose();
          }}
        >
          <NewChatIcon />
          {t("chat.historyNewChat")}
        </button>

        {/* 搜索框：仅在会话数 > 4 时显示，避免少量会话时占空间。 */}
        {sessions.length > 4 ? (
          <div className="chat-history__search">
            <span className="chat-history__search-icon" aria-hidden="true">
              <Icon name="search" size={14} />
            </span>
            <input
              type="search"
              className="input chat-history__search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("chat.historySearchPlaceholder")}
              aria-label={t("chat.historySearchAria")}
            />
          </div>
        ) : null}

        <div className="chat-history__list">
          {loading && sessions.length === 0 ? (
            <div className="chat-history__empty">{t("chat.historyLoading")}</div>
          ) : null}
          {!loading && sessions.length === 0 ? (
            <div className="chat-history__empty">{t("chat.historyEmpty")}</div>
          ) : null}
          {!loading && sessions.length > 0 && filteredSessions.length === 0 ? (
            <div className="chat-history__empty">{t("chat.historySearchNoResults")}</div>
          ) : null}
          {filteredSessions.map((session) => {
            const active = session.id === activeSessionId;
            const renaming = renamingId === session.id;
            return (
              <div
                key={session.id}
                className={`chat-history__item${active ? " chat-history__item--active" : ""}`}
              >
                {renaming ? (
                  <form
                    className="chat-history__rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleRename(session.id);
                    }}
                  >
                    <input
                      ref={renameInputRef}
                      type="text"
                      className="chat-history__rename-input input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      maxLength={80}
                      aria-label={t("chat.historyTitleAria")}
                    />
                    <button type="submit" className="btn btn--sm">
                      {t("chat.historySave")}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => setRenamingId(null)}
                    >
                      {t("chat.historyCancel")}
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="chat-history__item-main"
                      onClick={() => {
                        onSwitch(session.id);
                        onClose();
                      }}
                    >
                      <span className="chat-history__item-title">{session.title}</span>
                      <span className="chat-history__item-meta">
                        {t("chat.historyMessageCount", { count: session.messageCount })} ·{" "}
                        {formatSessionListTime(session.updatedAt, locale)}
                      </span>
                    </button>
                    <div className="chat-history__item-actions">
                      <button
                        type="button"
                        className="btn btn--icon btn--ghost chat-history__menu-btn"
                        aria-label={t("chat.historyMoreActions")}
                        aria-haspopup="menu"
                        aria-expanded={menuSessionId === session.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          // 记下触发按钮以便 Esc 关菜单后还焦。
                          openTriggerRef.current = e.currentTarget;
                          setMenuSessionId((cur) => (cur === session.id ? null : session.id));
                        }}
                      >
                        <Icon name="more-horizontal" size={16} />
                      </button>
                      {menuSessionId === session.id ? (
                        <div
                          ref={menuPanelRef}
                          className="chat-history__menu fade-in"
                          role="menu"
                          aria-orientation="vertical"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="chat-history__menu-item"
                            onClick={() => {
                              setRenamingId(session.id);
                              setRenameValue(session.title);
                              setMenuSessionId(null);
                            }}
                          >
                            <RenameIcon />
                            {t("chat.historyRename")}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="chat-history__menu-item chat-history__menu-item--danger"
                            onClick={() => void handleDelete(session)}
                          >
                            <DeleteIcon />
                            {t("chat.historyDelete")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewChatIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function RenameIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
