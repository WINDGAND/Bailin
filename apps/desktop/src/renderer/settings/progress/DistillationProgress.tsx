import { useEffect, useMemo, useRef, useState } from "react";
import type {
  HatchPetRowState,
  QualityCheckItem,
  QualityReport,
  ResearchAgentId,
  ResearchDoc
} from "@nuwa-pet/character-protocol";
import { HATCH_PET_ROW_STATES } from "@nuwa-pet/character-protocol";
import type {
  DistillationProgressEvent,
  HatchProgressEventDTO,
  ResearchSummaryPayload,
  SynthesisSummaryPayload
} from "../../../shared/ipc-contract.js";
import { useNuwa } from "../../shared/use-nuwa.js";
import { CopyButton, Spinner } from "../../shared/feedback.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import type { Locale } from "../../shared/i18n/types.js";

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

const PHASE_EXACT: Record<string, string> = {
  "启动中…": "distill.phaseStarting",
  "已启动": "distill.phaseStarted",
  "完成": "distill.phaseComplete",
  "启动 6 路并行调研…": "distill.phaseResearchStart",
  "正在用调研结果提炼心智模型与表达 DNA…": "distill.phaseSynthesizing",
  "提炼完成，等待你确认": "distill.phaseAwaitSynth",
  "装配人格卡…": "distill.phaseBuildingCard",
  "深度外貌调研：vision 读图 → 结构化 → 视觉自检…": "distill.phaseAppearanceDeep",
  "正在画桌宠的 hatch-pet 精灵图…": "distill.phaseBuildingSprite",
  "运行质量自检…": "distill.phaseQualityCheck"
};

function agentNameKey(id: ResearchAgentId): string {
  return `distill.agent${id}`;
}

function translatePhaseMessage(raw: string, t: TFn, locale: Locale): string {
  const exact = PHASE_EXACT[raw];
  if (exact) return t(exact);

  const researchDone = raw.match(/^调研完成（成功 (\d+)\/6，失败 (\d+)），等待你确认$/);
  if (researchDone) {
    return t("distill.phaseResearchDone", {
      ok: researchDone[1]!,
      failed: researchDone[2]!
    });
  }

  const locked = raw.match(/^已锁定调研对象：(.+)$/);
  if (locked) {
    const rest = locked[1]!;
    const parsed = rest.match(/^(.+?)(?: \/ ([^（]+))?(?:（(.+)）)?$/);
    const name = parsed?.[1] ?? rest;
    const english = parsed?.[2];
    const context = parsed?.[3];
    const englishPart = english ? ` / ${english}` : "";
    const contextPart = context
      ? locale === "zh"
        ? `（${context}）`
        : ` (${context})`
      : "";
    return t("distill.phaseLockedTarget", { name, english: englishPart, context: contextPart });
  }

  return raw;
}

interface Props {
  jobId: string;
  characterName: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function DistillationProgress({
  jobId,
  characterName,
  onComplete,
  onCancel
}: Props): JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const nuwa = useNuwa();
  const [agents, setAgents] = useState<AgentCardState[]>(INITIAL_AGENTS);
  const [progress, setProgress] = useState(0);
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
  const [showCheckpoint, setShowCheckpoint] = useState<null | "research" | "synthesis">(null);
  const [hintIndex, setHintIndex] = useState(0);
  const [finalState, setFinalState] = useState<
    | null
    | { kind: "done"; characterId: string; isSkeleton: boolean }
    | { kind: "failed"; reason: string }
    | { kind: "cancelled" }
  >(null);

  useEffect(() => {
    const off = nuwa.on.distillationProgress((evt: DistillationProgressEvent) => {
      if (evt.jobId !== jobId) return;
      switch (evt.kind) {
        case "started":
          setPhaseLabel("已启动");
          break;
        case "phase":
          setPhaseLabel(evt.message);
          setProgress(evt.progress);
          if (evt.phase === "awaiting_research_ok") setShowCheckpoint("research");
          if (evt.phase === "awaiting_synth_ok") setShowCheckpoint("synthesis");
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
          setProgress(100);
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
  }, [nuwa, jobId]);

  async function approve(phase: "research" | "synthesis"): Promise<void> {
    setShowCheckpoint(null);
    await nuwa.characters.approveDistillation({ jobId, phase });
  }

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

      <div style={{ marginBottom: 16 }}>
        <div
          className={`progress ${running ? "progress--running" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={t("distill.progressAria")}
        >
          <div className="progress__fill" style={{ width: `${progress}%` }} />
        </div>
        <p
          className="body-sm"
          style={{ margin: "6px 0 0", textAlign: "right" }}
        >
          {progress}%
        </p>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {t("distill.phase1Title")}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10
          }}
        >
          {agents.map((a) => (
            <AgentCard key={a.agentId} state={a} />
          ))}
        </div>
      </div>

      {researchSummary ? (
        <div className="card fade-in" style={{ padding: 14, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("distill.researchSummary")}
          </div>
          <p className="body-sm" style={{ margin: 0 }}>
            {t("distill.researchSummaryStats", {
              ok: researchSummary.okCount,
              failed: researchSummary.failedCount,
              seconds: Math.round(researchSummary.totalDurationMs / 1000)
            })}
          </p>
        </div>
      ) : null}

      {synthSummary ? (
        <div className="card fade-in" style={{ padding: 14, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {t("distill.phase2Title")}
          </div>
          <SummaryGrid summary={synthSummary} />
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

      {qualityReport ? <QualityReportCard report={qualityReport} /> : null}

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

      {showCheckpoint ? (
        <CheckpointDialog
          phase={showCheckpoint}
          researchSummary={researchSummary}
          synthSummary={synthSummary}
          onApprove={() => void approve(showCheckpoint)}
          onCancel={() => {
            setShowCheckpoint(null);
            onCancel();
          }}
        />
      ) : null}
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

function SummaryGrid({ summary }: { summary: SynthesisSummaryPayload }): JSX.Element {
  const t = useT();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SummaryRow label={t("distill.summaryMentalModels")} items={summary.mentalModelNames} t={t} />
      <div className="body-sm">
        {t("distill.summaryHeuristics", { count: summary.heuristicsCount })}
      </div>
      <SummaryRow label={t("distill.summarySignatures")} items={summary.expressionSignatures} t={t} />
      <SummaryRow
        label={t("distill.summaryForbidden")}
        items={summary.expressionForbidden}
        muted
        t={t}
      />
      <SummaryRow label={t("distill.summaryTensions")} items={summary.tensions} t={t} />
      <SummaryRow label={t("distill.summaryHonesty")} items={summary.honestyNotes} muted t={t} />
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

function QualityReportCard({ report }: { report: QualityReport }): JSX.Element {
  const t = useT();
  const verdictColor =
    report.verdict === "pass"
      ? "var(--emerald)"
      : report.verdict === "warn"
        ? "var(--amber)"
        : "var(--magenta)";
  return (
    <div className="card fade-in" style={{ padding: 14, marginBottom: 16 }}>
      <div className="row row--between" style={{ marginBottom: 8 }}>
        <div className="eyebrow">{t("distill.phase4Title")}</div>
        <span style={{ color: verdictColor, fontWeight: 600 }}>
          {report.verdict.toUpperCase()}
          {t("distill.phase4Score", { score: (report.overallScore * 100).toFixed(0) })}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
              padding: 10,
              background: "rgba(31,58,58,0.04)",
              borderLeft: "3px solid var(--magenta)"
            }}
          >
            {report.voiceTest.sample}
          </blockquote>
          <p className="body-sm" style={{ color: "var(--ink-soft)" }}>
            {t("distill.voiceCritique", { text: report.voiceTest.critique })}
          </p>
        </details>
      ) : null}
    </div>
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

function CheckpointDialog(props: {
  phase: "research" | "synthesis";
  researchSummary: ResearchSummaryPayload | null;
  synthSummary: SynthesisSummaryPayload | null;
  onApprove: () => void;
  onCancel: () => void;
}): JSX.Element {
  const t = useT();
  const { phase, researchSummary, synthSummary, onApprove, onCancel } = props;
  const approveRef = useRef<HTMLButtonElement | null>(null);

  // 键盘：Enter 确认，Esc 取消，focus 锁在按钮上
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
      <div className="modal" style={{ width: 540 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {phase === "research" ? t("distill.checkpoint1Eyebrow") : t("distill.checkpoint2Eyebrow")}
        </div>
        <div
          id="checkpoint-title"
          className="display display--section"
          style={{ marginBottom: 12 }}
        >
          {phase === "research" ? t("distill.checkpoint1Title") : t("distill.checkpoint2Title")}
        </div>
        {phase === "research" && researchSummary ? (
          <div style={{ marginBottom: 14 }}>
            <p className="body-sm" style={{ margin: 0 }}>
              {t("distill.checkpointResearchStats", {
                ok: researchSummary.okCount,
                failed: researchSummary.failedCount,
                seconds: Math.round(researchSummary.totalDurationMs / 1000)
              })}
            </p>
            <ul className="body-sm" style={{ marginTop: 8 }}>
              {researchSummary.docs.map((d) => (
                <li key={d.agentId}>
                  {t("distill.checkpointDocLine", {
                    id: d.agentId,
                    name: t(agentNameKey(d.agentId as ResearchAgentId)) || d.agentName,
                    status: d.status,
                    confidence: d.confidence,
                    sources: d.sources.length
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {phase === "synthesis" && synthSummary ? (
          <div style={{ marginBottom: 14 }}>
            <SummaryGrid summary={synthSummary} />
          </div>
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
