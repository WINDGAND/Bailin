import type { ReactNode } from "react";

/**
 * 自绘 icon set，遵循 phosphor-light / remix-line 风格：
 *   - viewBox 24x24
 *   - stroke 1.7px（轻盈，避免 Material thick-stroked 「廉价感」）
 *   - linecap / linejoin = round
 *   - fill="none" 默认；点状/字符型 icon 显式 fill="currentColor"
 *
 * 添加新 icon 步骤：
 *   1. 在 ICON_PATHS 加 key + path content（path/circle 元素）
 *   2. 把 key 加入 IconName union type
 *   3. 调用方用 <Icon name="..." size={...} />
 */
export type IconName =
  | "close"
  | "more-horizontal"
  | "chevron-right"
  | "chevron-down"
  | "dot"
  | "plus"
  | "edit"
  | "trash"
  | "search"
  | "sparkle"
  | "play";

const ICON_PATHS: Record<IconName, ReactNode> = {
  close: <path d="M6 6l12 12M18 6L6 18" />,

  // 三个水平点 ⋯（phosphor "DotsThree" 风格）
  "more-horizontal": (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),

  // 右指三角，菜单 submenu 用
  "chevron-right": <path d="M9 6l6 6-6 6" />,

  "chevron-down": <path d="M6 9l6 6 6-6" />,

  // 实心小圆点（active state 标记，替代 unicode ●）
  dot: <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />,

  plus: <path d="M12 5v14M5 12h14" />,

  edit: (
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  ),

  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />,

  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),

  // 闪光 / sparkle，新创建 / 首次破壳 等 invitation 场景
  sparkle: (
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16z" />
  ),

  play: <path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none" />
};

export interface IconProps {
  name: IconName;
  /** px 边长，默认 16。 */
  size?: number;
  /** stroke 宽度覆盖；默认 1.7。 */
  strokeWidth?: number;
  className?: string;
  /**
   * 默认 true：icon 是装饰，aria-hidden 隐藏，父元素需自带可读 label。
   * 设为 false 时：icon 自带 role="img" + 必须传 ariaLabel。
   */
  decorative?: boolean;
  /** 非装饰 icon 的 SR 朗读文字。 */
  ariaLabel?: string;
  /** 内联 style（与 className 二选一为佳）。 */
  style?: React.CSSProperties;
}

/**
 * 统一 icon 组件。所有产品图标走这里，杜绝散落 inline SVG 与字符 fallback。
 *
 * 示例：
 *   <Icon name="close" size={16} />
 *   <Icon name="more-horizontal" size={18} decorative={false} ariaLabel="More actions" />
 */
export function Icon({
  name,
  size = 16,
  strokeWidth = 1.7,
  className,
  decorative = true,
  ariaLabel,
  style
}: IconProps): JSX.Element {
  const ariaProps = decorative
    ? { "aria-hidden": true as const, focusable: "false" as const }
    : { role: "img" as const, "aria-label": ariaLabel };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...ariaProps}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
