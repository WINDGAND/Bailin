import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { createPortal } from "react-dom";

export interface BlSelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface BlSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<BlSelectOption<T>>;
  disabled?: boolean;
  id?: string;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
}

/**
 * 自绘下拉，遵循 W3C ARIA APG "combobox-select-only" 模式：
 * - trigger button 是 ARIA combobox，全程持有键盘焦点
 * - 虚拟焦点（aria-activedescendant）指向当前键盘高亮的 option
 * - option 用 li[role="option"]，仅响应鼠标 hover / click
 * - 完整键盘支持：Up/Down/Home/End/Enter/Space/Esc/Tab/Typeahead
 *
 * 参考: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/
 */
export function BlSelect<T extends string = string>({
  value,
  onChange,
  options,
  disabled,
  id,
  className = "",
  triggerClassName = "input",
  "aria-label": ariaLabel
}: BlSelectProps<T>): JSX.Element {
  const autoId = useId();
  const baseId = id ?? autoId;
  const listboxId = `${baseId}-listbox`;
  const optionIdAt = useCallback((idx: number) => `${baseId}-opt-${idx}`, [baseId]);

  const [open, setOpen] = useState(false);
  /** 键盘高亮的 option index；-1 表示无激活项。 */
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);

  /** Typeahead 缓冲：用户连按字母时累加，500ms 后清空。 */
  const typeBufferRef = useRef<string>("");
  const typeTimerRef = useRef<number | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex]! : undefined;
  const activeOptionId = open && activeIndex >= 0 ? optionIdAt(activeIndex) : undefined;

  // ===================================================================
  // 定位
  // ===================================================================
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const updateMenuPosition = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const pad = 8;
      const maxMenuHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const openDown = spaceBelow >= 120 || spaceBelow >= spaceAbove;

      if (openDown) {
        setMenuStyle({
          position: "fixed",
          top: rect.bottom + gap,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(maxMenuHeight, Math.max(spaceBelow, 96))
        });
        return;
      }

      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + gap,
        maxHeight: Math.min(maxMenuHeight, Math.max(spaceAbove, 96))
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length, value]);

  // ===================================================================
  // 外部点击关闭
  // ===================================================================
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // ===================================================================
  // 滚动到当前 active option（键盘导航不让高亮项跑出可视区）
  // ===================================================================
  useEffect(() => {
    if (!open || activeIndex < 0 || !menuRef.current) return;
    const el = menuRef.current.querySelector<HTMLElement>(`#${CSS.escape(optionIdAt(activeIndex))}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, optionIdAt]);

  // ===================================================================
  // 操作函数
  // ===================================================================
  const openListbox = useCallback(
    (initial: "selected" | "first" | "last") => {
      let next: number;
      if (initial === "first") next = 0;
      else if (initial === "last") next = options.length - 1;
      else next = selectedIndex >= 0 ? selectedIndex : 0;
      setActiveIndex(Math.max(0, Math.min(next, options.length - 1)));
      setOpen(true);
    },
    [options.length, selectedIndex]
  );

  const closeListbox = useCallback((returnFocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    typeBufferRef.current = "";
    if (typeTimerRef.current !== null) {
      window.clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    if (returnFocus) {
      // 关闭后焦点回 trigger（满足 a11y combobox 焦点管理）。
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, []);

  const commitOption = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= options.length) return;
      onChange(options[idx]!.value);
      closeListbox();
    },
    [onChange, options, closeListbox]
  );

  const handleTypeahead = useCallback(
    (char: string) => {
      if (typeTimerRef.current !== null) window.clearTimeout(typeTimerRef.current);
      typeBufferRef.current += char.toLowerCase();
      const buf = typeBufferRef.current;
      const startIdx = activeIndex >= 0 ? activeIndex : 0;
      // 从当前 active 之后开始查找前缀匹配，循环到头。
      for (let i = 1; i <= options.length; i++) {
        const idx = (startIdx + i) % options.length;
        if (options[idx]!.label.toLowerCase().startsWith(buf)) {
          setActiveIndex(idx);
          break;
        }
      }
      typeTimerRef.current = window.setTimeout(() => {
        typeBufferRef.current = "";
        typeTimerRef.current = null;
      }, 500);
    },
    [activeIndex, options]
  );

  // unmount 清理 typeahead timer
  useEffect(
    () => () => {
      if (typeTimerRef.current !== null) window.clearTimeout(typeTimerRef.current);
    },
    []
  );

  // ===================================================================
  // 键盘
  // ===================================================================
  const onTriggerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          openListbox("selected");
        } else if (e.key === "Home") {
          e.preventDefault();
          openListbox("first");
        } else if (e.key === "End") {
          e.preventDefault();
          openListbox("last");
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openListbox("selected");
        } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Typeahead: 关闭状态下也可输入字母直接开 + 跳转。
          e.preventDefault();
          openListbox("selected");
          handleTypeahead(e.key);
        }
        return;
      }

      // 打开状态
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((idx) => (idx + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((idx) => (idx - 1 + options.length) % options.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(options.length - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        commitOption(activeIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeListbox();
      } else if (e.key === "Tab") {
        // Tab 提交当前 active 并关闭（让焦点继续移到下一个表单元素，不 preventDefault）。
        if (activeIndex >= 0) {
          onChange(options[activeIndex]!.value);
        }
        // 不调 closeListbox() 因为它会把焦点拉回 trigger，干扰 Tab 行进。
        setOpen(false);
        setActiveIndex(-1);
        typeBufferRef.current = "";
        if (typeTimerRef.current !== null) {
          window.clearTimeout(typeTimerRef.current);
          typeTimerRef.current = null;
        }
      } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleTypeahead(e.key);
      }
    },
    [
      disabled,
      open,
      activeIndex,
      options,
      openListbox,
      closeListbox,
      commitOption,
      handleTypeahead,
      onChange
    ]
  );

  // ===================================================================
  // 渲染
  // ===================================================================
  return (
    <div
      ref={rootRef}
      className={`bl-select${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`bl-select__trigger ${triggerClassName}`}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (open) closeListbox(false);
          else openListbox("selected");
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="bl-select__value">{selected?.label ?? value}</span>
        <ChevronIcon />
      </button>
      {open
        ? createPortal(
            <ul
              ref={menuRef}
              id={listboxId}
              className="bl-select__menu bl-select__menu--portal"
              role="listbox"
              aria-label={ariaLabel}
              style={menuStyle}
            >
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === activeIndex;
                return (
                  <li
                    key={opt.value}
                    id={optionIdAt(idx)}
                    role="option"
                    aria-selected={isSelected}
                    className={`bl-select__option${isSelected ? " is-selected" : ""}${
                      isActive ? " is-active" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      // 阻止 trigger 失焦 + 避免 mousedown 外部 listener 误关。
                      e.preventDefault();
                      e.stopPropagation();
                      commitOption(idx);
                    }}
                  >
                    {opt.label}
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}

function ChevronIcon(): JSX.Element {
  return (
    <svg
      className="bl-select__chevron"
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
