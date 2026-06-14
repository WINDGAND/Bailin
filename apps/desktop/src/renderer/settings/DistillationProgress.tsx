import { useEffect, useMemo, useRef, useState } from "react";
import type {
  QualityCheckItem,
  QualityReport,
  ResearchAgentId,
  ResearchDoc
} from "@nuwa-pet/character-protocol";
import type {
  DistillationProgressEvent,
  ResearchSummaryPayload,
  SynthesisSummaryPayload
} from "../../shared/ipc-contract.js";
import { useNuwa } from "../shared/use-nuwa.js";
import { CopyButton, Spinner } from "../shared/feedback.js";

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
  { agentId: 1, agentName: "著作 / 系统思考", status: "pending" },
  { agentId: 2, agentName: "对话 / 即兴", status: "pending" },
  { agentId: 3, agentName: "表达 DNA", status: "pending" },
  { agentId: 4, agentName: "他者视角", status: "pending" },
  { agentId: 5, agentName: "决策 / 行动", status: "pending" },
  { agentId: 6, agentName: "时间线", status: "pending" }
];

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
  const nuwa = useNuwa();
  const [agents, setAgents] = useState<AgentCardState[]>(INITIAL_AGENTS);
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState("启动中…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [researchSummary, setResearchSummary] = useState<ResearchSummaryPayload | null>(null);
  const [synthSummary, setSynthSummary] = useState<SynthesisSummaryPayload | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [appearanceReady, setAppearanceReady] = useState(false);
  const [showCheckpoint, setShowCheckpoint] = useState<null | "research" | "synthesis">(null);
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

  return (
    <div>
      <div className="eyebrow">Distillation</div>
      <div className="display display--page" style={{ marginBottom: 6 }}>
        正在为「{characterName}」造人
      </div>
      <p className="body-sm" style={{ margin: "0 0 16px" }}>
        {phaseLabel}
      </p>

      <div style={{ marginBottom: 16 }}>
        <div
          className={`progress ${running ? "progress--running" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="蒸馏进度"
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
          Phase 1 · 6 路并行调研
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
            调研汇总
          </div>
          <p className="body-sm" style={{ margin: 0 }}>
            成功 {researchSummary.okCount}/6，失败 {researchSummary.failedCount}，
            总用时 {Math.round(researchSummary.totalDurationMs / 1000)} 秒
          </p>
        </div>
      ) : null}

      {synthSummary ? (
        <div className="card fade-in" style={{ padding: 14, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Phase 2 · 提炼摘要
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
          <span className="body-sm">外貌已生成（深度三步：搜图 → 结构化 → 自我批评）</span>
        </div>
      ) : null}

      {qualityReport ? <QualityReportCard report={qualityReport} /> : null}

      {warnings.length > 0 ? (
        <details
          style={{
            padding: 10,
            borderRadius: 10,
            background: "rgba(178,24,88,0.04)",
            border: "1px solid var(--magenta-soft)",
            marginBottom: 16
          }}
        >
          <summary
            className="eyebrow"
            style={{ cursor: "pointer", color: "var(--magenta)" }}
          >
            {warnings.length} 条警告
          </summary>
          <ul className="body-sm" style={{ margin: "8px 0 0 16px", padding: 0 }}>
            {warnings.map((w, i) => (
              <li key={i}>
                <code style={{ fontFamily: "var(--font-mono)" }}>{w}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {finalState ? (
        <div className="card fade-in-up" style={{ padding: 20 }}>
          {finalState.kind === "done" ? (
            <>
              <div className="display display--section" style={{ marginBottom: 8 }}>
                {finalState.isSkeleton ? "已落地为骨架角色" : "深度蒸馏完成"}
              </div>
              <p className="body-md" style={{ margin: "0 0 12px" }}>
                调研档案已存到本机，可在「角色仓库」详情查看完整 Markdown 和质量报告。
              </p>
              <div className="row row--end gap-2">
                <button className="btn btn--magenta" onClick={() => onComplete()}>
                  进角色仓库
                </button>
              </div>
            </>
          ) : finalState.kind === "failed" ? (
            <>
              <div
                className="display display--section"
                style={{ marginBottom: 8, color: "var(--magenta)" }}
              >
                蒸馏失败
              </div>
              <p className="body-md" style={{ margin: "0 0 12px" }}>
                {finalState.reason}
              </p>
              <div className="row row--end gap-2">
                <CopyButton
                  small
                  text={buildErrorReport(jobId, characterName, finalState.reason, warnings)}
                  label="复制错误日志"
                />
                <button className="btn btn--ghost" onClick={() => onCancel()}>
                  返回
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="display display--section" style={{ marginBottom: 8 }}>
                已取消
              </div>
              <div className="row row--end gap-2">
                <button className="btn btn--ghost" onClick={() => onCancel()}>
                  返回
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="row row--end gap-2">
          <button className="btn btn--ghost" onClick={() => onCancel()}>
            取消蒸馏
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
  warnings: string[]
): string {
  const lines = [
    `# 百灵 Bailin · 深度蒸馏错误日志`,
    ``,
    `- 角色：${characterName}`,
    `- Job ID：${jobId}`,
    `- 时间：${new Date().toISOString()}`,
    ``,
    `## 失败原因`,
    reason,
    ``
  ];
  if (warnings.length > 0) {
    lines.push(`## 过程警告（${warnings.length}）`, ...warnings.map((w) => `- ${w}`));
  }
  return lines.join("\n");
}

function AgentCard({ state }: { state: AgentCardState }): JSX.Element {
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
          #{state.agentId} {state.agentName}
        </strong>
        <span className="row gap-2" style={{ color, fontSize: 12 }}>
          {state.status === "running" ? <Spinner /> : null}
          {labelOf(state.status)}
        </span>
      </div>
      <div className="body-sm" style={{ color: "var(--ink-faint)", minHeight: 18 }}>
        {state.status === "running" ? "调用 LLM 中…" : null}
        {state.status === "ok" || state.status === "timeout" || state.status === "error" ? (
          <>
            用时 {Math.round((state.durationMs ?? 0) / 1000)} 秒
            {state.webSearchUsed ? " · 联网 ✓" : " · 无联网"}
            {state.confidence ? ` · ${state.confidence}` : ""}
            {state.sourcesCount != null ? ` · ${state.sourcesCount} 引用` : ""}
          </>
        ) : null}
        {state.status === "pending" ? "排队中…" : null}
      </div>
      {state.errorMessage ? (
        <p
          className="body-sm"
          style={{ marginTop: 6, color: "var(--magenta)" }}
        >
          {state.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function labelOf(s: AgentCardState["status"]): string {
  switch (s) {
    case "pending":
      return "排队";
    case "running":
      return "研究中";
    case "ok":
      return "完成";
    case "timeout":
      return "超时";
    case "error":
      return "失败";
    case "skipped":
      return "跳过";
  }
}

function SummaryGrid({ summary }: { summary: SynthesisSummaryPayload }): JSX.Element {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SummaryRow label="心智模型" items={summary.mentalModelNames} />
      <div className="body-sm">决策启发式 {summary.heuristicsCount} 条</div>
      <SummaryRow label="签名词" items={summary.expressionSignatures} />
      <SummaryRow label="禁忌词" items={summary.expressionForbidden} muted />
      <SummaryRow label="内在张力" items={summary.tensions} />
      <SummaryRow label="诚实边界" items={summary.honestyNotes} muted />
    </div>
  );
}

function SummaryRow({
  label,
  items,
  muted
}: {
  label: string;
  items: string[];
  muted?: boolean;
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
        {items.length === 0 ? "（无）" : items.join(" · ")}
      </span>
    </div>
  );
}

function QualityReportCard({ report }: { report: QualityReport }): JSX.Element {
  const verdictColor =
    report.verdict === "pass"
      ? "var(--emerald)"
      : report.verdict === "warn"
        ? "var(--amber)"
        : "var(--magenta)";
  return (
    <div className="card fade-in" style={{ padding: 14, marginBottom: 16 }}>
      <div className="row row--between" style={{ marginBottom: 8 }}>
        <div className="eyebrow">Phase 4 · 质量自检</div>
        <span style={{ color: verdictColor, fontWeight: 600 }}>
          {report.verdict.toUpperCase()} · 总分 {(report.overallScore * 100).toFixed(0)}/100
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
            风格测试样本（评分 {report.voiceTest.score}/10）
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
            点评：{report.voiceTest.critique}
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
          {phase === "research" ? "Checkpoint 1 · 调研质量" : "Checkpoint 2 · 提炼确认"}
        </div>
        <div
          id="checkpoint-title"
          className="display display--section"
          style={{ marginBottom: 12 }}
        >
          {phase === "research" ? "调研完成，请确认" : "提炼完成，请确认"}
        </div>
        {phase === "research" && researchSummary ? (
          <div style={{ marginBottom: 14 }}>
            <p className="body-sm" style={{ margin: 0 }}>
              成功 {researchSummary.okCount}/6，失败 {researchSummary.failedCount}，
              用时 {Math.round(researchSummary.totalDurationMs / 1000)} 秒。
            </p>
            <ul className="body-sm" style={{ marginTop: 8 }}>
              {researchSummary.docs.map((d) => (
                <li key={d.agentId}>
                  #{d.agentId} {d.agentName} — {d.status}（{d.confidence}） ·{" "}
                  {d.sources.length} 引用
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
            取消
          </button>
          <button
            type="button"
            className="btn btn--magenta"
            ref={approveRef}
            onClick={() => onApprove()}
            data-hint="Enter"
          >
            确认，继续下一阶段
          </button>
        </div>
      </div>
    </div>
  );
}

// 兼容旧导出
export type _UseResearchDoc = ResearchDoc;
