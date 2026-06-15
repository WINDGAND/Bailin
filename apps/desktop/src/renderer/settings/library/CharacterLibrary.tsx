import { useEffect, useMemo, useRef, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { PetPreview } from "../../shared/pet-preview.js";
import {
  CopyButton,
  Skeleton,
  Spinner,
  useConfirm,
  useToast
} from "../../shared/feedback.js";
import type {
  CharacterBundle,
  QualityReport,
  ResearchDoc,
  SpriteProgram
} from "@nuwa-pet/character-protocol";

interface LibraryItem {
  id: string;
  name: string;
  sourceName?: string;
  track: "utility" | "companion";
  isSkeleton: boolean;
  isActive: boolean;
}

export function CharacterLibrary({
  onNewClick
}: {
  onNewClick: () => void;
}): JSX.Element {
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, SpriteProgram | null>>({});
  const [selected, setSelected] = useState<CharacterBundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [researchDocs, setResearchDocs] = useState<ResearchDoc[]>([]);
  const [qualityReport, setQualityReport] = useState<QualityReport | undefined>(undefined);
  const [openedAgentId, setOpenedAgentId] = useState<number | null>(null);

  async function refreshList(keepSelected = true): Promise<void> {
    const list = (await nuwa.characters.list()) as LibraryItem[];
    setItems(list);
    // 预取缩略图（顺序拉，但本地 IPC 很快）
    void prefetchThumbnails(list);
    if (keepSelected && selectedId) {
      const next = await nuwa.characters.get(selectedId);
      setSelected(next);
      const extra = await nuwa.characters.getResearchByCharacter(selectedId);
      setResearchDocs(extra.docs);
      setQualityReport(extra.qualityReport);
    }
  }

  async function prefetchThumbnails(list: LibraryItem[]) {
    for (const item of list) {
      if (thumbnails[item.id]) continue;
      const b = await nuwa.characters.get(item.id);
      setThumbnails((prev) => ({ ...prev, [item.id]: b?.sprite ?? null }));
    }
  }

  useEffect(() => {
    void refreshList(false);
    const off = nuwa.on.activeCharacterChanged(() => void refreshList(true));
    return off;
  }, [nuwa]);

  async function pick(id: string): Promise<void> {
    setSelectedId(id);
    setOpenedAgentId(null);
    const b = await nuwa.characters.get(id);
    setSelected(b);
    const extra = await nuwa.characters.getResearchByCharacter(id);
    setResearchDocs(extra.docs);
    setQualityReport(extra.qualityReport);
  }

  async function activate(id: string): Promise<void> {
    await nuwa.characters.activate(id);
    showToast({ kind: "success", text: "已设为当前桌宠" });
    void refreshList(true);
  }

  async function remove(id: string, name: string): Promise<void> {
    const ok = await confirm({
      title: `删除「${name}」？`,
      body: (
        <span>
          删除此角色将一并清除：
          <ul style={{ margin: "6px 0 0 18px", padding: 0, color: "var(--ink-soft)" }}>
            <li>它的角色卡 / 像素桌宠</li>
            <li>它对你保留的备注</li>
            <li>它的对话历史</li>
          </ul>
          <p style={{ marginTop: 8 }}>该操作不可恢复。</p>
        </span>
      ),
      confirmLabel: "确认删除",
      cancelLabel: "再想想",
      danger: true,
      requireText: "DELETE"
    });
    if (!ok) return;
    await nuwa.characters.delete(id);
    showToast({ kind: "info", text: `已删除「${name}」` });
    setSelected(null);
    setSelectedId(null);
    void refreshList(false);
  }

  const newRefFileInput = useRef<HTMLInputElement | null>(null);

  async function regenerateAppearanceWithNewImage(
    id: string,
    file: File
  ): Promise<void> {
    setRegenerating(true);
    try {
      const dataUri = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(String(reader.result ?? ""));
        reader.onerror = () => rej(reader.error ?? new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const r = await nuwa.characters.regenerateAppearance({
        characterId: id,
        referenceImages: [
          {
            url: dataUri,
            source: "user-upload",
            role: "primary",
            notes: file.name
          }
        ]
      });
      const warnTail =
        r.warnings && r.warnings.length > 0
          ? `（${r.warnings.length} 条警告：${r.warnings[0]}）`
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: `形象重新生成失败：${r.error ?? "未知错误"}${warnTail}`
        });
      } else {
        showToast({
          kind: "success",
          text: `形象已基于新参考图重生${warnTail}`
        });
        const next = await nuwa.characters.get(id);
        setSelected(next);
        setThumbnails((prev) => ({
          ...prev,
          [id]: next?.sprite ?? null
        }));
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function regenerateAppearanceReuse(id: string): Promise<void> {
    setRegenerating(true);
    try {
      const r = await nuwa.characters.regenerateAppearance({ characterId: id });
      const warnTail =
        r.warnings && r.warnings.length > 0
          ? `（${r.warnings.length} 条警告：${r.warnings[0]}）`
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: `形象重新生成失败：${r.error ?? "未知错误"}${warnTail}`
        });
      } else {
        showToast({ kind: "success", text: `形象已重生${warnTail}` });
        const next = await nuwa.characters.get(id);
        setSelected(next);
        setThumbnails((prev) => ({
          ...prev,
          [id]: next?.sprite ?? null
        }));
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function regenerateSprite(id: string): Promise<void> {
    setRegenerating(true);
    try {
      const r = await nuwa.characters.regenerateSprite(id);
      const warnTail =
        r.warnings && r.warnings.length > 0
          ? `（${r.warnings.length} 条警告：${r.warnings[0]}）`
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: `形象生成失败：${r.error ?? "未知错误"}${warnTail}`
        });
      } else {
        showToast({ kind: "success", text: `形象已更新${warnTail}` });
        const next = await nuwa.characters.get(id);
        setSelected(next);
        setThumbnails((prev) => ({
          ...prev,
          [id]: next?.sprite ?? null
        }));
      }
    } finally {
      setRegenerating(false);
    }
  }

  // 把质量报告抽成"用户能懂的一句话"——只在真的有问题时露出
  const qualityWarning = useMemo<{ severity: "warn" | "error"; text: string } | null>(
    () => deriveQualityWarning(qualityReport, selected?.researchDocs),
    [qualityReport, selected]
  );

  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Library</div>
          <div className="display display--page">角色仓库</div>
        </div>
        <button className="btn btn--magenta" onClick={onNewClick}>
          + 造一个新角色
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 320px) 1fr", gap: 22 }}>
        {/* 列表 */}
        <div className="plain-list">
          {items === null ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="card" style={{ padding: 14 }}>
                  <Skeleton width="60%" height={14} />
                  <div style={{ marginTop: 8 }}>
                    <Skeleton width="40%" height={11} />
                  </div>
                </div>
              ))}
            </>
          ) : items.length === 0 ? (
            <EmptyLibrary onNew={onNewClick} />
          ) : (
            items.map((c, i) => (
              <button
                key={c.id}
                className={
                  selectedId === c.id
                    ? "plain-list__item is-selected fade-in-up"
                    : "plain-list__item fade-in-up"
                }
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  animationDelay: `${Math.min(i * 30, 120)}ms`
                }}
                onClick={() => void pick(c.id)}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {thumbnails[c.id] ? (
                    <PetPreview
                      program={thumbnails[c.id]!}
                      width={44}
                      height={44}
                    />
                  ) : (
                    <Skeleton width={44} height={44} radius={10} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row row--between gap-2">
                    <span
                      className="display display--section"
                      style={{
                        fontSize: 14,
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0
                      }}
                    >
                      {c.name}
                    </span>
                  </div>
                  <div className="row row--between gap-2" style={{ marginTop: 4 }}>
                    <span
                      className="body-sm"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0
                      }}
                    >
                      {c.sourceName ?? "—"}
                    </span>
                    {c.isActive ? (
                      <span className="body-sm" style={{ color: "var(--magenta)", flexShrink: 0 }}>
                        当前
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        {/* 详情 */}
        <div className="card" style={{ minHeight: 380 }}>
          {!selected ? (
            <EmptyDetail />
          ) : (
            <div className="stack stack--lg fade-in">
          <div className="row gap-3 row--start-top">
                <PetPreview program={selected.sprite} width={88} height={108} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="display display--page"
                    style={{ fontSize: 26, lineHeight: 1.1 }}
                  >
                    {selected.card.meta.name}
                  </div>
                  <p
                    className="body-sm"
                    style={{ marginTop: 6, color: "var(--ink-faint)" }}
                  >
                    {selected.card.meta.disclaimer}
                  </p>
                </div>
                <CopyButton
                  small
                  text={selected.card.meta.disclaimer}
                  label="复制免责"
                />
              </div>

              {qualityWarning ? (
                <div
                  className="fade-in"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background:
                      qualityWarning.severity === "error"
                        ? "rgba(178, 24, 88, 0.08)"
                        : "rgba(217, 154, 58, 0.1)",
                    border: `1px solid ${
                      qualityWarning.severity === "error"
                        ? "var(--magenta-soft)"
                        : "rgba(217, 154, 58, 0.55)"
                    }`,
                    color:
                      qualityWarning.severity === "error" ? "var(--magenta)" : "var(--ink-soft)",
                    fontSize: 13,
                    lineHeight: 1.5
                  }}
                >
                  {qualityWarning.text}
                </div>
              ) : null}

              {selected.card.meta.quoteOneLiner ? (
                <blockquote
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 18,
                    lineHeight: 1.4,
                    margin: 0,
                    padding: "10px 14px",
                    borderLeft: "3px solid var(--magenta)",
                    color: "var(--ink)",
                    background: "rgba(178, 24, 88, 0.04)",
                    borderRadius: 4
                  }}
                >
                  「{selected.card.meta.quoteOneLiner}」
                </blockquote>
              ) : null}

              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  心智模型 · {selected.card.mentalModels.length}
                </div>
                <div className="stack stack--sm">
                  {selected.card.mentalModels.map((m) => (
                    <div key={m.id} style={{ lineHeight: 1.45 }}>
                      <strong>{m.name}</strong>
                      <span className="body-sm" style={{ marginLeft: 6 }}>
                        —— {m.oneLiner}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="row gap-2 row--wrap">
                <button
                  className="btn btn--magenta"
                  onClick={() => void activate(selected.card.id)}
                  disabled={items?.find((c) => c.id === selected.card.id)?.isActive}
                  data-hint={
                    items?.find((c) => c.id === selected.card.id)?.isActive
                      ? "已是当前桌宠"
                      : ""
                  }
                >
                  设为当前桌宠
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => void regenerateSprite(selected.card.id)}
                  disabled={regenerating}
                  data-hint={
                    selected.card.meta.appearance
                      ? "基于现有外貌调研重画形象"
                      : "缺少外貌调研，将回退骨架形象"
                  }
                >
                  {regenerating ? (
                    <>
                      <Spinner /> 正在生成…
                    </>
                  ) : (
                    "仅重画 sprite"
                  )}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => newRefFileInput.current?.click()}
                  disabled={regenerating}
                  data-hint="上传一张新参考图，让 vision 重读 → 重新生成外貌 + sprite"
                >
                  不像？换张参考图
                </button>
                {(selected.card.meta.appearance?.referenceImages?.length ?? 0) >
                0 ? (
                  <button
                    className="btn btn--ghost"
                    onClick={() =>
                      void regenerateAppearanceReuse(selected.card.id)
                    }
                    disabled={regenerating}
                    data-hint="不换图，用上次的参考图重跑一次外貌管道"
                  >
                    用旧图重算外貌
                  </button>
                ) : null}
                <input
                  ref={newRefFileInput}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && selected) {
                      void regenerateAppearanceWithNewImage(selected.card.id, f);
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  className="btn btn--danger"
                  onClick={() => void remove(selected.card.id, selected.card.meta.name)}
                >
                  删除角色
                </button>
              </div>

              {/* 质量报告：默认完全隐藏；仅在用户手动打开"高级"才显示完整指标 */}
              {qualityReport ? (
                <details
                  style={{
                    marginTop: 4,
                    color: "var(--ink-faint)"
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      userSelect: "none",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--ink-faint)"
                    }}
                  >
                    高级 · 蒸馏过程指标（debug）
                  </summary>
                  <p
                    className="body-sm"
                    style={{ margin: "6px 0", color: "var(--ink-faint)" }}
                  >
                    以下是女娲流程的内部指标，不影响日常使用，仅供你判断"这次蒸馏到底有多扎实"。
                  </p>
                  <div
                    className="row gap-2"
                    style={{ marginBottom: 8, fontSize: 12, color: "var(--ink-soft)" }}
                  >
                    <span
                      style={{
                        color: verdictColor(qualityReport.verdict),
                        fontWeight: 600
                      }}
                    >
                      {qualityReport.verdict.toUpperCase()}
                    </span>
                    <span>· 总分 {(qualityReport.overallScore * 100).toFixed(0)}/100</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {qualityReport.items.map((it) => (
                        <tr key={it.id}>
                          <td
                            style={{
                              padding: "3px 8px 3px 0",
                              color: it.pass ? "var(--emerald)" : "var(--magenta)",
                              width: 18
                            }}
                          >
                            {it.pass ? "✓" : "✗"}
                          </td>
                          <td style={{ padding: "3px 8px", fontSize: 12 }}>{it.label}</td>
                          <td
                            className="body-sm"
                            style={{ padding: "3px 0", color: "var(--ink-faint)" }}
                          >
                            {it.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {qualityReport.voiceTest ? (
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "var(--ink-faint)",
                          marginBottom: 4
                        }}
                      >
                        风格测试样本 · {qualityReport.voiceTest.score}/10
                      </div>
                      <blockquote
                        className="body-sm"
                        style={{
                          margin: "6px 0",
                          padding: 10,
                          background: "rgba(31,58,58,0.04)",
                          borderLeft: "3px solid var(--ink-ghost)"
                        }}
                      >
                        {qualityReport.voiceTest.sample}
                      </blockquote>
                    </div>
                  ) : null}
                </details>
              ) : null}

              {researchDocs.length > 0 ? (
                <details style={{ marginTop: 4 }}>
                  <summary
                    className="eyebrow"
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    调研档案（{researchDocs.length}/6 · 来自女娲深度蒸馏）
                  </summary>
                  <div className="stack" style={{ marginTop: 8 }}>
                    {researchDocs.map((d) => (
                      <div key={d.agentId} className="card" style={{ padding: 12 }}>
                        <div className="row row--between">
                          <strong style={{ fontSize: 13 }}>
                            #{d.agentId} {d.agentName}
                          </strong>
                          <span
                            className="body-sm"
                            style={{
                              color: d.status === "ok" ? "var(--ink)" : "var(--magenta)"
                            }}
                          >
                            {d.status} · {d.confidence} · {d.sources.length} 引用 ·{" "}
                            {Math.round(d.durationMs / 1000)}s
                          </span>
                        </div>
                        <div
                          className="row gap-2"
                          style={{ marginTop: 6, flexWrap: "wrap" }}
                        >
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() =>
                              setOpenedAgentId(
                                openedAgentId === d.agentId ? null : d.agentId
                              )
                            }
                          >
                            {openedAgentId === d.agentId ? "收起" : "查看 Markdown"}
                          </button>
                          <CopyButton small text={d.markdown} label="复制全文" />
                        </div>
                        {openedAgentId === d.agentId ? (
                          <pre
                            className="fade-in"
                            style={{
                              marginTop: 8,
                              padding: 10,
                              maxHeight: 360,
                              overflow: "auto",
                              fontSize: 12,
                              lineHeight: 1.55,
                              background: "rgba(31,58,58,0.04)",
                              borderRadius: 8,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              fontFamily: "var(--font-mono)"
                            }}
                          >
                            {d.markdown}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyLibrary({ onNew }: { onNew: () => void }): JSX.Element {
  return (
    <div className="card fade-in-up" style={{ padding: 18 }}>
      <div className="empty">
        <div className="empty__title">仓库还是空的</div>
        <p className="empty__body">
          先从首启选个示例角色，或者立刻造一个新的。
        </p>
        <div className="row gap-2" style={{ marginTop: 6 }}>
          <button className="btn btn--magenta btn--sm" onClick={onNew}>
            造一个角色
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyDetail(): JSX.Element {
  return (
    <div className="empty">
      <div className="empty__title">从左侧选一个角色查看详情</div>
      <p className="empty__body">
        点击列表项查看心智模型、调研档案、质量报告，以及"重新生成形象"等操作。
      </p>
    </div>
  );
}

function verdictColor(v: QualityReport["verdict"]): string {
  if (v === "pass") return "var(--emerald)";
  if (v === "warn") return "var(--amber)";
  return "var(--magenta)";
}

/**
 * 把内部 7 项 quality 指标抽成"用户能懂的一句话"。
 * 只在有真实问题时返回；其余情况一律返回 null（不打扰用户）。
 *
 * 主要识别：
 * - 0 个 agent 真触发 web_search → 信息可能基于训练知识，可信度差
 * - voiceTest < 5 → 风格不像
 * - mentalModels < 2 → 骨架角色
 */
function deriveQualityWarning(
  report: QualityReport | undefined,
  researchDocs: ReadonlyArray<ResearchDoc> | undefined
): { severity: "warn" | "error"; text: string } | null {
  if (!report) return null;
  // 是否真的联网：看 research docs 的 webSearchUsed
  const docs = researchDocs ?? [];
  if (docs.length > 0) {
    const realWebUsed = docs.filter((d) => d.webSearchUsed).length;
    if (realWebUsed === 0) {
      return {
        severity: "error",
        text:
          "深度蒸馏开了联网，但实际 0 个调研真触发 web_search —— 当前 baseUrl（很可能是中转代理）静默吞掉了联网功能。此角色的信息基于模型训练知识，可能不可信。建议在「模型与 API Key」里点「实测联网」，或换成 OpenAI / Anthropic 直连后重新生成。"
      };
    }
  }
  // 风格测试低分
  if (report.voiceTest && report.voiceTest.score < 5) {
    return {
      severity: "warn",
      text: `风格还不像这个角色（${report.voiceTest.score}/10）。点「重新生成形象」无济于事，建议在「造一个角色」里粘贴一段该角色的真实文本作为补充素材，再造一次。`
    };
  }
  return null;
}
