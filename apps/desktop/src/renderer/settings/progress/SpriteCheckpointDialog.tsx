import { useEffect, useRef } from "react";
import type { HatchPetRowState } from "@bailin/character-protocol";
import { useT } from "../../shared/i18n/index.js";

const HATCH_LABEL_KEYS: Record<HatchPetRowState, string> = {
  idle: "distill.hatchIdle",
  "running-right": "distill.hatchRunningRight",
  "running-left": "distill.hatchRunningLeft",
  waving: "distill.hatchWaving",
  jumping: "distill.hatchJumping",
  failed: "distill.hatchFailedAnim",
  waiting: "distill.hatchWaiting",
  running: "distill.hatchRunningAnim",
  review: "distill.hatchReview"
};

export function SpriteCheckpointDialog(props: {
  failedRows: HatchPetRowState[];
  rowFailures?: Partial<Record<HatchPetRowState, string>>;
  totalCostUsd?: number;
  onRetry: () => void;
  onContinue: () => void;
  onCancel: () => void;
}): JSX.Element {
  const t = useT();
  const { failedRows, rowFailures, totalCostUsd, onRetry, onContinue, onCancel } = props;
  const retryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    retryRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sprite-checkpoint-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal" style={{ width: 560, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {t("distill.spriteCheckpointEyebrow")}
        </div>
        <div
          id="sprite-checkpoint-title"
          className="display display--section"
          style={{ marginBottom: 12 }}
        >
          {t("distill.spriteCheckpointTitle")}
        </div>
        <p className="body-sm" style={{ margin: "0 0 12px" }}>
          {t("distill.spriteCheckpointBody", { count: failedRows.length })}
        </p>
        {totalCostUsd != null && totalCostUsd > 0 ? (
          <p className="body-sm" style={{ margin: "0 0 12px", color: "var(--ink-faint)" }}>
            {t("distill.spriteCheckpointCost", { total: totalCostUsd.toFixed(3) })}
          </p>
        ) : null}
        <ul
          className="body-sm"
          style={{
            margin: "0 0 16px",
            paddingLeft: 18,
            maxHeight: 240,
            overflowY: "auto"
          }}
        >
          {failedRows.map((row) => (
            <li key={row} style={{ marginBottom: 8 }}>
              <strong>{t(HATCH_LABEL_KEYS[row])}</strong>
              {rowFailures?.[row] ? (
                <div style={{ color: "var(--ink-faint)", fontSize: 12, marginTop: 2 }}>
                  {rowFailures[row]}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="row row--end gap-2">
          <button type="button" className="btn btn--ghost" onClick={() => onCancel()} data-hint="Esc">
            {t("distill.checkpointCancel")}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onContinue()}>
            {t("distill.spriteCheckpointContinue")}
          </button>
          <button
            type="button"
            className="btn btn--magenta"
            ref={retryRef}
            onClick={() => onRetry()}
          >
            {t("distill.spriteCheckpointRetry")}
          </button>
        </div>
      </div>
    </div>
  );
}
