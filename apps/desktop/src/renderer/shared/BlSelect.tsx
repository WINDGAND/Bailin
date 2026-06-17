import { useEffect, useId, useRef, useState } from "react";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`bl-select${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
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
      {open ? (
        <ul id={listboxId} className="bl-select__menu" role="listbox">
          {options.map((opt) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`bl-select__option${opt.value === value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
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
