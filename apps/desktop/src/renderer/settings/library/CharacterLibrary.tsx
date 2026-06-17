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
import { useT } from "../../shared/i18n/index.js";

interface LibraryItem {
  id: string;
  name: string;
  sourceName?: string;
  track: "utility" | "companion";
  isSkeleton: boolean;
  isActive: boolean;
}

const TRACK_KEYS: Record<LibraryItem["track"], "library.trackUtility" | "library.trackCompanion"> = {
  utility: "library.trackUtility",
  companion: "library.trackCompanion"
};

export function CharacterLibrary({
  onNewClick
}: {
  onNewClick: () => void;
}): JSX.Element {
  const t = useT();
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
        showToast({ kind: "warn", text: t("library.toastNotFound") });
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
        text: t("library.toastReadFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
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
        text: t("library.toastListFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
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
        showToast({ kind: "error", text: t("library.toastActivateFailed") });
        return;
      }
      showToast({ kind: "success", text: t("library.toastActivated") });
      void refreshList(true);
    } catch (e) {
      showToast({
        kind: "error",
        text: t("library.toastActivateError", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    } finally {
      setActivating(false);
    }
  }

  async function remove(id: string, name: string): Promise<void> {
    const ok = await confirm({
      title: t("library.deleteTitle", { name }),
      body: (
        <span>
          {t("library.deleteBodyIntro")}
          <ul style={{ margin: "6px 0 0 18px", padding: 0, color: "var(--ink-soft)" }}>
            <li>{t("library.deleteBodyItemCard")}</li>
            <li>{t("library.deleteBodyItemNotes")}</li>
            <li>{t("library.deleteBodyItemChat")}</li>
          </ul>
          <p style={{ marginTop: 8 }}>{t("library.deleteBodyIrreversible")}</p>
        </span>
      ),
      confirmLabel: t("common.confirmDelete"),
      cancelLabel: t("common.thinkAgain"),
      danger: true,
      requireText: "DELETE"
    });
    if (!ok) return;
    try {
      await nuwa.characters.delete(id);
      showToast({ kind: "info", text: t("library.toastDeleted", { name }) });
      // 不立即清空 selected——等 refreshList 自动选下一个
      setSelectedId(null);
      void refreshList(false);
    } catch (e) {
      showToast({
        kind: "error",
        text: t("library.toastDeleteFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
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
        text: t("library.toastImageTooLarge", {
          size: (file.size / 1024 / 1024).toFixed(1)
        })
      });
      return;
    }
    const ok = await confirm({
      title: t("library.confirmNewRefTitle"),
      body: t("library.confirmNewRefBody"),
      confirmLabel: t("library.confirmNewRefConfirm"),
      cancelLabel: t("common.cancel")
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
          ? t("library.warningsSuffix", { count: r.warnings.length })
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: t("library.toastRegenerateFailed", {
            error: r.error ?? t("common.unknownError")
          })
        });
      } else {
        showToast({
          kind: "success",
          text: t("library.toastRegenerateSuccess", { warnings: warnTail })
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
        text: t("library.toastRegenerateFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    } finally {
      setRegenerating(false);
    }
  }

  async function regenerateSprite(id: string): Promise<void> {
    const ok = await confirm({
      title: t("library.confirmSpriteTitle"),
      body: t("library.confirmSpriteBody"),
      confirmLabel: t("library.confirmSpriteConfirm"),
      cancelLabel: t("common.cancel")
    });
    if (!ok) return;
    setRegenerating(true);
    try {
      const r = await nuwa.characters.regenerateSprite(id);
      const warnTail =
        r.warnings && r.warnings.length > 0
          ? t("library.warningsSuffix", { count: r.warnings.length })
          : "";
      if (!r.ok) {
        showToast({
          kind: "error",
          text: t("library.toastSpriteRegenerateFailed", {
            error: r.error ?? t("common.unknownError")
          })
        });
      } else {
        showToast({ kind: "success", text: t("library.toastSpriteUpdated", { warnings: warnTail }) });
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
    () => deriveQualityWarning(qualityReport, selected?.researchDocs, t),
    [qualityReport, selected, t]
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
          <div className="eyebrow">{t("library.eyebrow")}</div>
          <div className="display display--page">{t("library.title")}</div>
          <p className="apple-page-subtitle">{t("library.subtitle")}</p>
        </div>
        <button className="btn btn--magenta" onClick={onNewClick}>
          {t("library.newCharacter")}
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
            <EmptyLibrary onNew={onNewClick} t={t} />
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
                          {t("library.current")}
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
                        {displayName.englishName || t("library.noEnglishName")}
                      </span>
                      <span
                        className={
                          c.track === "utility"
                            ? "bl-tag bl-tag--utility"
                            : "bl-tag bl-tag--companion"
                        }
                        style={{ flexShrink: 0, opacity: 0.78 }}
                      >
                        {t(TRACK_KEYS[c.track])}
                      </span>
                      {c.isSkeleton ? (
                        <span
                          className="bl-tag bl-tag--skeleton"
                          style={{ flexShrink: 0, opacity: 0.72 }}
                        >
                          {t("library.skeleton")}
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
            <EmptyDetail t={t} />
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
                        {t(TRACK_KEYS[selectedItem.track])}
                      </span>
                    ) : null}
                    {isSelectedActive ? (
                      <span className="bl-tag bl-tag--active">
                        <span className="bl-tag__dot" />
                        {t("library.onDesktop")}
                      </span>
                    ) : null}
                    {selectedItem?.isSkeleton ? (
                      <span className="bl-tag bl-tag--skeleton">{t("library.skeleton")}</span>
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
                    <div className="bl-status-strip__title">{t("library.trustHintTitle")}</div>
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
                  <span className="bl-section__title">{t("library.mentalModels")}</span>
                  <span className="bl-section__caption">
                    {t("library.mentalModelsCaption", {
                      count: selected.card.mentalModels.length
                    })}
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
                  data-hint={isSelectedActive ? t("library.alreadyActiveHint") : ""}
                >
                  {activating ? <><Spinner /> {t("library.activating")}</> : t("library.setActive")}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => void regenerateSprite(selected.card.id)}
                  disabled={anyBusy}
                  data-hint={
                    selected.card.meta.appearance
                      ? t("library.regenerateSpriteHintWithAppearance")
                      : t("library.regenerateSpriteHintSkeleton")
                  }
                >
                  {regenerating ? <><Spinner /> {t("library.processing")}</> : t("library.regenerateSprite")}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => newRefFileInput.current?.click()}
                  disabled={anyBusy}
                  data-hint={t("library.newReferenceHint")}
                >
                  {t("library.newReference")}
                </button>
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
                  {t("library.delete")}
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
                    {t("library.researchArchive", { count: researchDocs.length })}
                    <span
                      className="body-sm"
                      style={{ marginLeft: 8, fontWeight: 400 }}
                    >
                      {t("library.researchArchiveHint")}
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
                            {d.status === "ok" ? t("library.researchDone") : t("library.researchFailed")} · {t("library.researchSources", { count: d.sources.length })}
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
                            {openedAgentId === d.agentId ? t("library.collapse") : t("library.viewMarkdown")}
                          </button>
                          <CopyButton small text={d.markdown} label={t("library.copyFull")} />
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
                    {t("library.debugMetrics")}
                  </summary>
                  <p
                    className="body-sm"
                    style={{ margin: "6px 0", color: "var(--ink-faint)" }}
                  >
                    {t("library.debugMetricsHint")}
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
                    <span>
                      {t("library.debugScore", {
                        score: (qualityReport.overallScore * 100).toFixed(0)
                      })}
                    </span>
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
                        {t("library.voiceTestSample", { score: qualityReport.voiceTest.score })}
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

function EmptyLibrary({
  onNew,
  t
}: {
  onNew: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}): JSX.Element {
  return (
    <div className="bl-card fade-in-up" style={{ padding: 22 }}>
      <div className="empty">
        <div className="empty__title">{t("library.emptyTitle")}</div>
        <p className="empty__body">{t("library.emptyBody")}</p>
        <div className="row gap-2" style={{ marginTop: 6 }}>
          <button className="btn btn--magenta btn--sm" onClick={onNew}>
            {t("library.emptyCta")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyDetail({
  t
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
}): JSX.Element {
  return (
    <div className="empty">
      <div className="empty__title">{t("library.detailEmptyTitle")}</div>
      <p className="empty__body">{t("library.detailEmptyBody")}</p>
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
  researchDocs: ReadonlyArray<ResearchDoc> | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): { severity: "warn" | "error"; text: string } | null {
  if (!report) return null;
  const docs = researchDocs ?? [];
  if (docs.length > 0) {
    const realWebUsed = docs.filter((d) => d.webSearchUsed).length;
    if (realWebUsed === 0) {
      return {
        severity: "warn",
        text: t("library.qualityNoWeb")
      };
    }
  }
  if (report.voiceTest && report.voiceTest.score < 5) {
    return {
      severity: "warn",
      text: t("library.qualityLowVoice", { score: report.voiceTest.score })
    };
  }
  return null;
}
