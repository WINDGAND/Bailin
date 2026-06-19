import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

interface FieldHelpProps {
  /** 多行帮助文案；支持 \n 换行 */
  content: string;
  /** 可选外链，显示在 popover 底部 */
  linkHref?: string;
  linkLabel?: string;
}

export function FieldHelp({ content, linkHref, linkLabel }: FieldHelpProps): JSX.Element {
  const popoverId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="bl-field-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="bl-field-help__trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label="帮助"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? (
        <span id={popoverId} className="bl-field-help__popover" role="tooltip">
          {content.split("\n").map((line, i) => (
            <span key={i} className="bl-field-help__line">
              {line}
            </span>
          ))}
          {linkHref && linkLabel ? (
            <a
              className="bl-field-help__link"
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {linkLabel}
            </a>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

interface FieldLabelProps {
  htmlFor?: string;
  children: ReactNode;
  help?: string;
  helpLinkHref?: string;
  helpLinkLabel?: string;
  className?: string;
}

export function FieldLabel({
  htmlFor,
  children,
  help,
  helpLinkHref,
  helpLinkLabel,
  className
}: FieldLabelProps): JSX.Element {
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag htmlFor={htmlFor} className={className ?? "bl-field-label bl-field-label--inline"}>
      {children}
      {help ? (
        <FieldHelp content={help} linkHref={helpLinkHref} linkLabel={helpLinkLabel} />
      ) : null}
    </Tag>
  );
}
