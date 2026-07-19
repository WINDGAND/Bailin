import { useId } from "react";

/** Apple-ish role=switch 开关，与用户画像 / 桌宠页共用 `.bl-switch` 样式。 */
export function BlSwitch({
  checked,
  onCheckedChange,
  labelledBy,
  disabled,
  className
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      className={className ? `bl-switch ${className}` : "bl-switch"}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="bl-switch__thumb" aria-hidden="true" />
    </button>
  );
}

/** 左文案 + 右状态词 + 开关，用于整行设置项。 */
export function BlSwitchRow({
  labelId,
  label,
  hint,
  checked,
  onCheckedChange,
  statusOn,
  statusOff,
  disabled,
  style
}: {
  labelId: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  statusOn: string;
  statusOff: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div className="bl-switch-row" style={style}>
      <div>
        <div id={labelId} className="bl-field-label">
          {label}
        </div>
        {hint ? (
          <p className="bl-field-hint" style={{ marginTop: 4, marginBottom: 0 }}>
            {hint}
          </p>
        ) : null}
      </div>
      <div className="bl-switch-row__control">
        <span className="body-sm" style={{ color: "var(--ink-soft)" }}>
          {checked ? statusOn : statusOff}
        </span>
        <BlSwitch
          checked={checked}
          onCheckedChange={onCheckedChange}
          labelledBy={labelId}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/** 发丝列表内的紧凑开关行（提醒类型等）。 */
export function BlToggleRow({
  label,
  checked,
  onCheckedChange,
  disabled
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  const labelId = useId();
  return (
    <div className="desktop-toggle-row">
      <span id={labelId} className="body-sm">
        {label}
      </span>
      <BlSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        labelledBy={labelId}
        disabled={disabled}
      />
    </div>
  );
}
