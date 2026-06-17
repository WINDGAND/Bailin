import { useCallback, useEffect, useRef, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { DistillationProgress } from "../progress/DistillationProgress.js";
import { useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";

type Mode = "deep" | "quick";
type SourceType = "public-figure" | "fictional" | "original";
type Track = "utility" | "companion";
type MaterialMode = "web" | "local-first" | "local-only";

const MAX_NAME = 40;
const MAX_USER_HINT = 200;
const MAX_USER_MATERIAL = 8000;
/** 与 material-coverage-plan LOCAL_FIRST_SUGGEST_MIN_CHARS 对齐。 */
const LOCAL_FIRST_SUGGEST_MIN_CHARS = 600;
const LOCAL_ONLY_SUGGEST_MIN_CHARS = 200;
const MAX_REFERENCE_IMAGES = 4;
/** 单图大小上限（base64 字符长度，对应约 3MB 原图）。 */
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;

const SOURCE_OPTIONS: Array<{
  id: SourceType;
  labelKey: "forge.sourcePublicFigure" | "forge.sourceFictional" | "forge.sourceOriginal";
}> = [
  { id: "public-figure", labelKey: "forge.sourcePublicFigure" },
  { id: "fictional", labelKey: "forge.sourceFictional" },
  { id: "original", labelKey: "forge.sourceOriginal" }
];

const TRACK_OPTIONS: Array<{
  id: Track;
  labelKey: "library.trackUtility" | "library.trackCompanion";
}> = [
  { id: "utility", labelKey: "library.trackUtility" },
  { id: "companion", labelKey: "library.trackCompanion" }
];

interface ReferenceImage {
  id: string;
  url: string;
  source: "user-upload" | "web";
  role: "primary" | "reference";
  label: string;
}

export function CreateCharacter({ onDone }: { onDone: () => void }): JSX.Element {
  const t = useT();
  const nuwa = useNuwa();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("public-figure");
  const [track, setTrack] = useState<Track>("utility");
  const [userHint, setUserHint] = useState("");
  const [userMaterial, setUserMaterial] = useState("");
  const [materialMode, setMaterialMode] = useState<MaterialMode>("web");
  const [mode, setMode] = useState<Mode>("deep");
  const [caps, setCaps] = useState<{ webSearch: boolean; reason: string } | null>(null);
  const [vision, setVision] = useState<{ vision: boolean; reason: string } | null>(null);

  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skeletonNote, setSkeletonNote] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [c, v] = await Promise.all([
          nuwa.characters.detectCapabilities(),
          nuwa.characters.detectVisionCapability()
        ]);
        setCaps(c);
        setVision(v);
        if (!c.webSearch) {
          if (mode === "deep") setMode("quick");
        }
      } catch {
        // ignore
      }
    })();
  }, [nuwa]);

  const addReferenceImage = useCallback(
    (img: Omit<ReferenceImage, "id" | "role">) => {
      setReferenceImages((prev) => {
        if (prev.length >= MAX_REFERENCE_IMAGES) {
          showToast({
            kind: "warn",
            text: t("forge.toastMaxRefs", { max: MAX_REFERENCE_IMAGES })
          });
          return prev;
        }
        const role: ReferenceImage["role"] = prev.length === 0 ? "primary" : "reference";
        return [
          ...prev,
          { ...img, id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role }
        ];
      });
    },
    [showToast, t]
  );

  const removeReferenceImage = useCallback((id: string) => {
    setReferenceImages((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (next.length > 0 && !next.some((r) => r.role === "primary")) {
        next[0] = { ...next[0]!, role: "primary" };
      }
      return next;
    });
  }, []);

  const setPrimary = useCallback((id: string) => {
    setReferenceImages((prev) =>
      prev.map((r) => ({
        ...r,
        role: r.id === id ? "primary" : "reference"
      }))
    );
  }, []);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;
      if (!/^image\//.test(file.type)) {
        showToast({ kind: "warn", text: t("forge.toastNotImage", { name: file.name }) });
        continue;
      }
      if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
        showToast({
          kind: "warn",
          text: t("forge.toastFileTooLarge", {
            name: file.name,
            max: Math.round(MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024)
          })
        });
        continue;
      }
      const dataUri = await readAsDataUri(file);
      addReferenceImage({
        url: dataUri,
        source: "user-upload",
        label: file.name
      });
    }
  }

  function handleAddUrl(): void {
    const url = urlDraft.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      showToast({ kind: "warn", text: t("forge.toastInvalidUrl") });
      return;
    }
    addReferenceImage({ url, source: "web", label: shortLabelFromUrl(url) });
    setUrlDraft("");
  }

  const trimmedName = name.trim();
  const webSearchUnavailable = caps != null && !caps.webSearch;
  const deepDisabled = webSearchUnavailable && materialMode !== "local-only";
  const materialLen = userMaterial.trim().length;
  const showMaterialModeOptions =
    mode === "deep" && (materialLen > 0 || sourceType === "original");
  const effectiveMaterialMode: MaterialMode = showMaterialModeOptions ? materialMode : "web";
  const showLocalFirstSuggest =
    mode === "deep" && materialMode === "web" && materialLen >= LOCAL_FIRST_SUGGEST_MIN_CHARS;
  const showLocalOnlySuggest =
    mode === "deep" &&
    materialMode === "web" &&
    sourceType === "original" &&
    materialLen >= LOCAL_ONLY_SUGGEST_MIN_CHARS &&
    materialLen < LOCAL_FIRST_SUGGEST_MIN_CHARS;
  const visionUnavailable = vision != null && !vision.vision;
  const hasUploadedRefs = referenceImages.length > 0;

  async function submitQuick(): Promise<void> {
    setBusy(true);
    setWarnings([]);
    setSkeletonNote(null);
    const r = await nuwa.characters.create({
      characterName: trimmedName,
      sourceType,
      track,
      userHint: userHint.trim() || undefined,
      userMaterial: userMaterial.trim() || undefined,
      referenceImages: referenceImagesForIpc()
    });
    setBusy(false);
    if (!r.ok) {
      showToast({ kind: "error", text: r.error ?? t("forge.toastCreateFailed") });
      return;
    }
    const ws = r.warnings ?? [];
    if (r.isSkeleton) {
      setSkeletonNote(t("forge.skeletonNote"));
    }
    if (ws.length > 0) {
      setWarnings(ws);
      showToast({
        kind: "warn",
        text: t("forge.toastWarnings", { count: ws.length })
      });
      return;
    }
    showToast({ kind: "success", text: t("forge.toastSuccess") });
    onDone();
  }

  async function submitDeep(): Promise<void> {
    setBusy(true);
    const resolvedMode = effectiveMaterialMode;
    const localOnly = resolvedMode === "local-only";
    const r = await nuwa.characters.createDeep({
      characterName: trimmedName,
      sourceType,
      track,
      userHint: userHint.trim() || undefined,
      userMaterial: userMaterial.trim() || undefined,
      materialMode: resolvedMode,
      enableWebSearch: !localOnly,
      referenceImages: referenceImagesForIpc()
    });
    setBusy(false);
    if (!r.ok || !r.jobId) {
      showToast({ kind: "error", text: r.error ?? t("forge.toastDeepFailed") });
      return;
    }
    setRunningJobId(r.jobId);
  }

  function submit(): void {
    if (trimmedName.length === 0) return;
    if (mode === "deep") void submitDeep();
    else void submitQuick();
  }

  function referenceImagesForIpc(): Array<{
    url: string;
    source: "user-upload" | "web";
    role: "primary" | "reference";
    notes: string;
  }> {
    return referenceImages.map((r) => ({
      url: r.url,
      source: r.source,
      role: r.role,
      notes: r.label
    }));
  }

  if (runningJobId) {
    return (
      <DistillationProgress
        jobId={runningJobId}
        characterName={trimmedName}
        track={track}
        onComplete={() => onDone()}
        onCancel={() => {
          void nuwa.characters.cancelDistillation(runningJobId);
          setRunningJobId(null);
        }}
      />
    );
  }

  const submitLabel = busy
    ? t("forge.submitStarting")
    : mode === "deep"
      ? t("forge.submitDeep")
      : t("forge.submitQuick");

  const actionsHint =
    trimmedName.length > 0
      ? mode === "deep"
        ? t("forge.hintDeepNamed", { name: trimmedName })
        : t("forge.hintQuickNamed", { name: trimmedName })
      : mode === "deep"
        ? t("forge.hintDeepEmpty")
        : t("forge.hintQuickEmpty");

  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("forge.eyebrow")}</div>
        <div className="display display--page">{t("forge.title")}</div>
        <p className="apple-page-subtitle">{t("forge.subtitle")}</p>
      </div>

      <form
        className="forge-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* —————— 角色名（视觉主体） —————— */}
        <div className="forge-field-name">
          <div className="forge-field-name__label-row">
            <label className="bl-field-label" htmlFor="forge-name">
              {t("forge.nameLabel")}
            </label>
            <span
              className={`char-count ${name.length > MAX_NAME ? "char-count--danger" : ""}`}
            >
              {name.length} / {MAX_NAME}
            </span>
          </div>
          <input
            id="forge-name"
            className="forge-field-name__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("forge.namePlaceholder")}
            autoFocus
            maxLength={MAX_NAME + 20}
          />
          <div className="forge-field-name__hint">{t("forge.nameHint")}</div>
        </div>

        {/* —————— 来源 / 定位 chips —————— */}
        <div className="forge-meta-row">
          <div className="forge-chip-group">
            <span className="bl-field-label">{t("forge.sourceLabel")}</span>
            <div className="forge-chips" role="radiogroup" aria-label={t("forge.sourceAria")}>
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={sourceType === opt.id}
                  className={`forge-chip ${sourceType === opt.id ? "is-active" : ""}`}
                  onClick={() => setSourceType(opt.id)}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="forge-chip-group">
            <span className="bl-field-label">{t("forge.trackLabel")}</span>
            <div className="forge-chips" role="radiogroup" aria-label={t("forge.trackAria")}>
              {TRACK_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={track === opt.id}
                  className={`forge-chip ${track === opt.id ? "is-active" : ""}`}
                  onClick={() => setTrack(opt.id)}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* —————— 蒸馏模式 —————— */}
        <div className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">{t("forge.modeLabel")}</span>
          </div>
          <div className="forge-mode">
            <button
              type="button"
              disabled={deepDisabled}
              className={`forge-mode__card ${mode === "deep" ? "is-active" : ""}`}
              onClick={() => !deepDisabled && setMode("deep")}
            >
              <div className="forge-mode__title">{t("forge.modeDeepTitle")}</div>
              <div className="forge-mode__caption">{t("forge.modeDeepCaption")}</div>
              <div className="forge-mode__hint">{t("forge.modeDeepHint")}</div>
            </button>
            <button
              type="button"
              className={`forge-mode__card ${mode === "quick" ? "is-active" : ""}`}
              onClick={() => setMode("quick")}
            >
              <div className="forge-mode__title">{t("forge.modeQuickTitle")}</div>
              <div className="forge-mode__caption">{t("forge.modeQuickCaption")}</div>
              <div className="forge-mode__hint">{t("forge.modeQuickHint")}</div>
            </button>
          </div>
          {deepDisabled ? (
            <div className="bl-status-strip is-warn">
              <div className="bl-status-strip__body">
                <div className="bl-status-strip__title">{t("forge.deepDisabledTitle")}</div>
                <div className="bl-status-strip__detail">
                  {t("forge.deepDisabledBodyBefore")}
                  <a
                    href="#"
                    style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                    onClick={(e) => {
                      e.preventDefault();
                      nuwa.pet.openSettings();
                    }}
                  >
                    {t("nav.key")}
                  </a>
                  {t("forge.deepDisabledBodyAfter")}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* —————— 参考图 —————— */}
        <fieldset
          className="forge-section"
          style={{ border: "none", margin: 0, padding: 0 }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleFiles(e.dataTransfer?.files ?? null);
          }}
        >
          <div className="forge-section__head">
            <span className="bl-field-label">{t("forge.referenceLabel")}</span>
            <span className="forge-section__lede">{t("forge.referenceLede")}</span>
          </div>
          <div className="apple-dropzone">
            <div style={{ marginBottom: 10 }}>
              <div className="apple-dropzone__title">{t("forge.dropzoneTitle")}</div>
              <div className="apple-dropzone__hint">
                {t("forge.dropzoneHint", { max: MAX_REFERENCE_IMAGES })}
              </div>
            </div>
            <div className="forge-ref-controls">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={referenceImages.length >= MAX_REFERENCE_IMAGES}
            >
              {t("forge.chooseFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <input
              className="input"
              placeholder={t("forge.urlPlaceholder")}
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleAddUrl}
              disabled={
                urlDraft.trim().length === 0 ||
                referenceImages.length >= MAX_REFERENCE_IMAGES
              }
            >
              {t("forge.addUrl")}
            </button>
            </div>
          </div>
          {referenceImages.length > 0 ? (
            <div className="forge-ref-thumbs">
              {referenceImages.map((img) => (
                <ReferenceThumb
                  key={img.id}
                  img={img}
                  onRemove={() => removeReferenceImage(img.id)}
                  onSetPrimary={() => setPrimary(img.id)}
                />
              ))}
            </div>
          ) : null}
          {visionUnavailable && hasUploadedRefs ? (
            <div className="bl-status-strip is-warn">
              <div className="bl-status-strip__body">
                <div className="bl-status-strip__title">{t("forge.visionUnavailableTitle")}</div>
                <div className="bl-status-strip__detail">
                  {t("forge.visionUnavailableBodyBefore")}
                  <a
                    href="#"
                    style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                    onClick={(e) => {
                      e.preventDefault();
                      nuwa.pet.openSettings();
                    }}
                  >
                    {t("nav.key")}
                  </a>
                  {t("forge.visionUnavailableBodyAfter")}
                </div>
              </div>
            </div>
          ) : null}
        </fieldset>

        {/* —————— 折叠：补充素材 —————— */}
        <details className="forge-disclosure">
          <summary>{t("forge.extraMaterial")}</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CountedField
              label={t("forge.appearanceHintLabel")}
              hint={t("forge.appearanceHintHint")}
              value={userHint}
              onChange={setUserHint}
              max={MAX_USER_HINT}
              placeholder={t("forge.appearanceHintPlaceholder")}
            />
            <CountedTextarea
              label={t("forge.textMaterialLabel")}
              hint={t("forge.textMaterialHint")}
              value={userMaterial}
              onChange={setUserMaterial}
              max={MAX_USER_MATERIAL}
              placeholder={t("forge.textMaterialPlaceholder")}
            />
            {showLocalFirstSuggest ? (
              <div
                className="fade-in"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(31,58,58,0.05)",
                  border: "1px solid var(--grid-strong)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <p className="body-sm" style={{ margin: 0, color: "var(--ink-soft)", flex: "1 1 200px" }}>
                  {t("forge.materialModeSuggestLong")}
                </p>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ flexShrink: 0 }}
                  onClick={() => setMaterialMode("local-first")}
                >
                  {t("forge.materialModeSuggestAction")}
                </button>
              </div>
            ) : null}
            {showLocalOnlySuggest ? (
              <div
                className="fade-in"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(31,58,58,0.05)",
                  border: "1px solid var(--grid-strong)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <p className="body-sm" style={{ margin: 0, color: "var(--ink-soft)", flex: "1 1 200px" }}>
                  {t("forge.materialModeSuggestOriginal")}
                </p>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ flexShrink: 0 }}
                  onClick={() => setMaterialMode("local-only")}
                >
                  {t("forge.materialModeSuggestOriginalAction")}
                </button>
              </div>
            ) : null}
            {mode === "deep" && showMaterialModeOptions ? (
              <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                <legend className="eyebrow" style={{ marginBottom: 8 }}>
                  {t("forge.materialModeLabel")}
                </legend>
                {sourceType === "original" ? (
                  <p className="body-sm" style={{ margin: "0 0 8px", color: "var(--ink-soft)" }}>
                    {t("forge.materialModeOriginalHint")}
                  </p>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(
                    [
                      { id: "web" as const, labelKey: "forge.materialModeWeb", hintKey: "forge.materialModeWebHint" },
                      {
                        id: "local-first" as const,
                        labelKey: "forge.materialModeLocalFirst",
                        hintKey: "forge.materialModeLocalFirstHint"
                      },
                      {
                        id: "local-only" as const,
                        labelKey: "forge.materialModeLocalOnly",
                        hintKey: "forge.materialModeLocalOnlyHint"
                      }
                    ] as const
                  ).map((opt) => {
                    const suggestLocalOnly =
                      sourceType === "original" && opt.id === "local-only" && materialMode !== "local-only";
                    return (
                    <label
                      key={opt.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        cursor: "pointer",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border:
                          materialMode === opt.id
                            ? "1px solid var(--teal)"
                            : suggestLocalOnly
                              ? "1px dashed var(--teal)"
                              : "1px solid var(--grid-strong)",
                        background: materialMode === opt.id ? "rgba(31,58,58,0.04)" : "transparent"
                      }}
                    >
                      <input
                        type="radio"
                        name="materialMode"
                        checked={materialMode === opt.id}
                        onChange={() => setMaterialMode(opt.id)}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        <span className="body-sm" style={{ fontWeight: 600 }}>
                          {t(opt.labelKey)}
                        </span>
                        <span className="body-sm" style={{ display: "block", color: "var(--ink-soft)", marginTop: 2 }}>
                          {t(opt.hintKey)}
                        </span>
                      </span>
                    </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
          </div>
        </details>

        {/* —————— 失败回退提示 / 警告 —————— */}
        {skeletonNote ? (
          <div
            className="fade-in"
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(178, 24, 88, 0.06)",
              border: "1px solid var(--magenta-soft)"
            }}
          >
            <strong style={{ color: "var(--magenta)", fontFamily: "var(--font-display)" }}>
              {t("forge.skeletonTitle")}
            </strong>
            <p className="body-sm" style={{ margin: "4px 0 0", color: "var(--ink-soft)" }}>
              {skeletonNote}
            </p>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <details
            open
            className="fade-in"
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(31,58,58,0.04)",
              border: "1px solid var(--grid-strong)"
            }}
          >
            <summary className="eyebrow" style={{ cursor: "pointer" }}>
              {t("forge.warningsSummary", { count: warnings.length })}
            </summary>
            <ul className="body-sm" style={{ margin: "8px 0 0 16px", padding: 0 }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <code style={{ fontFamily: "var(--font-mono)" }}>{w}</code>
                </li>
              ))}
            </ul>
            <div className="row row--end gap-2" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onDone()}
              >
                {t("forge.goToLibrary")}
              </button>
            </div>
          </details>
        ) : null}

        {/* —————— 行动栏 —————— */}
        <div className="forge-actions">
          <p className="forge-actions__hint">{actionsHint}</p>
          <button
            type="submit"
            className="btn btn--magenta"
            disabled={busy || trimmedName.length === 0 || (mode === "deep" && deepDisabled)}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function CountedField({
  label,
  hint,
  value,
  onChange,
  max,
  placeholder
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
}) {
  const overflow = value.length > max;
  const warn = !overflow && value.length > max * 0.9;
  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 4 }}>
        <label className="eyebrow">{label}</label>
        <span
          className={`char-count ${warn ? "char-count--warn" : ""} ${
            overflow ? "char-count--danger" : ""
          }`}
        >
          {value.length} / {max}
        </span>
      </div>
      <input
        className={`input ${overflow ? "input--invalid" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={max + 80}
      />
      {hint ? (
        <p className="body-sm" style={{ margin: "4px 0 0" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ReferenceThumb({
  img,
  onRemove,
  onSetPrimary
}: {
  img: ReferenceImage;
  onRemove: () => void;
  onSetPrimary: () => void;
}) {
  const t = useT();
  const isPrimary = img.role === "primary";
  return (
    <div
      style={{
        position: "relative",
        width: 84,
        height: 84,
        borderRadius: 8,
        overflow: "hidden",
        border: `1.5px solid ${isPrimary ? "var(--magenta)" : "var(--grid-strong)"}`,
        background: "var(--paper)"
      }}
      title={img.label}
    >
      <img
        src={img.url}
        alt={img.label}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block"
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "2px 4px",
          background: "rgba(23, 38, 38, 0.65)",
          color: "var(--paper)",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          gap: 4
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isPrimary ? t("forge.refPrimary") : img.source === "user-upload" ? t("forge.refLocal") : "URL"}
        </span>
        {!isPrimary ? (
          <button
            type="button"
            onClick={onSetPrimary}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              padding: 0,
              cursor: "pointer",
              fontSize: 10
            }}
            title={t("forge.refSetPrimary")}
          >
            ★
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            padding: 0,
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1
          }}
          title={t("forge.refRemove")}
        >
          ×
        </button>
      </div>
    </div>
  );
}

async function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function shortLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
    return last.slice(0, 32);
  } catch {
    return url.slice(0, 32);
  }
}

function CountedTextarea({
  label,
  hint,
  value,
  onChange,
  max,
  placeholder
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
}) {
  const overflow = value.length > max;
  const warn = !overflow && value.length > max * 0.9;
  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 4 }}>
        <label className="eyebrow">{label}</label>
        <span
          className={`char-count ${warn ? "char-count--warn" : ""} ${
            overflow ? "char-count--danger" : ""
          }`}
        >
          {value.length} / {max}
        </span>
      </div>
      <textarea
        className={`textarea ${overflow ? "textarea--invalid" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={max + 200}
      />
      {hint ? (
        <p className="body-sm" style={{ margin: "4px 0 0" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
