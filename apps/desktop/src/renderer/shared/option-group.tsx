import { useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

export interface OptionGroupItem<T extends string> {
  value: T;
  label: string;
  /** 卡片样式下的副文字；pill 样式可省略。 */
  caption?: string;
  /** 可选图标节点（自带 aria-hidden）。 */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface OptionGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<OptionGroupItem<T>>;
  /** 必填：屏幕阅读器朗读「{ariaLabel}, radiogroup」。 */
  ariaLabel: string;
  /** 容器额外 className（如 "forge-mode" / "segmented"），决定视觉样式。 */
  className?: string;
  /** 每个 item 额外 className（如 "forge-mode__card" / "segmented__item"）。 */
  itemClassName?: string;
  /** active 状态额外 className，默认 "is-active"。 */
  activeClassName?: string;
  /**
   * 渲染 item 内容的自定义 render；默认渲染：
   *   <span className="forge-mode__title">{label}</span>
   *   {caption && <span className="forge-mode__caption">{caption}</span>}
   * 调用方可覆盖以控制 markup（例如换 class）。
   */
  renderItem?: (item: OptionGroupItem<T>) => ReactNode;
}

/**
 * 单选选项组（卡片 / pill / segmented control 通用）。
 *
 * 遵循 W3C ARIA APG radiogroup pattern：
 *   https://www.w3.org/WAI/ARIA/apg/patterns/radio/
 *
 * 行为：
 * - container: role="radiogroup" + aria-label
 * - item: role="radio" + aria-checked + roving tabIndex（只 active 项 tabIndex=0）
 * - ArrowLeft/Up: 移到上一项并立即选中（标准 radio behavior：selection follows focus）
 * - ArrowRight/Down: 移到下一项并立即选中
 * - Home/End: 跳首/末项并选中
 * - Space/Enter: 当前 focused 项已是 active 时无操作，否则选中
 *
 * 使用例：
 *   <OptionGroup
 *     value={locale}
 *     onChange={setLocale}
 *     ariaLabel={t("language.sectionLabel")}
 *     options={[
 *       { value: "zh", label: "中文", caption: "..." },
 *       { value: "en", label: "English", caption: "..." }
 *     ]}
 *     className="forge-mode"
 *     itemClassName="forge-mode__card"
 *   />
 */
export function OptionGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  itemClassName,
  activeClassName = "is-active",
  renderItem
}: OptionGroupProps<T>): JSX.Element {
  const buttonsRef = useRef<Map<T, HTMLButtonElement>>(new Map());

  const moveTo = useCallback(
    (nextValue: T) => {
      if (nextValue === value) return;
      const opt = options.find((o) => o.value === nextValue);
      if (!opt || opt.disabled) return;
      onChange(nextValue);
      // 同时把焦点物理移过去（roving tabIndex 模式）。
      window.setTimeout(() => buttonsRef.current.get(nextValue)?.focus(), 0);
    },
    [onChange, options, value]
  );

  const findEnabledIndex = useCallback(
    (start: number, dir: 1 | -1): number => {
      const n = options.length;
      for (let i = 1; i <= n; i++) {
        const idx = (start + dir * i + n) % n;
        if (!options[idx]!.disabled) return idx;
      }
      return start;
    },
    [options]
  );

  const onItemKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, currentIdx: number) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = findEnabledIndex(currentIdx, 1);
        moveTo(options[next]!.value);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = findEnabledIndex(currentIdx, -1);
        moveTo(options[next]!.value);
      } else if (e.key === "Home") {
        e.preventDefault();
        const next = options.findIndex((o) => !o.disabled);
        if (next >= 0) moveTo(options[next]!.value);
      } else if (e.key === "End") {
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i]!.disabled) {
            moveTo(options[i]!.value);
            break;
          }
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!options[currentIdx]!.disabled) moveTo(options[currentIdx]!.value);
      }
    },
    [findEnabledIndex, moveTo, options]
  );

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={className}>
      {options.map((opt, idx) => {
        const isActive = opt.value === value;
        const classNames = [
          itemClassName,
          isActive ? activeClassName : ""
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={opt.disabled}
            className={classNames || undefined}
            ref={(el) => {
              if (el) buttonsRef.current.set(opt.value, el);
              else buttonsRef.current.delete(opt.value);
            }}
            onClick={() => {
              if (!opt.disabled) moveTo(opt.value);
            }}
            onKeyDown={(e) => onItemKeyDown(e, idx)}
          >
            {renderItem ? (
              renderItem(opt)
            ) : (
              <>
                {opt.icon}
                <span className="forge-mode__title">{opt.label}</span>
                {opt.caption ? <span className="forge-mode__caption">{opt.caption}</span> : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
