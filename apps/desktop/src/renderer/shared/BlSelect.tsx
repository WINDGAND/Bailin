import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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
  const listboxId = `${id ?? autoId}-listbox`;
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

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

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById(listboxId);
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, listboxId]);

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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span className="bl-select__value">{selected?.label ?? value}</span>
        <ChevronIcon />
      </button>
      {open
        ? createPortal(
            <ul
              id={listboxId}
              className="bl-select__menu bl-select__menu--portal"
              role="listbox"
              style={menuStyle}
            >
              {options.map((opt) => (
                <li key={opt.value} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    className={`bl-select__option${opt.value === value ? " is-selected" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
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
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
