import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { useT } from "./i18n/index.js";
import { Icon } from "./icon.js";

/**
 * 全局快捷键作用域 + 帮助面板。
 *
 * 用法：
 *   <KeyboardScope>
 *     <App />
 *   </KeyboardScope>
 *
 *   useShortcut({ id: "library-1", combo: "1", scope: "settings", handler, label: "切到角色仓库" })
 *
 * 按 `?` 弹出当前作用域注册的所有快捷键。
 */

export interface ShortcutInput {
  id: string;
  /** 组合键文本：当前实现仅支持 "Key" / "Mod+Key" / "Shift+Key" / "Mod+Shift+Key"。
   *  Mod 在 Windows/Linux 上是 Ctrl，在 macOS 上是 Cmd。 */
  combo: string;
  scope?: string;
  label: string;
  handler: () => void;
  /** true 时即使焦点在输入框内也触发（默认 false） */
  ignoreWhenTyping?: boolean;
}

interface RegisteredShortcut extends ShortcutInput {}

interface KeyboardContextValue {
  register(s: RegisteredShortcut): () => void;
  list(scope?: string): RegisteredShortcut[];
  openHelp(): void;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function useKeyboard(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  if (!ctx) {
    // Fallback：未挂载时给空实现，避免崩溃
    return {
      register() {
        return () => {};
      },
      list() {
        return [];
      },
      openHelp() {}
    };
  }
  return ctx;
}

export function useShortcut(input: ShortcutInput): void {
  const kb = useKeyboard();
  const handlerRef = useRef(input.handler);
  handlerRef.current = input.handler;
  useEffect(() => {
    return kb.register({
      ...input,
      handler: () => handlerRef.current()
    });
  }, [
    kb,
    input.id,
    input.combo,
    input.scope,
    input.label,
    input.ignoreWhenTyping
  ]);
}

function parseCombo(combo: string): {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
} {
  const parts = combo.split("+").map((p) => p.trim());
  let mod = false;
  let shift = false;
  let alt = false;
  let key = "";
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === "mod" || low === "ctrl" || low === "cmd") mod = true;
    else if (low === "shift") shift = true;
    else if (low === "alt") alt = true;
    else key = p;
  }
  return { key: key.toLowerCase(), mod, shift, alt };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    t.isContentEditable === true
  );
}

export function KeyboardScope({ children }: { children: ReactNode }): JSX.Element {
  const [shortcuts, setShortcuts] = useState<RegisteredShortcut[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  // 用 ref 镜像当前 shortcuts，让 list / 全局键盘 handler 都能读最新值，
  // 同时 list 自身保持稳定 reference（避免每次 register 导致 context 变化 →
  // useShortcut 的 effect 重跑 → 死循环）。
  const shortcutsRef = useRef<RegisteredShortcut[]>([]);
  shortcutsRef.current = shortcuts;

  const register = useCallback((s: RegisteredShortcut) => {
    setShortcuts((prev) => {
      const next = [...prev.filter((x) => x.id !== s.id), s];
      shortcutsRef.current = next;
      return next;
    });
    return () => {
      setShortcuts((prev) => {
        const next = prev.filter((x) => x.id !== s.id);
        shortcutsRef.current = next;
        return next;
      });
    };
  }, []);

  const list = useCallback((scope?: string) => {
    if (!scope) return shortcutsRef.current;
    return shortcutsRef.current.filter((s) => !s.scope || s.scope === scope);
  }, []);

  const openHelp = useCallback(() => setHelpOpen(true), []);

  // 全局键盘分发（用 ref 读 shortcuts，避免随 shortcuts 变化频繁挂载 / 卸载）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 帮助面板：? （Shift+/ 或直接 ?）
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }
      const typing = isTypingTarget(e.target);
      for (const s of shortcutsRef.current) {
        if (typing && !s.ignoreWhenTyping) continue;
        const parsed = parseCombo(s.combo);
        const eKey = e.key.toLowerCase();
        const targetKey = parsed.key;
        const modOk =
          parsed.mod === (e.ctrlKey || e.metaKey) ||
          (!parsed.mod && !(e.ctrlKey || e.metaKey));
        const shiftOk = parsed.shift === e.shiftKey || (!parsed.shift && !e.shiftKey);
        const altOk = parsed.alt === e.altKey || (!parsed.alt && !e.altKey);
        if (eKey === targetKey && modOk && shiftOk && altOk) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

  const ctx = useMemo<KeyboardContextValue>(
    () => ({ register, list, openHelp }),
    [register, list, openHelp]
  );

  return (
    <KeyboardContext.Provider value={ctx}>
      {children}
      {helpOpen ? (
        <HelpOverlay
          shortcuts={shortcuts}
          onClose={() => setHelpOpen(false)}
        />
      ) : null}
    </KeyboardContext.Provider>
  );
}

function HelpOverlay({
  shortcuts,
  onClose
}: {
  shortcuts: RegisteredShortcut[];
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const grouped = useMemo(() => {
    const map = new Map<string, RegisteredShortcut[]>();
    for (const s of shortcuts) {
      const rawScope = s.scope ?? "global";
      const k =
        rawScope === "Settings"
          ? t("keyboard.scopeSettings")
          : rawScope === "global" || rawScope === "全局"
            ? t("keyboard.scopeGlobal")
            : rawScope;
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [shortcuts, t]);

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("keyboard.dialogAria")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal--shortcuts">
        <header className="shortcuts-modal__header">
          <div>
            <div className="eyebrow">Keyboard</div>
            <h2 className="display display--section shortcuts-modal__title">
              {t("keyboard.title")}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn--icon shortcuts-modal__close"
            onClick={onClose}
            aria-label={t("keyboard.close")}
            data-hint="Esc"
          >
            <Icon name="close" size={14} strokeWidth={2} />
          </button>
        </header>

        {grouped.length === 0 ? (
          <p className="body-md shortcuts-modal__empty">{t("keyboard.empty")}</p>
        ) : (
          <div className="shortcuts-modal__groups">
            {grouped.map(([scope, list]) => (
              <section key={scope} className="shortcuts-modal__group">
                <h3 className="shortcuts-modal__scope">{scope}</h3>
                <ul className="shortcuts-modal__list">
                  {list.map((s, i) => (
                    <li
                      key={s.id}
                      className="shortcuts-modal__row fade-in-up"
                      style={{ animationDelay: `${i * 36}ms` }}
                    >
                      <div className="shortcuts-modal__keys">
                        <ComboBadge combo={s.combo} />
                      </div>
                      <span className="shortcuts-modal__label">{s.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <footer className="shortcuts-modal__footer">
          {t("keyboard.dismissHintBefore")}
          <kbd className="shortcuts-kbd shortcuts-kbd--inline">?</kbd>
          {t("keyboard.dismissHintAfter")}
        </footer>
      </div>
    </div>,
    document.body
  );
}

function ComboBadge({ combo }: { combo: string }): JSX.Element {
  const parts = combo.split("+").map((p) => p.trim());
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return (
    <span className="shortcuts-kbd-group">
      {parts.map((p, i) => {
        const label =
          p.toLowerCase() === "mod"
            ? isMac
              ? "⌘"
              : "Ctrl"
            : p;
        return (
          <kbd key={i} className="shortcuts-kbd">
            {label}
          </kbd>
        );
      })}
    </span>
  );
}
