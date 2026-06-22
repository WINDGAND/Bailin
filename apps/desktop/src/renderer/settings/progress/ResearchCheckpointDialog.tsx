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
      <div className="modal" style={{ width: 580, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {t("distill.checkpoint1Eyebrow")}
        </div>
        <div
          id="checkpoint-title"
          className="display display--section"
          style={{ marginBottom: 12 }}
        >
          {t("distill.checkpoint1Title")}
        </div>
        {researchSummary && review ? (
          <div style={{ marginBottom: 14 }}>
            <p className="body-sm" style={{ margin: 0, fontWeight: 600 }}>
              {t("distill.checkpointReviewOneLiner", {
                ok: researchSummary.okCount,
                local: review.localMaterialAgentCount,
                supplement: supplementCount
              })}
            </p>
            <p className="body-sm" style={{ margin: "6px 0 0", color: "var(--ink-faint)" }}>
              {t("distill.checkpointResearchStats", {
                ok: researchSummary.okCount,
                failed: researchSummary.failedCount,
                seconds: Math.round(researchSummary.totalDurationMs / 1000)
              })}
            </p>
            {review.lowSourceWarning ? (
              <p className="body-sm" style={{ margin: "6px 0 0", color: "var(--amber)" }}>
                {t("distill.checkpointReviewLowSource")}
              </p>
            ) : null}
            {review.gapResearchWarning ? (
              <p className="body-sm" style={{ margin: "6px 0 0", color: "var(--amber)" }}>
                {t("distill.checkpointReviewGapWarning")}
              </p>
            ) : null}

            <details style={{ marginTop: 12 }}>
              <summary className="eyebrow" style={{ cursor: "pointer" }}>
                {t("distill.checkpointReviewDetails")}
              </summary>
              <p className="body-sm" style={{ margin: "8px 0 0" }}>
                {t("distill.checkpointReviewSources", {
                  count: review.totalUniqueUrls,
                  ratio: review.primaryRatioLabel
                })}
              </p>

              <table
                className="body-sm"
                style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}
              >
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-faint)" }}>
                    <th style={{ padding: "4px 6px 4px 0", width: 28 }} />
                    <th style={{ padding: "4px 6px" }}>#</th>
                    <th style={{ padding: "4px 6px" }}>{t("distill.checkpointReviewFindings")}</th>
                    <th style={{ padding: "4px 6px" }}>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {review.agents.map((row) => (
                    <tr key={row.agentId}>
                      <td style={{ padding: "4px 6px 4px 0" }}>
                        <input
                          type="checkbox"
                          checked={selectedAgents.has(row.agentId)}
                          onChange={() => toggleAgent(row.agentId)}
                          aria-label={t(agentNameKey(row.agentId))}
                        />
                      </td>
                      <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                        {row.agentId} {t(agentNameKey(row.agentId))}
                        <div style={{ color: "var(--ink-faint)", fontSize: 12 }}>
                          {row.status} · {row.confidence}
                          {!row.webSearchUsed ? " · local" : ""}
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px" }}>
                        {row.keyFindings.length > 0
                          ? row.keyFindings.join(" · ")
                          : t("distill.checkpointReviewNone")}
                      </td>
                      <td style={{ padding: "4px 6px" }}>{row.uniqueUrlCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {review.weakDimensions.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <div className="eyebrow">{t("distill.checkpointReviewWeak")}</div>
                  <p className="body-sm" style={{ margin: "4px 0 0" }}>
                    {review.weakDimensions.join(" · ")}
                  </p>
                </div>
              ) : null}

              {review.contradictions.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <div className="eyebrow">{t("distill.checkpointReviewContradictions")}</div>
                  <ul className="body-sm" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {review.contradictions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="body-sm" style={{ marginTop: 12, color: "var(--ink-faint)" }}>
                {t("distill.checkpointSelectAgents")}
              </p>
            </details>
          </div>
        ) : null}
        <div className="row row--end gap-2" style={{ flexDirection: "column", alignItems: "stretch" }}>
          {selectedAgents.size > 0 ? (
            <p
              className="body-sm"
              style={{ margin: "0 0 4px", color: "var(--ink-faint)", textAlign: "right" }}
            >
              {t("distill.checkpointSupplementHint")}
            </p>
          ) : null}
          <div className="row row--end gap-2">
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
