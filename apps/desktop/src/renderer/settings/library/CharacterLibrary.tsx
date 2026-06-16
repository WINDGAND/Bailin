import { useEffect, useMemo, useRef, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { getCharacterDisplayNames } from "../../shared/character-display-name.js";
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

const TRACK_LABEL: Record<LibraryItem["track"], string> = {
  utility: "思维顾问",
  companion: "情感陪伴"
};

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
  const [activating, setActivating] = useState(false);
  const [researchDocs, setResearchDocs] = useState<ResearchDoc[]>([]);
  const [qualityReport, setQualityReport] = useState<QualityReport | undefined>(undefined);
  const [openedAgentId, setOpenedAgentId] = useState<number | null>(null);

  async function pick(id: string): Promise<void> {
    setSelectedId(id);
    setOpenedAgentId(null);
    try {
      const b = await nuwa.characters.get(id);
      if (!b) {
        showToast({ kind: "warn", text: "角色不存在或已损坏" });
        setSelected(null);
        return;
      }
      setSelected(b);
      const extra = await nuwa.characters.getResearchByCharacter(id);
      setResearchDocs(extra.docs);
      setQualityReport(extra.qualityReport);
    } catch (e) {
      showToast({
        kind: "error",
        text: `读取失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    }
  }

  async function refreshList(keepSelected = true): Promise<void> {
    let list: LibraryItem[] = [];
    try {
      list = (await nuwa.characters.list()) as LibraryItem[];
    } catch (e) {
      showToast({
        kind: "error",
        text: `读取角色列表失败：${e instanceof Error ? e.message : "未知错误"}`
      });
      setItems([]);
      return;
    }
    setItems(list);
    void prefetchThumbnails(list);
    if (keepSelected && selectedId) {
      // 当前选中角色还在 → 同步详情；否则跳到 active 或第一个
      const stillExists = list.some((c) => c.id === selectedId);
      if (stillExists) {
        const next = await nuwa.characters.get(selectedId);
        setSelected(next);
        const extra = await nuwa.characters.getResearchByCharacter(selectedId);
        setResearchDocs(extra.docs);
        setQualityReport(extra.qualityReport);
      } else {
        await autoSelect(list);
      }
    } else if (!selectedId) {
      await autoSelect(list);
    }
  }

  async function autoSelect(list: LibraryItem[]): Promise<void> {
    if (list.length === 0) {
      setSelected(null);
      setSelectedId(null);
      return;
    }
    const target = list.find((c) => c.isActive) ?? list[0]!;
    await pick(target.id);
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

  async function activate(id: string): Promise<void> {
    setActivating(true);
    try {
      const r = await nuwa.characters.activate(id);
      if (!r.ok) {
        showToast({ kind: "error", text: "切换桌宠失败：角色可能已被删除" });
        return;
      }
      showToast({ kind: "success", text: "已设为当前桌宠" });
      void refreshList(true);
    } catch (e) {
      showToast({
        kind: "error",
        text: `切换失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    } finally {
      setActivating(false);
    }
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
    try {
      await nuwa.characters.delete(id);
      showToast({ kind: "info", text: `已删除「${name}」` });
      // 不立即清空 selected——等 refreshList 自动选下一个
      setSelectedId(null);
      void refreshList(false);
    } catch (e) {
      showToast({
        kind: "error",
        text: `删除失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    }
  }

  const newRefFileInput = useRef<HTMLInputElement | null>(null);

  async function regenerateAppearanceWithNewImage(
    id: string,
    file: File
  ): Promise<void> {
    if (file.size > 4 * 1024 * 1024) {
      showToast({
        kind: "warn",
        text: `参考图超过 4MB（${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩后再上传`
      });
      return;
    }
    const ok = await confirm({
      title: "用这张参考图重新画形象？",
      body:
        "会基于新参考图重跑外貌管道并覆盖现有形象。原 sprite 不会保留。",
      confirmLabel: "重新画",
      cancelLabel: "不了"
    });
    if (!ok) return;
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
          ? `（${r.warnings.length} 条警告）`
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: `形象重新生成失败：${r.error ?? "未知错误"}`
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
    } catch (e) {
      showToast({
        kind: "error",
        text: `重新生成失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    } finally {
      setRegenerating(false);
    }
  }

  async function regenerateAppearanceReuse(id: string): Promise<void> {
    const ok = await confirm({
      title: "用旧参考图重画形象？",
      body: "会重跑一次外貌管道。原 sprite 会被覆盖。",
      confirmLabel: "重画",
      cancelLabel: "不了"
    });
    if (!ok) return;
    setRegenerating(true);
    try {
      const r = await nuwa.characters.regenerateAppearance({ characterId: id });
      const warnTail =
        r.warnings && r.warnings.length > 0
          ? `（${r.warnings.length} 条警告）`
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: `形象重新生成失败：${r.error ?? "未知错误"}`
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
    const ok = await confirm({
      title: "重新生成像素形象？",
      body: "会基于现有外貌调研重画 sprite，原形象不保留。",
      confirmLabel: "重画",
      cancelLabel: "不了"
    });
    if (!ok) return;
    setRegenerating(true);
    try {
      const r = await nuwa.characters.regenerateSprite(id);
      const warnTail =
        r.warnings && r.warnings.length > 0
          ? `（${r.warnings.length} 条警告）`
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: `形象生成失败：${r.error ?? "未知错误"}`
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

  const qualityWarning = useMemo<{ severity: "warn" | "error"; text: string } | null>(
    () => deriveQualityWarning(qualityReport, selected?.researchDocs),
    [qualityReport, selected]
  );

  const selectedDisplayName = useMemo(
    () =>
      selected
        ? getCharacterDisplayNames(selected.card.meta)
        : null,
    [selected]
  );

  const selectedItem = useMemo(
    () => (selected ? items?.find((c) => c.id === selected.card.id) : undefined),
    [items, selected]
  );
  const isSelectedActive = selectedItem?.isActive ?? false;
  const anyBusy = regenerating || activating;

  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 26 }}>
        <div>
          <div className="eyebrow">Library</div>
          <div className="display display--page">角色仓库</div>
          <p className="apple-page-subtitle">
            管理已经上桌的角色。这里不是数据库，是你的桌面生命管理台。
          </p>
        </div>
        <button className="btn btn--magenta" onClick={onNewClick}>
          + 造一个新角色
        </button>
      </div>
      <div className="apple-two-column">
        {/* —————— 列表 —————— */}
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
            items.map((c, i) => {
              const displayName = getCharacterDisplayNames({
                name: c.name,
                sourceName: c.sourceName
              });
              return (
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
                      justifyContent: "center",
                      borderRadius: 10,
                      background: c.isActive ? "rgba(178, 24, 88, 0.08)" : "rgba(255, 255, 255, 0.62)",
                      transition: "background var(--motion-fast) var(--ease-out)"
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
                    <div className="row gap-2">
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
                        {displayName.chineseName}
                      </span>
                      {c.isActive ? (
                        <span className="bl-tag bl-tag--active" style={{ transform: "scale(0.92)" }}>
                          <span className="bl-tag__dot" />
                          当前
                        </span>
                      ) : null}
                    </div>
                    <div className="row gap-2" style={{ marginTop: 6 }}>
                      <span
                        className="body-sm"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0
                        }}
                      >
                        {displayName.englishName || "—"}
                      </span>
                      <span
                        className={
                          c.track === "utility"
                            ? "bl-tag bl-tag--utility"
                            : "bl-tag bl-tag--companion"
                        }
                        style={{ flexShrink: 0, opacity: 0.78 }}
                      >
                        {TRACK_LABEL[c.track]}
                      </span>
                      {c.isSkeleton ? (
                        <span
                          className="bl-tag bl-tag--skeleton"
                          style={{ flexShrink: 0, opacity: 0.72 }}
                        >
                          待完善
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* —————— 详情 —————— */}
        <div className="bl-card" style={{ minHeight: 380 }}>
          {!selected ? (
            <EmptyDetail />
          ) : (
            <div className="stack stack--lg fade-in">
              <div className="row gap-3 row--start-top">
                <div
                  className="apple-stage"
                  style={{
                    flexShrink: 0,
                    width: 128,
                    height: 148,
                    borderRadius: 24
                  }}
                >
                  <PetPreview program={selected.sprite} width={108} height={128} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row gap-2" style={{ marginBottom: 6 }}>
                    {selectedItem ? (
                      <span
                        className={
                          selectedItem.track === "utility"
                            ? "bl-tag bl-tag--utility"
                            : "bl-tag bl-tag--companion"
                        }
                      >
                        {TRACK_LABEL[selectedItem.track]}
                      </span>
                    ) : null}
                    {isSelectedActive ? (
                      <span className="bl-tag bl-tag--active">
                        <span className="bl-tag__dot" />
                        已在桌面
                      </span>
                    ) : null}
                    {selectedItem?.isSkeleton ? (
                      <span className="bl-tag bl-tag--skeleton">待完善</span>
                    ) : null}
                  </div>
                  <div
                    className="display display--page"
                    style={{ fontSize: 28, lineHeight: 1.1 }}
                  >
                    {selectedDisplayName?.chineseName}
                  </div>
                  {selectedDisplayName?.englishName ? (
                    <p
                      className="body-sm"
                      style={{ marginTop: 4, color: "var(--ink-soft)" }}
                    >
                      {selectedDisplayName.englishName}
                    </p>
                  ) : null}
                  <p
                    className="body-sm"
                    style={{ marginTop: 8, color: "var(--ink-faint)" }}
                  >
                    {selected.card.meta.disclaimer}
                  </p>
                </div>
              </div>

              {qualityWarning ? (
                <div
                  className={
                    qualityWarning.severity === "error"
                      ? "bl-status-strip is-error fade-in"
                      : "bl-status-strip is-warn fade-in"
                  }
                >
                  <div className="bl-status-strip__body">
                    <div className="bl-status-strip__title">可信度提示</div>
                    <div className="bl-status-strip__detail">{qualityWarning.text}</div>
                  </div>
                </div>
              ) : null}

              {selected.card.meta.quoteOneLiner ? (
                <blockquote
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 18,
                    lineHeight: 1.5,
                    margin: 0,
                    padding: "12px 16px",
                    borderLeft: "3px solid var(--magenta)",
                    color: "var(--ink)",
                    background: "var(--paper)",
                    borderRadius: 4
                  }}
                >
                  「{selected.card.meta.quoteOneLiner}」
                </blockquote>
              ) : null}

              <section className="bl-section">
                <header className="bl-section__head">
                  <span className="bl-section__title">心智模型</span>
                  <span className="bl-section__caption">
                    {selected.card.mentalModels.length} 条 · 决定它怎么思考
                  </span>
                </header>
                <div className="stack stack--sm">
                  {selected.card.mentalModels.map((m) => (
                    <div key={m.id} style={{ lineHeight: 1.5 }}>
                      <strong style={{ color: "var(--ink)" }}>{m.name}</strong>
                      <span className="body-sm" style={{ marginLeft: 8 }}>
                        —— {m.oneLiner}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="row gap-2 row--wrap">
                <button
                  className="btn btn--magenta"
                  onClick={() => void activate(selected.card.id)}
                  disabled={isSelectedActive || anyBusy}
                  data-hint={isSelectedActive ? "已是当前桌宠" : ""}
                >
                  {activating ? <><Spinner /> 切换中…</> : "设为当前桌宠"}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => void regenerateSprite(selected.card.id)}
                  disabled={anyBusy}
                  data-hint={
                    selected.card.meta.appearance
                      ? "基于现有外貌重画像素形象"
                      : "缺少外貌调研，将回退骨架形象"
                  }
                >
                  {regenerating ? <><Spinner /> 处理中…</> : "重画形象"}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => newRefFileInput.current?.click()}
                  disabled={anyBusy}
                  data-hint="上传一张新参考图，重新生成外貌 + 形象"
                >
                  换张参考图
                </button>
                {(selected.card.meta.appearance?.referenceImages?.length ?? 0) > 0 ? (
                  <button
                    className="btn btn--ghost"
                    onClick={() =>
                      void regenerateAppearanceReuse(selected.card.id)
                    }
                    disabled={anyBusy}
                    data-hint="不换图，用上次的参考图再算一次外貌"
                  >
                    用旧图重算
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
                  disabled={anyBusy}
                >
                  删除角色
                </button>
              </div>

              {/* —————— 调研档案（默认收起） —————— */}
              {researchDocs.length > 0 ? (
                <details style={{ marginTop: 4 }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      userSelect: "none",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink-soft)",
                      padding: "8px 0"
                    }}
                  >
                    调研档案 · {researchDocs.length} 篇
                    <span
                      className="body-sm"
                      style={{ marginLeft: 8, fontWeight: 400 }}
                    >
                      女娲深度蒸馏的原始素材，可展开查看与复制
                    </span>
                  </summary>
                  <div className="stack" style={{ marginTop: 8 }}>
                    {researchDocs.map((d) => (
                      <div
                        key={d.agentId}
                        style={{
                          padding: 14,
                          background: "var(--paper)",
                          borderRadius: 10,
                          border: "1px solid var(--grid-strong)"
                        }}
                      >
                        <div className="row row--between">
                          <strong style={{ fontSize: 13, color: "var(--ink)" }}>
                            {d.agentName}
                          </strong>
                          <span
                            className="body-sm"
                            style={{
                              color:
                                d.status === "ok"
                                  ? "var(--emerald)"
                                  : "var(--magenta)"
                            }}
                          >
                            {d.status === "ok" ? "完成" : "失败"} · {d.sources.length} 引用
                          </span>
                        </div>
                        <div
                          className="row gap-2"
                          style={{ marginTop: 8, flexWrap: "wrap" }}
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
                              background: "var(--paper-deep)",
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

              {/* —————— 蒸馏过程指标（debug，默认深藏） —————— */}
              {qualityReport ? (
                <details style={{ marginTop: 4, color: "var(--ink-faint)" }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      userSelect: "none",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--ink-faint)",
                      padding: "6px 0"
                    }}
                  >
                    蒸馏过程指标（debug）
                  </summary>
                  <p
                    className="body-sm"
                    style={{ margin: "6px 0", color: "var(--ink-faint)" }}
                  >
                    女娲流程的内部指标，仅供你判断"这次蒸馏到底有多扎实"。
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
                          background: "var(--paper-deep)",
                          borderLeft: "3px solid var(--ink-ghost)"
                        }}
                      >
                        {qualityReport.voiceTest.sample}
                      </blockquote>
                    </div>
                  ) : null}
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
    <div className="bl-card fade-in-up" style={{ padding: 22 }}>
      <div className="empty">
        <div className="empty__title">仓库还是空的</div>
        <p className="empty__body">立刻造一只，让它上桌陪你。</p>
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
      <div className="empty__title">选一个角色查看详情</div>
      <p className="empty__body">
        从左侧点选，能看到它的金句、心智模型和"重画形象"等操作。
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
 * 只在有真实问题时返回；其余情况一律返回 null。
 */
function deriveQualityWarning(
  report: QualityReport | undefined,
  researchDocs: ReadonlyArray<ResearchDoc> | undefined
): { severity: "warn" | "error"; text: string } | null {
  if (!report) return null;
  const docs = researchDocs ?? [];
  if (docs.length > 0) {
    const realWebUsed = docs.filter((d) => d.webSearchUsed).length;
    // 全员都没拿到来源时，给一个温和的"可信度偏低"提示——不再标红 error。
    // 真要修，用户可以在「重生角色」时贴文本素材，自然会比联网更可靠。
    if (realWebUsed === 0) {
      return {
        severity: "warn",
        text: "这次调研主要靠模型已有知识。如果想更贴近原型，可以在「造一个角色」里贴一段他的真实文本再造一次。"
      };
    }
  }
  if (report.voiceTest && report.voiceTest.score < 5) {
    return {
      severity: "warn",
      text: `风格相似度 ${report.voiceTest.score}/10，还有空间。可以在「造一个角色」里粘贴一段该角色的真实文本作为补充素材，再造一次会更像。`
    };
  }
  return null;
}
