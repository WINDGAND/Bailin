import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

interface FieldHelpProps {
  /** 多行帮助文案；支持 \n 换行 */
  content: string;
  /** 可选外链，显示在 popover 底部 */
  linkHref?: string;
  linkLabel?: string;
}

function computePopoverStyle(
  trigger: DOMRect,
  popoverWidth: number,
  popoverHeight: number
): CSSProperties {
  const gap = 10;
  const pad = 12;

  let left = trigger.right + gap;
  let top = trigger.top + trigger.height / 2;
  let transform = "translateY(-50%)";

  if (left + popoverWidth > window.innerWidth - pad) {
    left = trigger.left - gap;
    transform = "translate(-100%, -50%)";
  }

  const visualLeft = transform.startsWith("translate(-100%")
    ? left - popoverWidth
    : left;

  if (visualLeft < pad) {
    left = trigger.left + trigger.width / 2;
    top = trigger.bottom + gap;
    transform = "translateX(-50%)";
  }

  if (transform === "translateX(-50%)" && top + popoverHeight > window.innerHeight - pad) {
    top = trigger.top - gap;
    transform = "translate(-50%, -100%)";
  }

  return {
    position: "fixed",
    top,
    left,
    transform,
    zIndex: 10000,
    visibility: "visible"
  };
}

export function FieldHelp({ content, linkHref, linkLabel }: FieldHelpProps): JSX.Element {
  const popoverId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number>();
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const show = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    hideTimer.current = window.setTimeout(() => setOpen(false), 80);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const popover = popoverRef.current.getBoundingClientRect();
    setPopoverStyle(
      computePopoverStyle(trigger, popover.width || 280, popover.height || 72)
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, content, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={popoverRef}
            id={popoverId}
            className="bl-field-help__popover"
            role="tooltip"
            style={popoverStyle}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
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
          </span>,
          document.body
        )
      : null;

  return (
    <span
      ref={rootRef}
      className="bl-field-help"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        ref={triggerRef}
        type="button"
        className="bl-field-help__trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label="帮助"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {popover}
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
