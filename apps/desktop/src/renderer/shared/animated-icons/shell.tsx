import type { HTMLAttributes, ReactNode } from "react";

export const ANIMATED_ICON_STROKE = 1.7;

export interface AnimatedIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
}

export function AnimatedIconShell({
  size,
  className,
  children,
  ...props
}: AnimatedIconProps & { size: number; children: ReactNode }): JSX.Element {
  return (
    <span
      className={["bl-animated-icon", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
      {...props}
    >
      {children}
    </span>
  );
}
