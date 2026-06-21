import { useEffect, useRef, type RefObject } from "react";

/** dialog / popover / drawer 内可参与 focus trap 的元素选择器。 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseFocusTrapOptions {
  /** 启用整个 trap；变 false 时清理 listener 并触发 restoreFocus。 */
  enabled: boolean;
  /** 容器 ref，Tab/Shift+Tab 在内部循环。 */
  containerRef: RefObject<HTMLElement | null>;
  /** enabled 变 true 时把焦点移入首个可聚焦元素。默认 true。 */
  autoFocusFirst?: boolean;
  /** 优先于 autoFocusFirst：把焦点移入指定 ref。 */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** enabled 变 false 或组件 unmount 时把焦点还回 enable 前的元素。默认 true。 */
  restoreFocus?: boolean;
  /**
   * 临时让位：例如内部嵌套 menu 接管了 Tab 处理时设为 true。
   * 用 ref 内部跟踪，不会触发 effect 重新挂载。
   */
  paused?: boolean;
}

/**
 * 标准 dialog/menu focus trap：
 * - 启用时 Tab/Shift+Tab 在容器内可聚焦元素间循环
 * - 启用时自动把焦点放入首个 (或 initialFocusRef) 可聚焦元素
 * - 禁用/卸载时把焦点还回启用前的元素
 *
 * 设计：只接管 Tab/Shift+Tab，其它键（Esc/Arrow/Enter）由调用方自己处理，
 * 避免与组件内的 menu 导航 / 业务快捷键冲突。
 */
export function useFocusTrap({
  enabled,
  containerRef,
  autoFocusFirst = true,
  initialFocusRef,
  restoreFocus = true,
  paused
}: UseFocusTrapOptions): void {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!enabled) return;
    const previousFocus = restoreFocus ? (document.activeElement as HTMLElement | null) : null;

    const focusTimer = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (autoFocusFirst && containerRef.current) {
        const first = containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        first?.focus();
      }
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      if (restoreFocus && previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
  }, [enabled, containerRef, autoFocusFirst, initialFocusRef, restoreFocus]);
}
