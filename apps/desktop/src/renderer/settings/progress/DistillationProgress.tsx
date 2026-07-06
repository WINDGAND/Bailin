import { useEffect, useMemo, useState } from "react";
import type {
  HatchPetRowState,
  QualityCheckItem,
  QualityReport,
  ResearchAgentId,
  ResearchDoc
} from "@bailin/character-protocol";
import { HATCH_PET_ROW_STATES } from "@bailin/character-protocol";
import type {
  DistillationProgressEvent,
  HatchProgressEventDTO,
  SynthesisSummaryPayload,
  ResearchSummaryPayload
} from "../../../shared/ipc-contract.js";
import { useBailin } from "../../shared/use-bailin.js";
import { CopyButton, Spinner } from "../../shared/feedback.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import type { Locale } from "../../shared/i18n/types.js";
import { agentNameKey, translatePhaseMessage } from "./distillation-phase-i18n.js";
import { DistillationStageRail } from "./DistillationStageRail.js";
import { useDistillationJobs } from "../app/distillation-job-context.js";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface AgentCardState {
  agentId: ResearchAgentId;
  agentName: string;
  status: "pending" | "running" | "ok" | "timeout" | "error" | "skipped";
  durationMs?: number;
  webSearchUsed?: boolean;
  confidence?: "high" | "medium" | "low";
  sourcesCount?: number;
  errorMessage?: string;
  excerpt?: string;
}

const INITIAL_AGENTS: AgentCardState[] = [
  { agentId: 1, agentName: "", status: "pending" },
  { agentId: 2, agentName: "", status: "pending" },
  { agentId: 3, agentName: "", status: "pending" },
  { agentId: 4, agentName: "", status: "pending" },
  { agentId: 5, agentName: "", status: "pending" },
  { agentId: 6, agentName: "", status: "pending" }
];

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
  const bailin = useBailin();
  // 阶段展示状态从 DistillationJobProvider 读取而不是自己再维护一份 reducer——
  // 那个 context 挂在设置页 tab 切换不会卸载的地方，这样从别的 tab 切回来时
  // 阶段条能直接拿到已经走到的进度，不会先闪回「步骤 1/6」再等下一条事件才跳回来。
  const { stageDisplay } = useDistillationJobs();
  const [agents, setAgents] = useState<AgentCardState[]>(INITIAL_AGENTS);
  const [phaseLabel, setPhaseLabel] = useState("启动中…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [researchSummary, setResearchSummary] = useState<ResearchSummaryPayload | null>(null);
  const [synthSummary, setSynthSummary] = useState<SynthesisSummaryPayload | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [appearanceReady, setAppearanceReady] = useState(false);
  const [hatchState, setHatchState] = useState<HatchPanelState>({
    started: false,
    jobs: {},
    totalCostUsd: 0,
    estimatedCostUsd: 0
  });
  const [hintIndex, setHintIndex] = useState(0);
  const [finalState, setFinalState] = useState<
    | null
    | { kind: "done"; characterId: string; isSkeleton: boolean }
    | { kind: "failed"; reason: string }
    | { kind: "cancelled" }
  >(null);

  useEffect(() => {
    const off = bailin.on.distillationProgress((evt: DistillationProgressEvent) => {
      if (evt.jobId !== jobId) return;
      switch (evt.kind) {
        case "started":
          setPhaseLabel("已启动");
          break;
        case "phase":
          setPhaseLabel(evt.message);
          break;
        case "agent_start":
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === evt.agentId
                ? { ...a, status: "running", agentName: evt.agentName }
                : a
            )
          );
          break;
        case "agent_done":
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === evt.doc.agentId
                ? {
                    agentId: a.agentId,
                    agentName: evt.doc.agentName,
                    status: evt.doc.status === "ok" ? "ok" : evt.doc.status,
                    durationMs: evt.doc.durationMs,
                    webSearchUsed: evt.doc.webSearchUsed,
                    confidence: evt.doc.confidence,
                    sourcesCount: evt.doc.sources.length,
                    errorMessage: evt.doc.errorMessage,
                    excerpt: evt.doc.markdown?.slice?.(0, 240)
                  }
                : a
            )
          );
          break;
        case "research_complete":
          setResearchSummary(evt.summary);
          break;
        case "synthesis_summary":
          setSynthSummary(evt.summary);
          break;
        case "appearance_ready":
          setAppearanceReady(true);
          break;
        case "quality_report":
          setQualityReport(evt.report);
          break;
        case "hatch_progress":
          setHatchState((prev) => reduceHatch(prev, evt.event));
          break;
        case "warning":
          setWarnings((p) => [...p, evt.message]);
          break;
        case "done":
          setPhaseLabel("完成");
          setFinalState({
            kind: "done",
            characterId: evt.characterId,
            isSkeleton: evt.isSkeleton
          });
          break;
        case "failed":
          setFinalState({ kind: "failed", reason: evt.reason });
          break;
        case "cancelled":
          setFinalState({ kind: "cancelled" });
          break;
      }
    });
    return off;
  }, [bailin, jobId]);

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

      {running ? (
        <div className="bl-status-strip is-running" style={{ marginBottom: 16 }}>
          <div className="bl-status-strip__body">
            <div className="bl-status-strip__title">{t("distill.workingTitle")}</div>
            <div className="bl-status-strip__detail">{t(ACTIVITY_HINT_KEYS[hintIndex]!)}</div>
          </div>
          <div className="bl-status-strip__action">
            <Spinner magenta />
          </div>
        </div>
      ) : null}

      <DistillationStageRail
        activeIndex={stageDisplay.activeIndex}
        isResynthesizing={stageDisplay.isResynthesizing}
        resynthesisRound={stageDisplay.resynthesisRound}
        forceAllDone={finalState?.kind === "done"}
      />

      <ResearchAgentsSection agents={agents} researchSummary={researchSummary} />

      {synthSummary ? (
        <div className="card fade-in" style={{ padding: 14, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {t("distill.phase2Title")}
          </div>
          <p className="body-sm" style={{ margin: "0 0 10px", color: "var(--ink-faint)" }}>
            {t("distill.phase2Hint")}
          </p>
          <SummaryGrid summary={synthSummary} track={track} />
        </div>
      ) : null}

      {appearanceReady ? (
        <div
          className="card fade-in"
          style={{
            padding: 10,
            marginBottom: 16,
            background: "rgba(31,58,58,0.04)"
          }}
        >
          <span className="body-sm">{t("distill.appearanceReady")}</span>
        </div>
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
 * 阶段一的调研网格 —— 默认折叠成一行摘要，点「查看详情」才展开 6 张 agent 卡片。
 * 这是用户反馈"信息太多、太乱"里最大的一块：6 张卡片的完整调用详情，多数人
 * 只关心"调研做完了没有、成功几路"，不需要一直摊开在页面上。
 */
function ResearchAgentsSection({
  agents,
  researchSummary
}: {
  agents: AgentCardState[];
  researchSummary: ResearchSummaryPayload | null;
}): JSX.Element {
  const t = useT();
  // 默认展开——用户反馈调研阶段正在跑的时候想直接看到 6 路 agent 的实时进展，
  // 不想先点一下才能看；折叠只用于用户自己手动收起之后。
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
          <strong>{t("distill.phase1Title")}</strong>
          <span style={{ color: "var(--ink-faint)" }}>{summaryText}</span>
        </span>
        <span className="distill-collapse__toggle">
          {open ? t("distill.hideDetails") : t("distill.viewDetails")}
        </span>
      </summary>
      <div className="distill-collapse__body">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
            marginTop: 12
          }}
        >
          {agents.map((a) => (
            <AgentCard key={a.agentId} state={a} />
          ))}
        </div>
      </div>
    </details>
  );
}

function AgentCard({ state }: { state: AgentCardState }): JSX.Element {
  const t = useT();
  const displayName = t(agentNameKey(state.agentId)) || state.agentName;
  const color = useMemo(() => {
    switch (state.status) {
      case "pending":
        return "var(--ink-faint)";
      case "running":
        return "var(--amber)";
      case "ok":
        return "var(--emerald)";
      case "skipped":
        return "var(--ink-faint)";
      default:
        return "var(--magenta)";
    }
  }, [state.status]);

  return (
    <div
      className="card"
      style={{
        padding: 12,
        border: `1px solid ${
          state.status === "running" ? "var(--amber)" : "var(--grid-strong)"
        }`,
        background:
          state.status === "running" ? "rgba(217,154,58,0.08)" : "var(--paper)",
        transition: "border-color 200ms var(--ease-out), background 200ms var(--ease-out)"
      }}
    >
      <div className="row row--between" style={{ marginBottom: 6 }}>
        <strong style={{ color, fontSize: 13 }}>
          #{state.agentId} {displayName}
        </strong>
        <span className="row gap-2" style={{ color, fontSize: 12 }}>
          {state.status === "running" ? <Spinner /> : null}
          {labelOf(state.status, t)}
        </span>
      </div>
      <div className="body-sm" style={{ color: "var(--ink-faint)", minHeight: 18 }}>
        {state.status === "running" ? t("distill.agentCallingLlm") : null}
        {state.status === "ok" || state.status === "timeout" || state.status === "error" ? (
          <>
            {t("distill.agentDuration", {
              seconds: Math.round((state.durationMs ?? 0) / 1000)
            })}
            {state.webSearchUsed ? t("distill.agentSourcesOk") : t("distill.agentSourcesPending")}
            {state.confidence ? ` · ${state.confidence}` : ""}
            {state.sourcesCount != null
              ? t("distill.agentSourcesCount", { count: state.sourcesCount })
              : ""}
          </>
        ) : null}
        {state.status === "pending" ? t("distill.agentPending") : null}
      </div>
      {state.errorMessage ? (
        <p
          className="body-sm"
          style={{
            marginTop: 6,
            color: state.status === "ok" ? "var(--ink-faint)" : "var(--magenta)"
          }}
        >
          {userFacingProcessMessage(state.errorMessage, t)}
        </p>
      ) : null}
    </div>
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
 * 质量自检卡片 —— verdict/总分永远直接可见（这是用户最关心的一句话结论），
 * 完整的逐项检查表格 + 风格/Sanity/Edge 三个测试样本默认折叠，点「查看详情」
 * 才展开。这是用户反馈"图二这里一堆文字，很混乱"里最典型的那块内容。
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
  const verdictColor =
    report.verdict === "pass"
      ? "var(--emerald)"
      : report.verdict === "warn"
        ? "var(--amber)"
        : "var(--magenta)";
  return (
    <details
      className="distill-collapse fade-in"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="distill-collapse__summary">
        <span className="distill-collapse__summary-text">
          <strong>{t("distill.phase4Title")}</strong>
          <span style={{ color: verdictColor, fontWeight: 600 }}>
            {t("distill.qualityCollapsedSummary", {
              verdict: report.verdict.toUpperCase(),
              score: (report.overallScore * 100).toFixed(0)
            })}
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
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <tbody>
            {report.items.map((it) => (
              <CheckItemRow key={it.id} item={it} />
            ))}
          </tbody>
        </table>
        {report.voiceTest ? (
          <details style={{ marginTop: 10 }}>
            <summary className="eyebrow" style={{ cursor: "pointer" }}>
              {t("distill.voiceTestSummary", { score: report.voiceTest.score })}
            </summary>
            <blockquote
              className="body-sm"
              style={{
                margin: "8px 0",
                padding: "10px 12px",
                background: "var(--paper-deep)",
                border: "1px solid var(--grid)",
                borderRadius: "var(--radius-sm)"
              }}
            >
              {report.voiceTest.sample}
            </blockquote>
            <p className="body-sm" style={{ color: "var(--ink-soft)" }}>
              {t("distill.voiceCritique", { text: report.voiceTest.critique })}
            </p>
          </details>
        ) : null}
        {report.sanityTest ? (
          <details style={{ marginTop: 10 }} open={!companion ? undefined : false}>
            <summary className="eyebrow" style={{ cursor: "pointer" }}>
              {companion
                ? t("distill.sanityTestSummaryCompanion", { score: report.sanityTest.averageScore })
                : t("distill.sanityTestSummary", { score: report.sanityTest.averageScore })}
            </summary>
            {report.sanityTest.questions.map((q, i) => (
              <div key={i} className="body-sm" style={{ marginTop: 8 }}>
                <div style={{ color: q.pass ? "var(--emerald)" : "var(--magenta)" }}>
                  {t("distill.sanityQuestionLine", { n: i + 1, question: q.question })}
                  {" · "}
                  {q.score}/10
                </div>
                <div style={{ color: "var(--ink-faint)", marginTop: 2 }}>
                  {t("distill.sanityAnswerLine", { answer: q.answer.slice(0, 200) })}
                </div>
              </div>
            ))}
          </details>
        ) : null}
        {report.edgeTest ? (
          <details style={{ marginTop: 10 }} open={!companion ? undefined : false}>
            <summary className="eyebrow" style={{ cursor: "pointer" }}>
              {t("distill.edgeTestSummary", { score: report.edgeTest.score })}
            </summary>
            <p className="body-sm" style={{ marginTop: 6 }}>
              {t("distill.edgeQuestionLine", { question: report.edgeTest.question })}
            </p>
            <p className="body-sm" style={{ whiteSpace: "pre-wrap" }}>
              {report.edgeTest.answer}
            </p>
            <p className="body-sm" style={{ color: "var(--ink-faint)" }}>
              {report.edgeTest.critique}
            </p>
          </details>
        ) : null}
        {report.synthesisRounds && report.synthesisRounds > 1 ? (
          <p className="body-sm" style={{ marginTop: 10, color: "var(--ink-soft)" }}>
            {t("distill.phase4ResynthesisNote")}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function CheckItemRow({ item }: { item: QualityCheckItem }): JSX.Element {
  return (
    <tr>
      <td
        style={{
          padding: "4px 8px 4px 0",
          color: item.pass ? "var(--emerald)" : "var(--magenta)",
          width: 18
        }}
      >
        {item.pass ? "✓" : "✗"}
      </td>
      <td style={{ padding: "4px 8px", fontSize: 13 }}>{item.label}</td>
      <td className="body-sm" style={{ padding: "4px 0", color: "var(--ink-faint)" }}>
        {item.reason}
      </td>
    </tr>
  );
}

// ===== Hatch-pet QA 面板 =====

type HatchJobStatus = "pending" | "running" | "done" | "mirrored" | "failed";

interface HatchJobState {
  jobId: string;
  rowState: HatchPetRowState | "base";
  status: HatchJobStatus;
  durationMs?: number;
  costUsd?: number;
  reason?: string;
  mirroredFrom?: string;
}

interface HatchPanelState {
  started: boolean;
  jobsCount?: number;
  estimatedCostUsd: number;
  totalCostUsd: number;
  atlasOk?: boolean;
  atlasIssues?: string[];
  contactSheetPath?: string;
  previewPath?: string;
  atlasPath?: string;
  jobs: Record<string, HatchJobState>;
}

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

function reduceHatch(
  state: HatchPanelState,
  evt: HatchProgressEventDTO
): HatchPanelState {
  switch (evt.kind) {
    case "start": {
      const initialJobs: Record<string, HatchJobState> = {
        base: { jobId: "base", rowState: "base", status: "pending" }
      };
      for (const row of HATCH_PET_ROW_STATES) {
        initialJobs[`row-${row}`] = {
          jobId: `row-${row}`,
          rowState: row,
          status: "pending"
        };
      }
      return {
        ...state,
        started: true,
        jobsCount: evt.jobsCount,
        estimatedCostUsd: evt.estimatedCostUsd,
        jobs: initialJobs
      };
    }
    case "job_start":
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: evt.rowState as HatchPetRowState | "base",
            status: "running"
          }
        }
      };
    case "job_done":
      return {
        ...state,
        totalCostUsd: state.totalCostUsd + (evt.costUsd ?? 0),
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: evt.rowState as HatchPetRowState | "base",
            status: "done",
            durationMs: evt.durationMs,
            costUsd: evt.costUsd
          }
        }
      };
    case "job_failed":
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: evt.rowState as HatchPetRowState | "base",
            status: "failed",
            reason: evt.reason
          }
        }
      };
    case "job_mirrored":
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: (evt.jobId.replace(/^row-/, "") as HatchPetRowState) ?? "base",
            status: "mirrored",
            mirroredFrom: evt.from
          }
        }
      };
    case "atlas_composed":
      return {
        ...state,
        atlasOk: evt.ok,
        atlasIssues: evt.issuesPreview
      };
    case "qa_ready":
      return {
        ...state,
        contactSheetPath: evt.contactSheetPath,
        previewPath: evt.previewPath,
        atlasPath: evt.atlasPath
      };
    default:
      return state;
  }
}

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
    <div className="card fade-in" style={{ padding: 16, marginBottom: 16 }}>
      <div className="row row--between" style={{ marginBottom: 10 }}>
        <div className="eyebrow">{t("distill.phase3Title")}</div>
        <div className="body-sm" style={{ color: "var(--ink-faint)" }}>
          {t("distill.hatchProgress", {
            done,
            total,
            failed: failed > 0 ? t("distill.hatchFailed", { count: failed }) : "",
            remaining: remaining > 0 ? t("distill.hatchRemaining", { count: remaining }) : ""
          })}
        </div>
      </div>
      <div
        className="body-sm"
        style={{ color: "var(--ink-faint)", marginBottom: 10 }}
      >
        {t("distill.hatchCost", {
          estimated: state.estimatedCostUsd.toFixed(2),
          total: state.totalCostUsd.toFixed(3)
        })}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8
        }}
      >
        {orderedJobs.map((job) => (
          <HatchJobCard key={job.jobId} job={job} />
        ))}
      </div>
      {state.atlasOk != null ? (
        <div
          className="body-sm"
          style={{
            marginTop: 10,
            color: state.atlasOk ? "var(--emerald)" : "var(--amber)"
          }}
        >
          {state.atlasOk
            ? t("distill.hatchAtlasOk")
            : t("distill.hatchAtlasWarn", { count: state.atlasIssues?.length ?? 0 })}
          {state.atlasIssues && state.atlasIssues.length > 0 ? (
            <ul style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
              {state.atlasIssues.slice(0, 4).map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.contactSheetPath ? (
        <div className="body-sm" style={{ marginTop: 10 }}>
          {t("distill.hatchQaSaved")}
          <code style={{ fontSize: 11 }}>{state.atlasPath}</code>
        </div>
      ) : null}
    </div>
  );
}

function HatchJobCard({ job }: { job: HatchJobState }): JSX.Element {
  const t = useT();
  const color = (() => {
    switch (job.status) {
      case "pending":
        return "var(--ink-faint)";
      case "running":
        return "var(--amber)";
      case "done":
        return "var(--emerald)";
      case "mirrored":
        return "var(--emerald)";
      case "failed":
        return "var(--magenta)";
    }
  })();
  return (
    <div
      className="card"
      style={{
        padding: 10,
        border: `1px solid ${
          job.status === "running" ? "var(--amber)" : "var(--grid-strong)"
        }`,
        background:
          job.status === "running" ? "rgba(217,154,58,0.08)" : "var(--paper)"
      }}
    >
      <div className="row row--between" style={{ marginBottom: 4 }}>
        <strong style={{ color, fontSize: 12 }}>
          {t(HATCH_LABEL_KEYS[job.rowState] ?? job.jobId)}
        </strong>
        <span style={{ color, fontSize: 11 }} className="row gap-2">
          {job.status === "running" ? <Spinner /> : null}
          {labelForHatchStatus(job.status, t)}
        </span>
      </div>
      <div
        className="body-sm"
        style={{ color: "var(--ink-faint)", minHeight: 14, fontSize: 11 }}
      >
        {job.status === "running"
          ? t("distill.hatchGenerating")
          : job.status === "done"
            ? `${((job.durationMs ?? 0) / 1000).toFixed(1)}s${
                job.costUsd != null ? ` · $${job.costUsd.toFixed(3)}` : ""
              }`
            : job.status === "mirrored"
              ? t("distill.hatchMirroredFrom", { from: job.mirroredFrom ?? "—" })
              : job.status === "failed"
                ? job.reason ?? t("distill.hatchFailedStatus")
                : t("distill.hatchQueued")}
      </div>
    </div>
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
  }
}

// 兼容旧导出
export type _UseResearchDoc = ResearchDoc;
