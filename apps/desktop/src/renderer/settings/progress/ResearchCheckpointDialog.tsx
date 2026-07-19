import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchAgentId } from "@bailin/character-protocol";
import type { ResearchReviewAgentRow, ResearchSummaryPayload } from "../../../shared/ipc-contract.js";
import { useT } from "../../shared/i18n/index.js";
import { agentNameKey } from "./distillation-phase-i18n.js";

function isSupplementCandidate(row: ResearchReviewAgentRow): boolean {
  if (row.status !== "ok") return true;
  if (row.confidence === "low") return true;
  if (!row.webSearchUsed && row.status === "ok") return false;
  if (row.uniqueUrlCount === 0 && row.status === "ok") return true;
  return false;
}

export function ResearchCheckpointDialog(props: {
  researchSummary: ResearchSummaryPayload | null;
  onApprove: () => void;
  onSupplement: (agentIds: ResearchAgentId[]) => void;
  onCancel: () => void;
}): JSX.Element {
  const t = useT();
  const { researchSummary, onApprove, onSupplement, onCancel } = props;
  const approveRef = useRef<HTMLButtonElement | null>(null);
  const review = researchSummary?.review;

  const defaultSelected = useMemo(() => {
    if (!review) return new Set<ResearchAgentId>();
    const ids = new Set<ResearchAgentId>();
    for (const row of review.agents) {
      if (isSupplementCandidate(row)) {
        ids.add(row.agentId);
      }
    }
    return ids;
  }, [review]);

  const supplementCount = useMemo(() => {
    if (!review) return 0;
    return review.agents.filter(isSupplementCandidate).length;
  }, [review]);

  const [selectedAgents, setSelectedAgents] = useState<Set<ResearchAgentId>>(defaultSelected);

  useEffect(() => {
    setSelectedAgents(defaultSelected);
  }, [defaultSelected]);

  useEffect(() => {
    approveRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onApprove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onApprove, onCancel]);

  function toggleAgent(id: ResearchAgentId): void {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedAgents = useMemo(() => {
    if (!review) return [];
    return [...review.agents].sort((a, b) => a.agentId - b.agentId);
  }, [review]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkpoint-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal checkpoint-dialog">
        <div className="eyebrow checkpoint-dialog__eyebrow">
          {t("distill.checkpoint1Eyebrow")}
        </div>
        <div id="checkpoint-title" className="display display--section checkpoint-dialog__title">
          {t("distill.checkpoint1Title")}
        </div>

        {researchSummary && review ? (
          <div className="checkpoint-dialog__body">
            <div className="checkpoint-dialog__stats">
              <p className="checkpoint-dialog__stat checkpoint-dialog__stat--strong">
                {t("distill.checkpointReviewOneLiner", {
                  ok: researchSummary.okCount,
                  local: review.localMaterialAgentCount,
                  supplement: supplementCount
                })}
              </p>
              <p className="checkpoint-dialog__stat">
                {t("distill.checkpointResearchStats", {
                  ok: researchSummary.okCount,
                  failed: researchSummary.failedCount,
                  seconds: Math.round(researchSummary.totalDurationMs / 1000)
                })}
              </p>
              {review.lowSourceWarning ? (
                <p className="checkpoint-dialog__stat checkpoint-dialog__stat--warn">
                  {t("distill.checkpointReviewLowSource")}
                </p>
              ) : null}
              {review.gapResearchWarning ? (
                <p className="checkpoint-dialog__stat checkpoint-dialog__stat--warn">
                  {t("distill.checkpointReviewGapWarning")}
                </p>
              ) : null}
            </div>

            <ul className="checkpoint-agent-list" aria-label={t("distill.checkpointSelectAgents")}>
              {sortedAgents.map((row) => {
                const selected = selectedAgents.has(row.agentId);
                const indexLabel = String(row.agentId).padStart(2, "0");
                const findings =
                  row.keyFindings.length > 0
                    ? row.keyFindings.join(" · ")
                    : t("distill.checkpointReviewNone");
                const metaParts = [
                  row.status,
                  row.confidence,
                  !row.webSearchUsed ? "local" : null,
                  t("distill.checkpointReviewUrlCount", { count: row.uniqueUrlCount })
                ].filter(Boolean);

                return (
                  <li
                    key={row.agentId}
                    className={`checkpoint-agent-item${selected ? " is-selected" : ""}${
                      isSupplementCandidate(row) ? " is-weak" : ""
                    }`}
                  >
                    <label className="checkpoint-agent-row">
                      <input
                        type="checkbox"
                        className="checkpoint-agent-check"
                        checked={selected}
                        onChange={() => toggleAgent(row.agentId)}
                        aria-label={t(agentNameKey(row.agentId))}
                      />
                      <span className="checkpoint-agent-index" aria-hidden="true">
                        {indexLabel}
                      </span>
                      <span className="checkpoint-agent-main">
                        <span className="checkpoint-agent-title-row">
                          <span className="checkpoint-agent-title">
                            {t(agentNameKey(row.agentId))}
                          </span>
                          <span className="checkpoint-agent-meta">{metaParts.join(" · ")}</span>
                        </span>
                        <span className="checkpoint-agent-finding">{findings}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {review.contradictions.length > 0 ? (
              <section className="checkpoint-dialog__signals" aria-labelledby="checkpoint-conflicts">
                <h4 className="checkpoint-dialog__signals-title" id="checkpoint-conflicts">
                  {t("distill.checkpointReviewContradictions")}
                </h4>
                <ul className="checkpoint-dialog__signals-list">
                  {review.contradictions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <details className="checkpoint-dialog__more">
              <summary className="checkpoint-dialog__more-summary">
                {t("distill.checkpointReviewDetails")}
              </summary>
              <div className="checkpoint-dialog__more-body">
                <p className="checkpoint-dialog__stat">
                  {t("distill.checkpointReviewSources", {
                    count: review.totalUniqueUrls,
                    ratio: review.primaryRatioLabel
                  })}
                </p>
                {review.weakDimensions.length > 0 ? (
                  <div className="checkpoint-dialog__weak">
                    <div className="checkpoint-dialog__weak-title">
                      {t("distill.checkpointReviewWeak")}
                    </div>
                    <p className="checkpoint-dialog__stat">
                      {review.weakDimensions.join(" · ")}
                    </p>
                  </div>
                ) : null}
              </div>
            </details>

            <p className="checkpoint-dialog__hint">{t("distill.checkpointSelectAgents")}</p>
          </div>
        ) : null}

        <div className="checkpoint-dialog__actions">
          {selectedAgents.size > 0 ? (
            <p className="checkpoint-dialog__actions-hint">
              {t("distill.checkpointSupplementHint")}
            </p>
          ) : null}
          <div className="checkpoint-dialog__actions-row">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onCancel()}
              data-hint="Esc"
            >
              {t("distill.checkpointCancel")}
            </button>
            {selectedAgents.size > 0 ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onSupplement(Array.from(selectedAgents).sort((a, b) => a - b))}
              >
                {t("distill.checkpointSupplement")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--magenta"
              ref={approveRef}
              onClick={() => onApprove()}
              data-hint="Enter"
            >
              {t("distill.checkpointApprove")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
