import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ChatSessionSummary } from "../../shared/ipc-contract.js";
import { formatSessionListTime } from "../shared/format-chat-time.js";
import { useConfirm } from "../shared/feedback.js";
import { useNuwa } from "../shared/use-nuwa.js";

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
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await nuwa.chat.listSessions(characterId);
      setSessions(list);
    } catch (e) {
      onError(e instanceof Error ? e.message : "加载历史失败");
    } finally {
      setLoading(false);
    }
  }, [characterId, nuwa, onError]);

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
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, renamingId, menuSessionId]);

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
        onError("标题不能为空");
        return;
      }
      try {
        const res = await nuwa.chat.renameSession({ characterId, sessionId, title });
        if (!res.ok) {
          onError("重命名失败");
          return;
        }
        setRenamingId(null);
        setMenuSessionId(null);
        onInfo("已重命名");
        await loadSessions();
      } catch (e) {
        onError(e instanceof Error ? e.message : "重命名失败");
      }
    },
    [characterId, nuwa, renameValue, loadSessions, onInfo, onError]
  );

  const handleDelete = useCallback(
    async (session: ChatSessionSummary) => {
      const ok = await confirm({
        title: `删除「${session.title}」？`,
        body: (
          <span>
            该对话的所有消息将被永久删除。
            <p style={{ marginTop: 8, color: "var(--ink-soft)" }}>此操作不可恢复。</p>
          </span>
        ),
        confirmLabel: "确认删除",
        cancelLabel: "再想想",
        danger: true
      });
      if (!ok) return;
      try {
        const res = await nuwa.chat.deleteSession({
          characterId,
          sessionId: session.id
        });
        if (!res.ok) {
          onError("删除失败");
          return;
        }
        setMenuSessionId(null);
        onInfo("已删除");
        if (session.id === activeSessionId) {
          const active = await nuwa.chat.getActiveSession(characterId);
          onSwitch(active.sessionId);
        }
        await loadSessions();
      } catch (e) {
        onError(e instanceof Error ? e.message : "删除失败");
      }
    },
    [characterId, nuwa, activeSessionId, onSwitch, loadSessions, onInfo, onError, confirm]
  );

  if (!open) return null;

  return (
    <div className="chat-history">
      <button type="button" className="chat-history__backdrop" onClick={onClose} aria-label="关闭历史" />
      <div
        ref={panelRef}
        className="chat-history__panel fade-in-up"
        role="dialog"
        aria-label="历史对话"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <button
          type="button"
          className="chat-history__new"
          onClick={() => {
            onNewSession();
            onClose();
          }}
        >
          <NewChatIcon />
          新建对话
        </button>

        <div className="chat-history__list">
          {loading && sessions.length === 0 ? (
            <div className="chat-history__empty">加载中…</div>
          ) : null}
          {!loading && sessions.length === 0 ? (
            <div className="chat-history__empty">还没有历史对话</div>
          ) : null}
          {sessions.map((session) => {
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
                      aria-label="对话标题"
                    />
                    <button type="submit" className="btn btn--sm">
                      保存
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => setRenamingId(null)}
                    >
                      取消
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
                        {session.messageCount} 条 · {formatSessionListTime(session.updatedAt)}
                      </span>
                    </button>
                    <div className="chat-history__item-actions">
                      <button
                        type="button"
                        className="btn btn--icon btn--ghost chat-history__menu-btn"
                        aria-label="更多操作"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuSessionId((cur) => (cur === session.id ? null : session.id));
                        }}
                      >
                        ⋯
                      </button>
                      {menuSessionId === session.id ? (
                        <div className="chat-history__menu fade-in">
                          <button
                            type="button"
                            className="chat-history__menu-item"
                            onClick={() => {
                              setRenamingId(session.id);
                              setRenameValue(session.title);
                              setMenuSessionId(null);
                            }}
                          >
                            <RenameIcon />
                            重命名
                          </button>
                          <button
                            type="button"
                            className="chat-history__menu-item chat-history__menu-item--danger"
                            onClick={() => void handleDelete(session)}
                          >
                            <DeleteIcon />
                            删除
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
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function RenameIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
