import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useBailin } from "../../shared/use-bailin.js";
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
  QualityCheckItem,
  QualityReport,
  ResearchDoc,
  SpriteProgram
} from "@bailin/character-protocol";
import { useT } from "../../shared/i18n/index.js";
import { ChatMarkdown } from "../../shared/chat-markdown.js";
import { Icon } from "../../shared/icon.js";
import { useVisualJobs } from "../app/visual-job-context.js";
import { runDetailTransition } from "./detail-transition.js";

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

const LIBRARY_PAGE_SIZE = 6;

type PageDirection = "forward" | "backward";

function libraryItemMatchesSearch(item: LibraryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const displayName = getCharacterDisplayNames({
    name: item.name,
    sourceName: item.sourceName
  });
  const haystack = [
    displayName.chineseName,
    displayName.englishName,
    item.name,
    item.sourceName ?? ""
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function CharacterLibrary({
  onNewClick
}: {
  onNewClick: () => void;
}): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const {
    getJob,
    isBusy,
    runSpriteRegeneration,
    runAppearanceRegeneration,
    subscribeJobSettled
  } = useVisualJobs();

  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, SpriteProgram | null>>({});
  const [selected, setSelected] = useState<CharacterBundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [researchDocs, setResearchDocs] = useState<ResearchDoc[]>([]);
  const [qualityReport, setQualityReport] = useState<QualityReport | undefined>(undefined);
  const [openedAgentId, setOpenedAgentId] = useState<number | null>(null);
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [listPage, setListPage] = useState(1);
  const [pageMotion, setPageMotion] = useState<{ nonce: number; direction: PageDirection }>({
    nonce: 0,
    direction: "forward"
  });
  const pickRequestRef = useRef(0);
  const newRefFileInput = useRef<HTMLInputElement | null>(null);
  const appearanceMenuRef = useRef<HTMLDivElement | null>(null);
  const appearanceMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  async function pick(id: string): Promise<void> {
    const requestId = ++pickRequestRef.current;
    setSelectedId(id);
    setOpenedAgentId(null);
    setAppearanceMenuOpen(false);

    try {
      const [b, extra] = await Promise.all([
        bailin.characters.get(id),
        bailin.characters.getResearchByCharacter(id)
      ]);
      if (requestId !== pickRequestRef.current) return;
      if (!b) {
        showToast({ kind: "warn", text: t("library.toastNotFound") });
        setSelected(null);
        return;
      }
      const viewTransitionDocument = document as Document & {
        startViewTransition?: (update: () => void) => unknown;
      };
      runDetailTransition(
        () => {
          flushSync(() => {
            setSelected(b);
            setResearchDocs(extra.docs);
            setQualityReport(extra.qualityReport);
          });
        },
        {
          startViewTransition:
            viewTransitionDocument.startViewTransition?.bind(viewTransitionDocument)
        }
      );
    } catch (e) {
      if (requestId !== pickRequestRef.current) return;
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
      list = (await bailin.characters.list()) as LibraryItem[];
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
        const next = await bailin.characters.get(selectedId);
        setSelected(next);
        const extra = await bailin.characters.getResearchByCharacter(selectedId);
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
      const b = await bailin.characters.get(item.id);
      setThumbnails((prev) => ({ ...prev, [item.id]: b?.sprite ?? null }));
    }
  }

  useEffect(() => {
    void refreshList(false);
    const offActive = bailin.on.activeCharacterChanged(() => void refreshList(true));
    const offSettled = subscribeJobSettled((characterId, outcome) => {
      if (outcome !== "success") return;
      void (async () => {
        await refreshList(true);
        const next = await bailin.characters.get(characterId);
        if (next) {
          setThumbnails((prev) => ({ ...prev, [characterId]: next.sprite ?? null }));
        }
      })();
    });
    return () => {
      offActive();
      offSettled();
    };
  }, [bailin, subscribeJobSettled]);

  async function activate(id: string): Promise<void> {
    setActivating(true);
    try {
      const r = await bailin.characters.activate(id);
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
      await bailin.characters.delete(id);
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
  const selectedVisualJob = selected ? getJob(selected.card.id) : undefined;
  const selectedRegenerating = selected ? isBusy(selected.card.id) : false;
  const anyBusy = selectedRegenerating || activating;

  const filteredItems = useMemo(() => {
    if (!items) return null;
    return items.filter((c) => libraryItemMatchesSearch(c, searchQuery));
  }, [items, searchQuery]);

  const totalPages = useMemo(() => {
    const count = filteredItems?.length ?? 0;
    return Math.max(1, Math.ceil(count / LIBRARY_PAGE_SIZE));
  }, [filteredItems]);

  const currentPage = Math.min(listPage, totalPages);

  const paginatedItems = useMemo(() => {
    if (!filteredItems) return null;
    const start = (currentPage - 1) * LIBRARY_PAGE_SIZE;
    return filteredItems.slice(start, start + LIBRARY_PAGE_SIZE);
  }, [filteredItems, currentPage]);

  useEffect(() => {
    setListPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  useEffect(() => {
    if (!appearanceMenuOpen) return;
    function onPointerDown(e: MouseEvent): void {
      const target = e.target as Node;
      if (appearanceMenuRef.current?.contains(target)) return;
      if (appearanceMenuTriggerRef.current?.contains(target)) return;
      setAppearanceMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setAppearanceMenuOpen(false);
        appearanceMenuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [appearanceMenuOpen]);

  useEffect(() => {
    if (selectedRegenerating) setAppearanceMenuOpen(false);
  }, [selectedRegenerating]);

  function changeListPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) return;
    setPageMotion((current) => ({
      nonce: current.nonce + 1,
      direction: nextPage > currentPage ? "forward" : "backward"
    }));
    setListPage(nextPage);
  }

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
        <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
          {items && items.length > 0 ? (
            <div style={{ padding: "0 0 12px" }}>
              <div className="input-group">
                <span className="input-group__prefix" aria-hidden="true">
                  <SearchIcon size={16} />
                </span>
                <input
                  type="search"
                  className="input input--with-prefix"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("library.searchPlaceholder")}
                  aria-label={t("library.searchAria")}
                />
              </div>
            </div>
          ) : null}
          <div className="plain-list">
          {items === null ? (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="plain-list__item"
                  style={{ display: "flex", gap: 12, alignItems: "center", cursor: "default" }}
                  aria-hidden="true"
                >
                  <Skeleton width={44} height={44} radius={10} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Skeleton width="60%" height={14} />
                    <div style={{ marginTop: 8 }}>
                      <Skeleton width="40%" height={11} />
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : items.length === 0 ? (
            <EmptyLibrary onNew={onNewClick} t={t} />
          ) : filteredItems!.length === 0 ? (
            <div
              className="plain-list__item"
              style={{
                padding: "24px 16px",
                textAlign: "center",
                cursor: "default"
              }}
            >
              <p className="body-sm" style={{ color: "var(--ink-soft)", margin: 0 }}>
                {t("library.searchNoResults")}
              </p>
            </div>
          ) : (
            paginatedItems!.map((c, i) => {
              const displayName = getCharacterDisplayNames({
                name: c.name,
                sourceName: c.sourceName
              });
              const itemJob = getJob(c.id);
              const itemBusy = itemJob?.status === "running";
              return (
                <button
                  key={`${pageMotion.nonce}-${c.id}`}
                  type="button"
                  className={
                    selectedId === c.id
                      ? `plain-list__item is-selected library-list-item--page-in library-list-item--${pageMotion.direction}`
                      : `plain-list__item library-list-item--page-in library-list-item--${pageMotion.direction}`
                  }
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    animationDelay: `${Math.min(i * 24, 120)}ms`
                  }}
                  onClick={() => void pick(c.id)}
                >
                  <div
                    className={`library-item__thumb${c.isActive ? " is-active-pet" : ""}`}
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
                        <span className="bl-tag bl-tag--sm bl-tag--active">
                          <span className="bl-tag__dot" />
                          {t("library.current")}
                        </span>
                      ) : null}
                      {itemBusy ? (
                        <span className="bl-tag bl-tag--sm">
                          <Spinner />
                          {t("library.processing")}
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
          {filteredItems && filteredItems.length > LIBRARY_PAGE_SIZE ? (
            <div className="library-pagination">
              <span className="library-pagination__summary body-sm">
                {t("library.paginationSummary", {
                  total: filteredItems.length,
                  page: currentPage,
                  pages: totalPages
                })}
              </span>
              <div className="library-pagination__controls">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={currentPage <= 1}
                  onClick={() => changeListPage(currentPage - 1)}
                >
                  {t("library.paginationPrev")}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={currentPage >= totalPages}
                  onClick={() => changeListPage(currentPage + 1)}
                >
                  {t("library.paginationNext")}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* —————— 详情 —————— */}
        <div className="bl-card library-detail-surface" style={{ minHeight: 380 }}>
          {!selected ? (
            <EmptyDetail t={t} />
          ) : (
            <div className="library-detail stack stack--lg">
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
                    style={{ marginTop: 8, color: "var(--ink-caption)" }}
                  >
                    {selected.card.meta.disclaimer}
                  </p>
                </div>
              </div>

              {qualityWarning ? (
                <div
                  className={
                    qualityWarning.severity === "error"
                      ? "bl-status-strip is-error"
                      : "bl-status-strip is-warn"
                  }
                >
                  <div className="bl-status-strip__body">
                    <div className="bl-status-strip__title">{t("library.trustHintTitle")}</div>
                    <div className="bl-status-strip__detail">{qualityWarning.text}</div>
                  </div>
                </div>
              ) : null}

              {selected.card.meta.quoteOneLiner ? (
                <blockquote className="char-quote">
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
                <ul className="mental-model-list">
                  {selected.card.mentalModels.map((m) => (
                    <li key={m.id} className="mental-model-item">
                      <span className="mental-model-item__name">{m.name}</span>
                      <span className="mental-model-item__line">{m.oneLiner}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {selectedVisualJob && selectedVisualJob.status !== "running" ? (
                <div
                  className={
                    selectedVisualJob.status === "error"
                      ? "bl-status-strip is-error"
                      : "bl-status-strip is-ok"
                  }
                >
                  <div className="bl-status-strip__body">
                    <div className="bl-status-strip__detail">
                      {selectedVisualJob.status === "error"
                        ? t("library.visualJobFailed", {
                            name: selectedVisualJob.characterName,
                            error: selectedVisualJob.error ?? t("common.unknownError")
                          })
                        : selectedVisualJob.kind === "sprite"
                          ? t("library.visualJobDoneSprite", {
                              name: selectedVisualJob.characterName
                            })
                          : t("library.visualJobDoneAppearance", {
                              name: selectedVisualJob.characterName
                            })}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="library-actions">
                <div className="library-actions__primary">
                  <button
                    type="button"
                    className="btn btn--magenta"
                    onClick={() => void activate(selected.card.id)}
                    disabled={isSelectedActive || anyBusy}
                    data-hint={isSelectedActive ? t("library.alreadyActiveHint") : ""}
                  >
                    {activating ? (
                      <>
                        <Spinner /> {t("library.activating")}
                      </>
                    ) : (
                      t("library.setActive")
                    )}
                  </button>

                  <div className="library-actions__menu-wrap">
                    <button
                      ref={appearanceMenuTriggerRef}
                      type="button"
                      className="btn btn--ghost"
                      aria-haspopup="menu"
                      aria-expanded={appearanceMenuOpen}
                      disabled={activating}
                      onClick={() => {
                        if (selectedRegenerating) return;
                        setAppearanceMenuOpen((open) => !open);
                      }}
                    >
                      {selectedRegenerating ? (
                        <>
                          <Spinner /> {t("library.processing")}
                        </>
                      ) : (
                        <>
                          {t("library.appearanceMenu")}
                          <Icon
                            name="chevron-down"
                            size={14}
                            className="library-actions__chevron"
                          />
                        </>
                      )}
                    </button>
                    {appearanceMenuOpen ? (
                      <div
                        ref={appearanceMenuRef}
                        className="library-actions__menu fade-in"
                        role="menu"
                        aria-label={t("library.appearanceMenu")}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="library-actions__menu-item"
                          disabled={anyBusy}
                          data-hint={
                            selected.card.meta.appearance
                              ? t("library.regenerateSpriteHintWithAppearance")
                              : t("library.regenerateSpriteHintSkeleton")
                          }
                          onClick={() => {
                            setAppearanceMenuOpen(false);
                            void runSpriteRegeneration(
                              selected.card.id,
                              selected.card.meta.name
                            );
                          }}
                        >
                          <span className="library-actions__menu-label">
                            {t("library.regenerateSprite")}
                          </span>
                          <span className="library-actions__menu-caption">
                            {selected.card.meta.appearance
                              ? t("library.regenerateSpriteHintWithAppearance")
                              : t("library.regenerateSpriteHintSkeleton")}
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="library-actions__menu-item"
                          disabled={anyBusy}
                          data-hint={t("library.newReferenceHint")}
                          onClick={() => {
                            setAppearanceMenuOpen(false);
                            newRefFileInput.current?.click();
                          }}
                        >
                          <span className="library-actions__menu-label">
                            {t("library.newReference")}
                          </span>
                          <span className="library-actions__menu-caption">
                            {t("library.newReferenceHint")}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <input
                    ref={newRefFileInput}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && selected) {
                        void runAppearanceRegeneration(
                          selected.card.id,
                          selected.card.meta.name,
                          f
                        );
                      }
                      e.target.value = "";
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => void remove(selected.card.id, selected.card.meta.name)}
                  disabled={anyBusy}
                >
                  {t("library.delete")}
                </button>
              </div>

              {/* —————— 调研档案（默认收起 · 扁平卷宗列表） —————— */}
              {researchDocs.length > 0 ? (
                <ResearchArchiveSection
                  docs={researchDocs}
                  openedAgentId={openedAgentId}
                  onToggle={(agentId) =>
                    setOpenedAgentId(openedAgentId === agentId ? null : agentId)
                  }
                />
              ) : null}

              {/* —————— 蒸馏过程指标（与调研档案同壳） —————— */}
              {qualityReport ? <QualityMetricsSection report={qualityReport} /> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function researchExcerpt(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*•]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
    if (line.length < 8) continue;
    if (line.startsWith("```") || line.startsWith("|") || line.startsWith("---")) continue;
    return line;
  }
  return markdown.replace(/\s+/g, " ").trim().slice(0, 96);
}

function ResearchArchiveSection({
  docs,
  openedAgentId,
  onToggle
}: {
  docs: ReadonlyArray<ResearchDoc>;
  openedAgentId: number | null;
  onToggle: (agentId: number) => void;
}): JSX.Element {
  const t = useT();
  const sorted = useMemo(
    () => [...docs].sort((a, b) => a.agentId - b.agentId),
    [docs]
  );

  return (
    <details className="research-archive">
      <summary className="research-archive__summary">
        {t("library.researchArchive", { count: docs.length })}
      </summary>
      <p className="research-archive__hint body-sm">{t("library.researchArchiveHint")}</p>
      <ul className="research-archive__list">
        {sorted.map((d) => {
          const open = openedAgentId === d.agentId;
          const ok = d.status === "ok";
          const excerpt = researchExcerpt(d.markdown);
          const indexLabel = String(d.agentId).padStart(2, "0");
          return (
            <li
              key={d.agentId}
              className={`research-archive__item${open ? " is-open" : ""}`}
            >
              <div
                className="research-archive__row"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => onToggle(d.agentId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(d.agentId);
                  }
                }}
              >
                <span className="research-archive__index" aria-hidden="true">
                  {indexLabel}
                </span>
                <div className="research-archive__main">
                  <div className="research-archive__title-row">
                    <span className="research-archive__title">{d.agentName}</span>
                    <span
                      className="research-archive__meta"
                      data-status={ok ? "ok" : "fail"}
                    >
                      {ok ? t("library.researchDone") : t("library.researchFailed")}
                      {" · "}
                      {t("library.researchSources", { count: d.sources.length })}
                    </span>
                  </div>
                  {excerpt ? (
                    <p className="research-archive__excerpt">{excerpt}</p>
                  ) : null}
                </div>
                <div
                  className="research-archive__actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <CopyButton small text={d.markdown} label={t("library.copyFull")} />
                </div>
              </div>
              {open ? (
                <div className="research-archive__body">
                  <div className="research-archive__markdown">
                    <ChatMarkdown text={d.markdown} />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

const QUALITY_GROUP_EXPRESSION = new Set(["dna-signature"]);
const QUALITY_GROUP_TESTS = new Set(["sanity-test", "edge-test", "voice-test"]);

type QualityGroupId = "structure" | "expression" | "tests";

function qualityGroupForItem(id: string): QualityGroupId {
  if (QUALITY_GROUP_EXPRESSION.has(id)) return "expression";
  if (QUALITY_GROUP_TESTS.has(id)) return "tests";
  return "structure";
}

const QUALITY_GROUP_ORDER: QualityGroupId[] = ["structure", "expression", "tests"];

const QUALITY_GROUP_TITLE_KEY: Record<
  QualityGroupId,
  "library.qualityGroupStructure" | "library.qualityGroupExpression" | "library.qualityGroupTests"
> = {
  structure: "library.qualityGroupStructure",
  expression: "library.qualityGroupExpression",
  tests: "library.qualityGroupTests"
};

function QualityMetricsSection({ report }: { report: QualityReport }): JSX.Element {
  const t = useT();
  const groups = useMemo(() => {
    const buckets: Record<QualityGroupId, QualityCheckItem[]> = {
      structure: [],
      expression: [],
      tests: []
    };
    for (const item of report.items) {
      buckets[qualityGroupForItem(item.id)].push(item);
    }
    return QUALITY_GROUP_ORDER.map((id) => ({
      id,
      titleKey: QUALITY_GROUP_TITLE_KEY[id],
      items: buckets[id]
    })).filter((g) => g.items.length > 0);
  }, [report.items]);

  const scorePct = Math.round(report.overallScore * 100);

  return (
    <details className="research-archive quality-metrics">
      <summary className="research-archive__summary">{t("library.debugMetrics")}</summary>
      <p className="research-archive__hint body-sm">{t("library.debugMetricsHint")}</p>

      <div className="quality-metrics__verdict">
        <span
          className="quality-metrics__verdict-label"
          data-verdict={report.verdict}
        >
          {report.verdict.toUpperCase()}
        </span>
        <span className="quality-metrics__verdict-score">
          {t("library.debugScore", { score: scorePct })}
        </span>
      </div>

      {groups.map((group) => (
        <section key={group.id} className="quality-metrics__group" aria-labelledby={`qm-${group.id}`}>
          <h4 className="quality-metrics__group-title" id={`qm-${group.id}`}>
            {t(group.titleKey)}
          </h4>
          <ul className="quality-metrics__list">
            {group.items.map((it) => (
              <li
                key={it.id}
                className="quality-metrics__item"
                data-pass={it.pass ? "true" : "false"}
              >
                <div className="quality-metrics__row">
                  <span
                    className="quality-metrics__mark"
                    data-pass={it.pass ? "true" : "false"}
                    aria-label={
                      it.pass ? t("library.qualityItemPass") : t("library.qualityItemFail")
                    }
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
        </section>
      ))}

      {report.voiceTest ? (
        <div className="quality-metrics__voice">
          <div className="quality-metrics__voice-title">
            {t("library.voiceTestSample", { score: report.voiceTest.score })}
          </div>
          <blockquote className="quality-metrics__voice-quote">
            {report.voiceTest.sample}
          </blockquote>
          {report.voiceTest.critique.trim() ? (
            <p className="quality-metrics__voice-critique">{report.voiceTest.critique}</p>
          ) : null}
        </div>
      ) : null}
    </details>
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
    <div className="library-detail" style={{ padding: "22px 4px" }}>
      <div className="empty">
        <div className="empty__title">{t("library.emptyTitle")}</div>
        <p className="empty__body">{t("library.emptyBody")}</p>
        <div className="row gap-2" style={{ marginTop: 6 }}>
          <button type="button" className="btn btn--magenta btn--sm" onClick={onNew}>
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
