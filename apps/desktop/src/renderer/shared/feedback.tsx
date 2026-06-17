import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type FormEvent
} from "react";
import { createPortal } from "react-dom";
import { useT } from "./i18n/index.js";

/**
 * 通用反馈组件层：Toast / ConfirmDialog / Skeleton / StatusDot / CopyButton。
 * 设计：纯 React + design-system.css，不引入新依赖。
 *
 * 用法：
 *   const { showToast } = useToast();
 *   showToast({ kind: "success", text: "已保存" });
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "...", danger: true, requireText: "DELETE" });
 */

// =============================================================
// Toast
// =============================================================

type ToastKind = "info" | "success" | "warn" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  ttlMs: number;
}

interface ToastInput {
  kind?: ToastKind;
  text: string;
  ttlMs?: number;
}

interface ToastContextValue {
  showToast(input: ToastInput): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback：未挂载 Provider 时降级为 console
    return {
      showToast(input) {
        console.warn("[toast]", input.kind ?? "info", input.text);
      }
    };
  }
  return ctx;
}

// =============================================================
// Confirm
// =============================================================

interface ConfirmInput {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** 需要用户输入指定字符串才允许确认（如 "DELETE"） */
  requireText?: string;
}

type ConfirmFn = (input: ConfirmInput) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return async (input) => {
      // Fallback：未挂载 Provider 时退到 window.confirm
      return window.confirm(input.title);
    };
  }
  return ctx;
}

// =============================================================
// Provider
// =============================================================

interface PendingConfirm {
  input: ConfirmInput;
  resolve: (ok: boolean) => void;
}

export function FeedbackProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const seqRef = useRef(0);

  const showToast = useCallback((input: ToastInput) => {
    const id = (seqRef.current += 1);
    const item: ToastItem = {
      id,
      kind: input.kind ?? "info",
      text: input.text,
      ttlMs: input.ttlMs ?? 3500
    };
    setToasts((prev) => [...prev, item]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, item.ttlMs);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const confirm: ConfirmFn = useCallback((input) => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm({ input, resolve });
    });
  }, []);

  const closeConfirm = useCallback(
    (ok: boolean) => {
      setPendingConfirm((cur) => {
        if (cur) cur.resolve(ok);
        return null;
      });
    },
    []
  );

  const toastCtx = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={toastCtx}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        {pendingConfirm ? (
          <ConfirmDialog
            input={pendingConfirm.input}
            onClose={closeConfirm}
          />
        ) : null}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

// =============================================================
// Toast Stack
// =============================================================

function ToastStack({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}): JSX.Element | null {
  const t = useT();
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="toast-stack" role="region" aria-label={t("feedback.toastRegion")}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button
            type="button"
            className="toast__close"
            aria-label={t("feedback.toastClose")}
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

// =============================================================
// Confirm Dialog
// =============================================================

function ConfirmDialog({
  input,
  onClose
}: {
  input: ConfirmInput;
  onClose: (ok: boolean) => void;
}): JSX.Element {
  const t = useT();
  const [text, setText] = useState("");
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const requirementMet =
    !input.requireText || text.trim() === input.requireText;

  // Focus trap：在卡片内 Tab 循环；Esc / Enter 快捷键
  useEffect(() => {
    previousFocus.current = (document.activeElement as HTMLElement) ?? null;
    const target = input.requireText ? inputRef.current : confirmRef.current;
    target?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      if (e.key === "Enter" && requirementMet) {
        if (
          document.activeElement !== inputRef.current ||
          !input.requireText
        ) {
          e.preventDefault();
          onClose(true);
        }
        return;
      }
      if (e.key === "Tab") {
        // 简易 focus trap：只允许在 [input?, cancel, confirm] 之间循环
        const focusables: HTMLElement[] = [];
        if (inputRef.current) focusables.push(inputRef.current);
        if (cancelRef.current) focusables.push(cancelRef.current);
        if (confirmRef.current) focusables.push(confirmRef.current);
        if (focusables.length === 0) return;
        const idx = focusables.findIndex((el) => el === document.activeElement);
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (idx + dir + focusables.length) % focusables.length;
        e.preventDefault();
        focusables[nextIdx]?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previousFocus.current?.focus?.();
    };
  }, [requirementMet, input.requireText, onClose]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!requirementMet) return;
    onClose(true);
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
    >
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onSubmit={onSubmit}
      >
        <div
          id="confirm-title"
          className="display display--section"
          style={{ marginBottom: 8 }}
        >
          {input.title}
        </div>
        {input.body ? (
          <div className="body-md" style={{ marginBottom: 14 }}>
            {input.body}
          </div>
        ) : null}
        {input.requireText ? (
          <div style={{ marginBottom: 14 }}>
            <label className="body-sm" style={{ display: "block", marginBottom: 6 }}>
              {t("feedback.requireTextBefore")}
              <code style={{ fontFamily: "var(--font-mono)" }}>{input.requireText}</code>
              {t("feedback.requireTextAfter")}
            </label>
            <input
              ref={inputRef}
              className={`input ${
                text.length > 0 && !requirementMet ? "input--invalid" : ""
              }`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        ) : null}
        <div className="row row--end gap-2">
          <button
            type="button"
            className="btn btn--ghost"
            ref={cancelRef}
            onClick={() => onClose(false)}
          >
            {input.cancelLabel ?? t("feedback.cancelDefault")}
          </button>
          <button
            type="submit"
            className={input.danger ? "btn btn--danger" : "btn btn--magenta"}
            ref={confirmRef}
            disabled={!requirementMet}
            aria-disabled={!requirementMet}
          >
            {input.confirmLabel ?? t("feedback.confirmDefault")}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// =============================================================
// Skeleton
// =============================================================

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}

export function Skeleton({ width, height, radius = 8, style }: SkeletonProps): JSX.Element {
  return (
    <div
      className="shimmer"
      style={{
        width: width ?? "100%",
        height: height ?? 16,
        borderRadius: radius,
        ...style
      }}
      aria-hidden="true"
    />
  );
}

// =============================================================
// StatusDot
// =============================================================

export type StatusKind = "ok" | "warn" | "error" | "pending" | "running" | "idle";

export function StatusDot({
  kind,
  label,
  className
}: {
  kind: StatusKind;
  label?: string;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={`status-dot status-dot--${kind} ${className ?? ""}`}
      role="status"
      aria-label={label ?? kind}
    >
      <span className="status-dot__bullet" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

// =============================================================
// CopyButton
// =============================================================

export function CopyButton({
  text,
  label,
  className,
  small = false
}: {
  text: string;
  label?: string;
  className?: string;
  small?: boolean;
}): JSX.Element {
  const t = useT();
  const resolvedLabel = label ?? t("feedback.copy");
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1200);
      showToast({ kind: "success", text: t("feedback.toastCopied") });
    } catch {
      showToast({ kind: "warn", text: t("feedback.toastCopyFailed") });
    }
  }, [text, showToast, t]);

  return (
    <button
      type="button"
      className={`btn btn--ghost ${small ? "btn--sm" : ""} ${className ?? ""}`}
      onClick={onClick}
      aria-live="polite"
    >
      {copied ? t("feedback.copied") : resolvedLabel}
    </button>
  );
}

// =============================================================
// StreamCursor （流式光标三态）
// =============================================================

export function StreamCursor({
  kind
}: {
  kind: "thinking" | "streaming" | "done";
}): JSX.Element | null {
  const t = useT();
  if (kind === "done") return null;
  if (kind === "thinking") {
    return (
      <span className="stream-cursor stream-cursor--thinking" aria-label={t("feedback.thinking")}>
        <i />
        <i />
        <i />
      </span>
    );
  }
  return <span className="stream-cursor stream-cursor--streaming" aria-hidden="true" />;
}

// =============================================================
// Spinner
// =============================================================

export function Spinner({
  magenta = false,
  size = "sm"
}: {
  magenta?: boolean;
  size?: "sm" | "lg";
}): JSX.Element {
  const t = useT();
  return (
    <span
      className={`spinner ${magenta ? "spinner--magenta" : ""} ${
        size === "lg" ? "spinner--lg" : ""
      }`}
      role="status"
      aria-label={t("common.loading")}
    />
  );
}
