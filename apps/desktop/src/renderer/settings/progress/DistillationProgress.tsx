import { useEffect, useMemo, useState } from "react";
import type {
  HatchPetRowState,
  QualityReport
} from "@bailin/character-protocol";
import { HATCH_PET_ROW_STATES } from "@bailin/character-protocol";
import type {
  ResearchSummaryPayload,
  SynthesisSummaryPayload
} from "../../../shared/ipc-contract.js";
import { CopyButton, Spinner } from "../../shared/feedback.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import { agentNameKey, translatePhaseMessage } from "./distillation-phase-i18n.js";
import { DistillationStageRail } from "./DistillationStageRail.js";
import { useDistillationJobs } from "../app/distillation-job-context.js";
import type {
  AgentCardState,
  HatchJobState,
  HatchJobStatus,
  HatchPanelState
} from "./progress-content-model.js";

type TFn = (key: string, params?: Record<string, string | number>) => string;

const ACTIVITY_HINT_KEYS = [
  "distill.hint0",
  "distill.hint1",
  "distill.hint2",
  "distill.hint3",
  "distill.hint4"
] as const;

interface Props {
  jobId: string;
  characterName: string;
  track: "utility" | "companion";
  onComplete: () => void;
  onCancel: () => void;
}

export function DistillationProgress({
  jobId,
  characterName,
  track,
  onComplete,
  onCancel
}: Props): JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  // 阶段条 + 内容区都从 DistillationJobProvider 读：设置页 key={tab} 会卸载本组件，
  // 但 Provider 不卸，切回来时步骤 4/5（外貌 / 绘制形象）等已发生事件不会丢。
  const {
    stageDisplay,
    progressContent,
    phaseLabel,
    bannerStatus,
    failureReason,
    isSkeleton,
    researchSummary
  } = useDistillationJobs();
  const {
    agents,
    warnings,
    synthSummary,
    qualityReport,
    appearanceReady,
    hatchState
  } = progressContent;
  const [hintIndex, setHintIndex] = useState(0);

  const finalState = useMemo(() => {
    if (bannerStatus === "done") {
      return { kind: "done" as const, isSkeleton: Boolean(isSkeleton) };
    }
    if (bannerStatus === "failed") {
      return { kind: "failed" as const, reason: failureReason ?? "" };
    }
    if (bannerStatus === "cancelled") {
      return { kind: "cancelled" as const };
    }
    return null;
  }, [bannerStatus, failureReason, isSkeleton]);

  const running = finalState == null;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setHintIndex((i) => (i + 1) % ACTIVITY_HINT_KEYS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [running]);

  const displayPhase = translatePhaseMessage(phaseLabel, t, locale);

  return (
    <div>
      <div className="eyebrow">{t("distill.eyebrow")}</div>
      <div className="display display--page" style={{ marginBottom: 6 }}>
        {t("distill.title", { name: characterName })}
      </div>
      <p className="body-sm" style={{ margin: "0 0 16px" }}>
        {displayPhase}
      </p>

      <DistillationStageRail
        activeIndex={stageDisplay.activeIndex}
        isResynthesizing={stageDisplay.isResynthesizing}
        resynthesisRound={stageDisplay.resynthesisRound}
        forceAllDone={finalState?.kind === "done"}
        activityHint={running ? t(ACTIVITY_HINT_KEYS[hintIndex]!) : null}
      />

      <ResearchAgentsSection agents={agents} researchSummary={researchSummary} />

      {synthSummary ? (
        <div className="card fade-in" style={{ padding: 14, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {t("distill.stepTitle", { n: 2, label: t("distill.stageSynthesizing") })}
          </div>
          <p className="body-sm" style={{ margin: "0 0 10px", color: "var(--ink-faint)" }}>
            {t("distill.phase2Hint")}
          </p>
          <SummaryGrid summary={synthSummary} track={track} />
        </div>
      ) : null}

      {stageDisplay.activeIndex > 2 ? (
        <section className="distill-step fade-in">
          <header className="distill-step__head">
            <span className="distill-step__title">
              {t("distill.stepTitle", { n: 3, label: t("distill.stageBuildingCard") })}
            </span>
          </header>
          <p className="distill-step__body">{t("distill.buildingCardDone")}</p>
        </section>
      ) : null}

      {appearanceReady ? (
        <section className="distill-step fade-in">
          <header className="distill-step__head">
            <span className="distill-step__title">
              {t("distill.stepTitle", { n: 4, label: t("distill.stageResearchingAppearance") })}
            </span>
          </header>
          <p className="distill-step__body">{t("distill.appearanceReady")}</p>
        </section>
      ) : null}

      {hatchState.started ? <HatchPanel state={hatchState} /> : null}

      {qualityReport ? <QualityReportCard report={qualityReport} track={track} /> : null}

      {(() => {
        const notes = filterUserVisibleNotes(warnings, t);
        if (notes.length === 0) return null;
        return (
          <details
            style={{
              padding: 10,
              borderRadius: 10,
              background: "rgba(31,58,58,0.04)",
              border: "1px solid var(--grid-strong)",
              marginBottom: 16
            }}
          >
            <summary
              className="eyebrow"
              style={{ cursor: "pointer", color: "var(--ink-soft)" }}
            >
              {t("distill.processNotes", { count: notes.length })}
            </summary>
            <ul className="body-sm" style={{ margin: "8px 0 0 16px", padding: 0 }}>
              {notes.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        );
      })()}

      {finalState ? (
        <div className="card fade-in-up" style={{ padding: 20 }}>
          {finalState.kind === "done" ? (
            <>
              <div className="display display--section" style={{ marginBottom: 8 }}>
                {finalState.isSkeleton ? t("distill.doneSkeleton") : t("distill.doneComplete")}
              </div>
              <p className="body-md" style={{ margin: "0 0 12px" }}>
                {t("distill.doneBody")}
              </p>
              <div className="row row--end gap-2">
                <button className="btn btn--magenta" onClick={() => onComplete()}>
                  {t("distill.goToLibrary")}
                </button>
              </div>
            </>
          ) : finalState.kind === "failed" ? (
            <>
              <div
                className="display display--section"
                style={{ marginBottom: 8, color: "var(--magenta)" }}
              >
                {t("distill.failedTitle")}
              </div>
              <p className="body-md" style={{ margin: "0 0 12px" }}>
                {userFacingProcessMessage(finalState.reason, t)}
              </p>
              <div className="row row--end gap-2">
                <CopyButton
                  small
                  text={buildErrorReport(jobId, characterName, finalState.reason, warnings, t)}
                  label={t("distill.copyErrorLog")}
                />
                <button className="btn btn--ghost" onClick={() => onCancel()}>
                  {t("distill.back")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="display display--section" style={{ marginBottom: 8 }}>
                {t("distill.cancelledTitle")}
              </div>
              <div className="row row--end gap-2">
                <button className="btn btn--ghost" onClick={() => onCancel()}>
                  {t("distill.back")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="row row--end gap-2">
          <button className="btn btn--ghost" onClick={() => onCancel()}>
            {t("distill.cancelDistillation")}
          </button>
        </div>
      )}

    </div>
  );
}

function buildErrorReport(
  jobId: string,
  characterName: string,
  reason: string,
  warnings: string[],
  t: TFn
): string {
  const lines = [
    t("distill.errorReportTitle"),
    ``,
    t("distill.errorReportCharacter", { name: characterName }),
    t("distill.errorReportJobId", { jobId }),
    t("distill.errorReportTime", { time: new Date().toISOString() }),
    ``,
    t("distill.errorReportReason"),
    userFacingProcessMessage(reason, t),
    ``
  ];
  if (warnings.length > 0) {
    lines.push(
      t("distill.errorReportWarnings", { count: warnings.length }),
      ...filterUserVisibleNotes(warnings, t).map((w) => `- ${w}`)
    );
  }
  return lines.join("\n");
}

/**
 * 阶段一调研列表 —— 默认展开为扁平发丝行（与角色仓库「调研档案」同构），
 * 可手动收起成一行摘要。不再用 2×3 卡片墙。
 */
function ResearchAgentsSection({
  agents,
  researchSummary
}: {
  agents: AgentCardState[];
  researchSummary: ResearchSummaryPayload | null;
}): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(true);
  const doneCount = agents.filter((a) => a.status !== "pending" && a.status !== "running").length;

  const summaryText = researchSummary
    ? t("distill.researchCollapsedSummary", {
        ok: researchSummary.okCount,
        failedPart:
          researchSummary.failedCount > 0
            ? t("distill.researchCollapsedFailedPart", { count: researchSummary.failedCount })
            : ""
      })
    : t("distill.researchCollapsedRunning", { done: doneCount });

  return (
    <details
      className="distill-collapse fade-in"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="distill-collapse__summary">
        <span className="distill-collapse__summary-text">
          <strong>{t("distill.stepTitle", { n: 1, label: t("distill.stageResearching") })}</strong>
          <span className="distill-collapse__summary-meta">{summaryText}</span>
        </span>
        <span className="distill-collapse__toggle">
          {open ? t("distill.hideDetails") : t("distill.viewDetails")}
        </span>
      </summary>
      <div className="distill-collapse__body">
        <ul className="distill-agent-list">
          {agents.map((a) => (
            <AgentRow key={a.agentId} state={a} />
          ))}
        </ul>
      </div>
    </details>
  );
}

function AgentRow({ state }: { state: AgentCardState }): JSX.Element {
  const t = useT();
  const displayName = t(agentNameKey(state.agentId)) || state.agentName;
  const indexLabel = String(state.agentId).padStart(2, "0");

  let detail: string | null = null;
  let detailTone: "ok" | "error" | "muted" = "muted";

  if (state.status === "running") {
    detail = t("distill.agentCallingLlm");
  } else if (state.status === "pending") {
    detail = t("distill.agentPending");
  } else if (state.status === "cancelled") {
    detail = t("distill.agentCancelled");
  } else if (
    state.status === "ok" ||
    state.status === "timeout" ||
    state.status === "error"
  ) {
    detail = [
      t("distill.agentDuration", {
        seconds: Math.round((state.durationMs ?? 0) / 1000)
      }),
      state.webSearchUsed ? t("distill.agentSourcesOk") : t("distill.agentSourcesPending"),
      state.confidence ? `· ${state.confidence}` : "",
      state.sourcesCount != null
        ? t("distill.agentSourcesCount", { count: state.sourcesCount })
        : ""
    ]
      .filter(Boolean)
      .join(" ");
    detailTone = state.status === "ok" ? "ok" : "error";
  }

  const errorText = state.errorMessage
    ? userFacingProcessMessage(state.errorMessage, t)
    : null;

  return (
    <li className="distill-agent-item" data-status={state.status}>
      <div className="distill-agent-row">
        <span className="distill-agent-index" aria-hidden="true">
          {indexLabel}
        </span>
        <div className="distill-agent-main">
          <div className="distill-agent-title-row">
            <span className="distill-agent-title">{displayName}</span>
            <span
              className="distill-agent-status"
              data-status={state.status}
              aria-label={labelOf(state.status, t)}
            >
              {state.status === "running" ? <Spinner /> : null}
              {labelOf(state.status, t)}
            </span>
          </div>
          {detail ? (
            <p className="distill-agent-detail" data-tone={detailTone}>
              {detail}
            </p>
          ) : null}
          {errorText ? (
            <p
              className="distill-agent-detail"
              data-tone={state.status === "ok" ? "ok" : "error"}
            >
              {errorText}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * 把后端推过来的 warnings 数组过滤+翻译成"对用户真正有用"的笔记。
 *   - 丢弃只针对开发者的内部诊断行（[step3·hatch] / [phase3b·…] 之类）
 *   - 丢弃纯英文堆栈、纯技术词
 *   - 同义合并：联网类的几条只保留最后一条，避免刷屏
 */
function filterUserVisibleNotes(raw: string[], t: TFn): string[] {
  const out: string[] = [];
  let seenWebSearchNote = false;
  for (const r of raw) {
    const text = r.trim();
    if (!text) continue;
    if (/^\[(step|phase|hatch|name|quote|programmatic|debug)/i.test(text)) continue;
    if (
      /search-preview|web_search|annotations|citation|url_citation|web_search_options|baseUrl|联网|网页来源/i.test(
        text
      )
    ) {
      if (seenWebSearchNote) continue;
      seenWebSearchNote = true;
    }
    const friendly = userFacingProcessMessage(text, t);
    if (friendly && !out.includes(friendly)) out.push(friendly);
  }
  return out;
}

function userFacingProcessMessage(raw: string, t: TFn): string {
  const text = raw.trim();
  if (
    /search-preview|web_search|annotations|citation|url_citation|web_search_options|baseUrl/i.test(
      text
    )
  ) {
    return t("distill.msgNoWebSources");
  }
  if (/401|403|unauthorized|invalid api key|AUTH_FAILED/i.test(text)) {
    return t("distill.msgAuthFailed");
  }
  if (/429|rate limit|RATE_LIMITED/i.test(text)) {
    return t("distill.msgRateLimited");
  }
  if (/abort|timeout|timed out|超时/i.test(text)) {
    return t("distill.msgTimeout");
  }
  if (/[{}<>]|stack|Error:|TypeError|\bcode\b/i.test(text)) {
    return t("distill.msgGeneric");
  }
  return text.length > 140 ? text.slice(0, 140) + "…" : text;
}

function labelOf(s: AgentCardState["status"], t: TFn): string {
  switch (s) {
    case "pending":
      return t("distill.statusPending");
    case "running":
      return t("distill.statusRunning");
    case "ok":
      return t("distill.statusOk");
    case "timeout":
      return t("distill.statusTimeout");
    case "error":
      return t("distill.statusError");
    case "skipped":
      return t("distill.statusSkipped");
    case "cancelled":
      return t("distill.statusCancelled");
  }
}

function SummaryGrid({
  summary,
  track
}: {
  summary: SynthesisSummaryPayload;
  track: "utility" | "companion";
}): JSX.Element {
  const t = useT();
  const companion = track === "companion";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SummaryRow label={t("distill.summaryMentalModels")} items={summary.mentalModelNames} t={t} />
      {!companion ? (
        <div className="body-sm">
          {t("distill.summaryHeuristics", { count: summary.heuristicsCount })}
        </div>
      ) : (
        <div className="body-sm" style={{ color: "var(--ink-faint)" }}>
          {t("distill.summaryHeuristicsCompanion", { count: summary.heuristicsCount })}
        </div>
      )}
      <SummaryRow label={t("distill.summarySignatures")} items={summary.expressionSignatures} t={t} />
      <SummaryRow
        label={t("distill.summaryForbidden")}
        items={summary.expressionForbidden}
        muted
        t={t}
      />
      <SummaryRow label={t("distill.summaryTensions")} items={summary.tensions} t={t} />
      {!companion ? (
        <SummaryRow label={t("distill.summaryHonesty")} items={summary.honestyNotes} muted t={t} />
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  items,
  muted,
  t
}: {
  label: string;
  items: string[];
  muted?: boolean;
  t: TFn;
}): JSX.Element {
  return (
    <div>
      <span className="eyebrow" style={{ marginRight: 6 }}>
        {label}
      </span>
      <span
        className="body-sm"
        style={{ color: muted ? "var(--ink-faint)" : "var(--ink-soft)" }}
      >
        {items.length === 0 ? t("distill.summaryEmpty") : items.join(" · ")}
      </span>
    </div>
  );
}

/**
 * 质量自检 —— verdict/总分永远可见；明细为扁平发丝列表（与仓库质量指标同构）。
 */
function QualityReportCard({
  report,
  track
}: {
  report: QualityReport;
  track: "utility" | "companion";
}): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const companion = track === "companion";
  const scorePct = Math.round(report.overallScore * 100);

  return (
    <details
      className="distill-collapse distill-quality fade-in"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="distill-collapse__summary">
        <span className="distill-collapse__summary-text">
          <strong>
            {t("distill.stepTitle", { n: 6, label: t("distill.stageQualityCheck") })}
          </strong>
          <span
            className="distill-quality__verdict"
            data-verdict={report.verdict}
          >
            {report.verdict.toUpperCase()}
            {" · "}
            {t("library.debugScore", { score: scorePct })}
            {report.synthesisRounds && report.synthesisRounds > 1
              ? t("distill.phase4SynthesisRounds", { rounds: report.synthesisRounds })
              : ""}
          </span>
        </span>
        <span className="distill-collapse__toggle">
          {open ? t("distill.hideDetails") : t("distill.viewDetails")}
        </span>
      </summary>

      <div className="distill-collapse__body">
        <ul className="quality-metrics__list distill-quality__list">
          {report.items.map((it) => (
            <li
              key={it.id}
              className="quality-metrics__item"
              data-pass={it.pass ? "true" : "false"}
            >
              <div className="quality-metrics__row">
                <span
                  className="quality-metrics__mark"
                  data-pass={it.pass ? "true" : "false"}
                  aria-label={it.pass ? t("library.qualityItemPass") : t("library.qualityItemFail")}
                >
                  <span aria-hidden="true">{it.pass ? "✓" : "✗"}</span>
                </span>
                <span className="quality-metrics__label">{it.label}</span>
                <p className="quality-metrics__reason" title={it.reason}>
                  {it.reason}
                </p>
                {!it.pass ? (
                  <div className="quality-metrics__bar" aria-hidden="true">
                    <span
                      className="quality-metrics__bar-fill"
                      style={{ width: `${Math.round(it.score * 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {report.voiceTest ? (
          <details className="distill-quality__nested">
            <summary className="distill-quality__nested-summary">
              {t("distill.voiceTestSummary", { score: report.voiceTest.score })}
            </summary>
            <blockquote className="quality-metrics__voice-quote">
              {report.voiceTest.sample}
            </blockquote>
            {report.voiceTest.critique.trim() ? (
              <p className="quality-metrics__voice-critique">
                {t("distill.voiceCritique", { text: report.voiceTest.critique })}
              </p>
            ) : null}
          </details>
        ) : null}

        {report.sanityTest ? (
          <details
            className="distill-quality__nested"
            open={!companion ? undefined : false}
          >
            <summary className="distill-quality__nested-summary">
              {companion
                ? t("distill.sanityTestSummaryCompanion", {
                    score: report.sanityTest.averageScore
                  })
                : t("distill.sanityTestSummary", {
                    score: report.sanityTest.averageScore
                  })}
            </summary>
            <ul className="distill-quality__qa-list">
              {report.sanityTest.questions.map((q, i) => (
                <li key={i} className="distill-quality__qa-item" data-pass={q.pass ? "true" : "false"}>
                  <div className="distill-quality__qa-q">
                    {t("distill.sanityQuestionLine", { n: i + 1, question: q.question })}
                    {" · "}
                    {q.score}/10
                  </div>
                  <div className="distill-quality__qa-a">
                    {t("distill.sanityAnswerLine", { answer: q.answer.slice(0, 200) })}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {report.edgeTest ? (
          <details
            className="distill-quality__nested"
            open={!companion ? undefined : false}
          >
            <summary className="distill-quality__nested-summary">
              {t("distill.edgeTestSummary", { score: report.edgeTest.score })}
            </summary>
            <p className="distill-quality__qa-q">
              {t("distill.edgeQuestionLine", { question: report.edgeTest.question })}
            </p>
            <p className="distill-quality__qa-a" style={{ whiteSpace: "pre-wrap" }}>
              {report.edgeTest.answer}
            </p>
            {report.edgeTest.critique.trim() ? (
              <p className="quality-metrics__voice-critique">{report.edgeTest.critique}</p>
            ) : null}
          </details>
        ) : null}

        {report.synthesisRounds && report.synthesisRounds > 1 ? (
          <p className="distill-quality__note">{t("distill.phase4ResynthesisNote")}</p>
        ) : null}
      </div>
    </details>
  );
}

// ===== Hatch-pet QA 面板 =====

const HATCH_LABEL_KEYS: Record<HatchPetRowState | "base", string> = {
  base: "distill.hatchBase",
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

function HatchPanel({ state }: { state: HatchPanelState }): JSX.Element {
  const t = useT();
  const total = state.jobsCount ?? 10;
  const done = Object.values(state.jobs).filter(
    (j) => j.status === "done" || j.status === "mirrored"
  ).length;
  const failed = Object.values(state.jobs).filter((j) => j.status === "failed").length;
  const remaining = Math.max(0, total - done - failed);

  const placeholder = (jobId: string, rowState: HatchPetRowState | "base"): HatchJobState => ({
    jobId,
    rowState,
    status: "pending" as const
  });
  const orderedJobs: HatchJobState[] = [
    state.jobs.base ?? placeholder("base", "base"),
    ...HATCH_PET_ROW_STATES.map(
      (row) => state.jobs[`row-${row}`] ?? placeholder(`row-${row}`, row)
    )
  ];

  return (
    <section className="distill-step distill-hatch fade-in">
      <header className="distill-step__head">
        <span className="distill-step__title">
          {t("distill.stepTitle", { n: 5, label: t("distill.stageBuildingSprite") })}
        </span>
        <span className="distill-step__meta">
          {t("distill.hatchProgress", {
            done,
            total,
            failed: failed > 0 ? t("distill.hatchFailed", { count: failed }) : "",
            remaining: remaining > 0 ? t("distill.hatchRemaining", { count: remaining }) : ""
          })}
        </span>
      </header>
      <p className="distill-step__body">
        {t("distill.hatchCost", {
          estimated: state.estimatedCostUsd.toFixed(2),
          total: state.totalCostUsd.toFixed(3)
        })}
      </p>

      <ul className="distill-agent-list distill-hatch__list">
        {orderedJobs.map((job, index) => (
          <HatchJobRow key={job.jobId} job={job} index={index + 1} />
        ))}
      </ul>

      {state.atlasOk != null || (state.atlasIssues && state.atlasIssues.length > 0) ? (
        <section
          className={`distill-hatch__signals${state.atlasOk ? " is-ok" : " is-warn"}`}
        >
          {state.atlasOk != null ? (
            <h4 className="distill-hatch__signals-title">
              {state.atlasOk
                ? t("distill.hatchAtlasOk")
                : t("distill.hatchAtlasWarn", { count: state.atlasIssues?.length ?? 0 })}
            </h4>
          ) : null}
          {state.atlasIssues && state.atlasIssues.length > 0 ? (
            <ul className="distill-hatch__issues">
              {state.atlasIssues.slice(0, 4).map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {state.contactSheetPath ? (
        <p className="distill-hatch__qa">
          {t("distill.hatchQaSaved")}{" "}
          <code className="distill-hatch__path">{state.atlasPath}</code>
        </p>
      ) : null}
    </section>
  );
}

function HatchJobRow({
  job,
  index
}: {
  job: HatchJobState;
  index: number;
}): JSX.Element {
  const t = useT();
  const indexLabel = String(index).padStart(2, "0");
  const statusKey =
    job.status === "done" || job.status === "mirrored"
      ? "ok"
      : job.status === "failed" || job.status === "cancelled"
        ? "error"
        : job.status;

  let detail: string;
  if (job.status === "running") {
    detail = t("distill.hatchGenerating");
  } else if (job.status === "done") {
    detail = `${((job.durationMs ?? 0) / 1000).toFixed(1)}s${
      job.costUsd != null ? ` · $${job.costUsd.toFixed(3)}` : ""
    }`;
  } else if (job.status === "mirrored") {
    detail = t("distill.hatchMirroredFrom", { from: job.mirroredFrom ?? "—" });
  } else if (job.status === "failed") {
    detail = job.reason ?? t("distill.hatchFailedStatus");
  } else if (job.status === "cancelled") {
    detail = t("distill.hatchCancelled");
  } else {
    detail = t("distill.hatchQueued");
  }

  return (
    <li className="distill-agent-item" data-status={statusKey}>
      <div className="distill-agent-row">
        <span className="distill-agent-index" aria-hidden="true">
          {indexLabel}
        </span>
        <div className="distill-agent-main">
          <div className="distill-agent-title-row">
            <span className="distill-agent-title">
              {t(HATCH_LABEL_KEYS[job.rowState] ?? job.jobId)}
            </span>
            <span
              className="distill-agent-status"
              data-status={statusKey}
              aria-label={labelForHatchStatus(job.status, t)}
            >
              {job.status === "running" ? <Spinner /> : null}
              {labelForHatchStatus(job.status, t)}
            </span>
          </div>
          <p
            className="distill-agent-detail"
            data-tone={job.status === "failed" ? "error" : "muted"}
          >
            {detail}
          </p>
        </div>
      </div>
    </li>
  );
}

function labelForHatchStatus(s: HatchJobStatus, t: TFn): string {
  switch (s) {
    case "pending":
      return t("distill.hatchPending");
    case "running":
      return t("distill.hatchRunning");
    case "done":
      return t("distill.hatchDone");
    case "mirrored":
      return t("distill.hatchMirrored");
    case "failed":
      return t("distill.hatchFailedStatus");
    case "cancelled":
      return t("distill.statusCancelled");
  }
}
