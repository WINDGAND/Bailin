import { useCallback, useEffect, useRef, useState } from "react";
import { useBailin } from "../../shared/use-bailin.js";
import { DistillationProgress } from "../progress/DistillationProgress.js";
import { useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";
import { OptionGroup } from "../../shared/option-group.js";
import { useDistillationJobs } from "../app/distillation-job-context.js";

type SourceType = "public-figure" | "fictional" | "original";
type Track = "utility" | "companion";
type MaterialMode = "web" | "local-first" | "local-only";

const MAX_NAME = 40;
const MAX_SOURCE_CONTEXT = 40;
const MAX_USER_HINT = 200;
const MAX_USER_MATERIAL = 8000;
/** 与 material-coverage-plan LOCAL_FIRST_SUGGEST_MIN_CHARS 对齐。 */
const LOCAL_FIRST_SUGGEST_MIN_CHARS = 600;
const LOCAL_ONLY_SUGGEST_MIN_CHARS = 200;
const MAX_REFERENCE_IMAGES = 4;
/** 单图大小上限（base64 字符长度，对应约 3MB 原图）。 */
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;

interface ReferenceImage {
  id: string;
  url: string;
  source: "user-upload" | "web";
  role: "primary" | "reference";
  label: string;
}

export function CreateCharacter({ onDone }: { onDone: () => void }): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const { showToast } = useToast();
  const { activeJob, startJob, clearJob, cancelJob } = useDistillationJobs();

  const [name, setName] = useState("");
  const [sourceContext, setSourceContext] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("public-figure");
  const [track, setTrack] = useState<Track>("utility");
  const [userHint, setUserHint] = useState("");
  const [userMaterial, setUserMaterial] = useState("");
  const [materialMode, setMaterialMode] = useState<MaterialMode>("web");
  const [caps, setCaps] = useState<{ webSearch: boolean; reason: string } | null>(null);
  const [vision, setVision] = useState<{ vision: boolean; reason: string } | null>(null);

  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [c, v] = await Promise.all([
          bailin.characters.detectCapabilities(),
          bailin.characters.detectVisionCapability()
        ]);
        setCaps(c);
        setVision(v);
      } catch {
        // ignore
      }
    })();
  }, [bailin]);

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
  const showMaterialModeOptions = materialLen > 0 || sourceType === "original";
  const effectiveMaterialMode: MaterialMode = showMaterialModeOptions ? materialMode : "web";
  const showLocalFirstSuggest =
    materialMode === "web" && materialLen >= LOCAL_FIRST_SUGGEST_MIN_CHARS;
  const showLocalOnlySuggest =
    materialMode === "web" &&
    sourceType === "original" &&
    materialLen >= LOCAL_ONLY_SUGGEST_MIN_CHARS &&
    materialLen < LOCAL_FIRST_SUGGEST_MIN_CHARS;
  const visionUnavailable = vision != null && !vision.vision;
  const hasUploadedRefs = referenceImages.length > 0;
  const extrasFilledCount =
    (referenceImages.length > 0 ? 1 : 0) +
    (userHint.trim().length > 0 ? 1 : 0) +
    (userMaterial.trim().length > 0 ? 1 : 0);

  async function submitDeep(): Promise<void> {
    setBusy(true);
    const resolvedMode = effectiveMaterialMode;
    const localOnly = resolvedMode === "local-only";
    const r = await bailin.characters.createDeep({
      characterName: trimmedName,
      sourceType,
      track,
      concurrency: 6,
      userHint: userHint.trim() || undefined,
      userMaterial: userMaterial.trim() || undefined,
      sourceContext: sourceContext.trim() || undefined,
      materialMode: resolvedMode,
      enableWebSearch: !localOnly,
      referenceImages: referenceImagesForIpc()
    });
    setBusy(false);
    if (!r.ok || !r.jobId) {
      showToast({ kind: "error", text: r.error ?? t("forge.toastDeepFailed") });
      return;
    }
    startJob({ jobId: r.jobId, characterName: trimmedName, track });
  }

  function submit(): void {
    if (trimmedName.length === 0 || deepDisabled) return;
    void submitDeep();
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

  if (activeJob) {
    return (
      <DistillationProgress
        jobId={activeJob.jobId}
        characterName={activeJob.characterName}
        track={activeJob.track}
        onComplete={() => {
          clearJob();
          onDone();
        }}
        onCancel={() => void cancelJob()}
      />
    );
  }

  const submitLabel = busy ? t("forge.submitStarting") : t("forge.submitDeep");

  const actionsHint =
    trimmedName.length > 0
      ? t("forge.hintDeepNamed", { name: trimmedName })
      : t("forge.hintDeepEmpty");

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
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
              {name.length}&nbsp;/&nbsp;{MAX_NAME}
            </span>
          </div>
          <input
            id="forge-name"
            name="character-name"
            className="forge-field-name__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("forge.namePlaceholder")}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_NAME + 20}
          />
          <div className="forge-field-name__hint">{t("forge.nameHint")}</div>
        </div>

        <CountedField
          label={t("forge.sourceContextLabel")}
          hint={t("forge.sourceContextHint")}
          value={sourceContext}
          onChange={setSourceContext}
          max={MAX_SOURCE_CONTEXT}
          placeholder={t("forge.sourceContextPlaceholder")}
        />

        {/* —————— 来源 / 定位（大卡片，对齐主题选择） —————— */}
        <div className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">{t("forge.sourceLabel")}</span>
          </div>
          <OptionGroup<SourceType>
            value={sourceType}
            onChange={setSourceType}
            ariaLabel={t("forge.sourceAria")}
            className="forge-mode forge-mode--triple"
            itemClassName="forge-mode__card"
            options={[
              {
                value: "public-figure",
                label: t("forge.sourcePublicFigure"),
                caption: t("forge.sourcePublicFigureCaption")
              },
              {
                value: "fictional",
                label: t("forge.sourceFictional"),
                caption: t("forge.sourceFictionalCaption")
              },
              {
                value: "original",
                label: t("forge.sourceOriginal"),
                caption: t("forge.sourceOriginalCaption")
              }
            ]}
          />
        </div>

        <div className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">{t("forge.trackLabel")}</span>
          </div>
          <OptionGroup<Track>
            value={track}
            onChange={setTrack}
            ariaLabel={t("forge.trackAria")}
            className="forge-mode"
            itemClassName="forge-mode__card"
            options={[
              {
                value: "utility",
                label: t("library.trackUtility"),
                caption: t("forge.trackUtilityCaption")
              },
              {
                value: "companion",
                label: t("library.trackCompanion"),
                caption: t("forge.trackCompanionCaption")
              }
            ]}
          />
        </div>

        {/* —————— 无联网时禁用提示 —————— */}
        {deepDisabled ? (
          <div className="bl-status-strip is-warn">
            <div className="bl-status-strip__body">
              <div className="bl-status-strip__title">{t("forge.deepDisabledTitle")}</div>
              <div className="bl-status-strip__detail">
                {t("forge.deepDisabledBodyBefore")}
                <button
                  type="button"
                  style={{
                    color: "inherit",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    cursor: "pointer"
                  }}
                  onClick={() => bailin.pet.openSettings()}
                >
                  {t("nav.key")}
                </button>
                {t("forge.deepDisabledBodyAfter")}
              </div>
            </div>
          </div>
        ) : null}

        {/* —————— 折叠：参考图 + 补充素材等进阶项 —————— */}
        <details className="forge-disclosure">
          <summary>
            {t("forge.extraMaterial")}
            {extrasFilledCount > 0
              ? ` · ${t("forge.extraMaterialFilled", { count: extrasFilledCount })}`
              : ""}
          </summary>
          <div className="forge-disclosure__body">
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
                    name="reference-image-url"
                    aria-label={t("forge.urlPlaceholder")}
                    placeholder={t("forge.urlPlaceholder")}
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
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
                        style={{
                          color: "inherit",
                          textDecoration: "underline",
                          textUnderlineOffset: 2
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          bailin.pet.openSettings();
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
            {showMaterialModeOptions ? (
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
                          <span
                            className="body-sm"
                            style={{ display: "block", color: "var(--ink-soft)", marginTop: 2 }}
                          >
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

        {/* —————— 行动栏 —————— */}
        <div className="forge-actions">
          <p className="forge-actions__hint">{actionsHint}</p>
          <button
            type="submit"
            className="btn btn--magenta"
            disabled={busy || trimmedName.length === 0 || deepDisabled}
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
          {value.length}&nbsp;/&nbsp;{max}
        </span>
      </div>
      <input
        className={`input ${overflow ? "input--invalid" : ""}`}
        name="forge-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
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
          {value.length}&nbsp;/&nbsp;{max}
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
