import { useCallback, useEffect, useRef, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { DistillationProgress } from "../progress/DistillationProgress.js";
import { useToast } from "../../shared/feedback.js";

type Mode = "deep" | "quick";
type SourceType = "public-figure" | "fictional" | "original";
type Track = "utility" | "companion";

const MAX_NAME = 40;
const MAX_USER_HINT = 200;
const MAX_USER_MATERIAL = 2000;
const MAX_REFERENCE_IMAGES = 4;
/** 单图大小上限（base64 字符长度，对应约 3MB 原图）。 */
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;

const SOURCE_OPTIONS: Array<{ id: SourceType; label: string }> = [
  { id: "public-figure", label: "公众人物" },
  { id: "fictional", label: "虚构角色" },
  { id: "original", label: "原创角色" }
];

const TRACK_OPTIONS: Array<{ id: Track; label: string }> = [
  { id: "utility", label: "思维顾问" },
  { id: "companion", label: "情感陪伴" }
];

interface ReferenceImage {
  id: string;
  url: string;
  source: "user-upload" | "web";
  role: "primary" | "reference";
  label: string;
}

export function CreateCharacter({ onDone }: { onDone: () => void }): JSX.Element {
  const nuwa = useNuwa();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("public-figure");
  const [track, setTrack] = useState<Track>("utility");
  const [userHint, setUserHint] = useState("");
  const [userMaterial, setUserMaterial] = useState("");
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
            text: `最多上传 ${MAX_REFERENCE_IMAGES} 张参考图`
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
    [showToast]
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
        showToast({ kind: "warn", text: `${file.name} 不是图片，已跳过` });
        continue;
      }
      if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
        showToast({
          kind: "warn",
          text: `${file.name} 超过 ${Math.round(MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024)}MB，已跳过`
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
      showToast({ kind: "warn", text: "请填入 http(s):// 开头的图片 URL" });
      return;
    }
    addReferenceImage({ url, source: "web", label: shortLabelFromUrl(url) });
    setUrlDraft("");
  }

  const trimmedName = name.trim();
  const deepDisabled = caps != null && !caps.webSearch;
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
      showToast({ kind: "error", text: r.error ?? "创建失败" });
      return;
    }
    const ws = r.warnings ?? [];
    if (r.isSkeleton) {
      setSkeletonNote(
        "3 步全部失败，已落地为骨架角色。请检查模型 / 网络后在角色仓库中点「重新生成形象」。"
      );
    }
    if (ws.length > 0) {
      setWarnings(ws);
      showToast({
        kind: "warn",
        text: `创建完成，但有 ${ws.length} 条警告`
      });
      return;
    }
    showToast({ kind: "success", text: "角色已上桌" });
    onDone();
  }

  async function submitDeep(): Promise<void> {
    setBusy(true);
    const r = await nuwa.characters.createDeep({
      characterName: trimmedName,
      sourceType,
      track,
      userHint: userHint.trim() || undefined,
      userMaterial: userMaterial.trim() || undefined,
      referenceImages: referenceImagesForIpc()
    });
    setBusy(false);
    if (!r.ok || !r.jobId) {
      showToast({ kind: "error", text: r.error ?? "深度蒸馏启动失败" });
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
        onComplete={() => onDone()}
        onCancel={() => {
          void nuwa.characters.cancelDistillation(runningJobId);
          setRunningJobId(null);
        }}
      />
    );
  }

  const submitLabel = busy
    ? "启动中…"
    : mode === "deep"
      ? "开始造人"
      : "试做一只";

  const actionsHint =
    trimmedName.length > 0
      ? mode === "deep"
        ? `准备为「${trimmedName}」造一只完整桌宠。大约 5-15 分钟，期间你会确认两次。`
        : `先为「${trimmedName}」试做一只，约 1 分钟。喜欢的话之后再升级完整版。`
      : mode === "deep"
        ? "大约 5-15 分钟。期间你会确认两次：调研后、提炼后。"
        : "约 1 分钟。先上桌看看，回到角色仓库随时可以重生。";

  return (
    <div>
      <div className="apple-page-header">
        <div className="eyebrow">Forge</div>
        <div className="display display--page">造一个角色</div>
        <p className="apple-page-subtitle">
          填一个名字，选择它的来源和用途。其余细节可以之后慢慢补。
        </p>
      </div>

      <form
        className="forge-form apple-single-column"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* —————— 角色名（视觉主体） —————— */}
        <div className="forge-field-name">
          <div className="forge-field-name__label-row">
            <label className="bl-field-label" htmlFor="forge-name">
              角色名
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
            placeholder="芒格 / 张小龙 / 绫波丽"
            autoFocus
            maxLength={MAX_NAME + 20}
          />
          <div className="forge-field-name__hint">建议中文 2-6 字 / 英文 ≤ 30 字</div>
        </div>

        {/* —————— 来源 / 定位 chips —————— */}
        <div className="forge-meta-row">
          <div className="forge-chip-group">
            <span className="bl-field-label">来源</span>
            <div className="forge-chips" role="radiogroup" aria-label="角色来源类型">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={sourceType === opt.id}
                  className={`forge-chip ${sourceType === opt.id ? "is-active" : ""}`}
                  onClick={() => setSourceType(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="forge-chip-group">
            <span className="bl-field-label">定位</span>
            <div className="forge-chips" role="radiogroup" aria-label="角色定位">
              {TRACK_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={track === opt.id}
                  className={`forge-chip ${track === opt.id ? "is-active" : ""}`}
                  onClick={() => setTrack(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* —————— 蒸馏模式 —————— */}
        <div className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">造人方式</span>
          </div>
          <div className="forge-mode">
            <button
              type="button"
              disabled={deepDisabled}
              className={`forge-mode__card ${mode === "deep" ? "is-active" : ""}`}
              onClick={() => !deepDisabled && setMode("deep")}
            >
              <div className="forge-mode__title">完整版</div>
              <div className="forge-mode__caption">
                联网调研 + 框架提炼 + 你来确认两次
              </div>
              <div className="forge-mode__hint">5–15 min · 推荐</div>
            </button>
            <button
              type="button"
              className={`forge-mode__card ${mode === "quick" ? "is-active" : ""}`}
              onClick={() => setMode("quick")}
            >
              <div className="forge-mode__title">试做版</div>
              <div className="forge-mode__caption">
                凭模型训练知识快速出一只，先上桌看看
              </div>
              <div className="forge-mode__hint">~1 min</div>
            </button>
          </div>
          {deepDisabled ? (
            <div className="bl-status-strip is-warn">
              <div className="bl-status-strip__body">
                <div className="bl-status-strip__title">完整版需要联网调研</div>
                <div className="bl-status-strip__detail">
                  当前模型不支持联网。可以先用试做版上桌，或在
                  <a
                    href="#"
                    style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                    onClick={(e) => {
                      e.preventDefault();
                      nuwa.pet.openSettings();
                    }}
                  >
                    模型与 API Key
                  </a>
                  切到 OpenAI / Anthropic 直连。
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
            <span className="bl-field-label">参考图 · 可选</span>
            <span className="forge-section__lede">
              一张图比文字描述准 10 倍
            </span>
          </div>
          <div className="apple-dropzone">
            <div style={{ marginBottom: 10 }}>
              <div className="apple-dropzone__title">拖拽图片到这里</div>
              <div className="apple-dropzone__hint">
                或选择文件 / 粘贴图片 URL。最多 {MAX_REFERENCE_IMAGES} 张。
              </div>
            </div>
            <div className="forge-ref-controls">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={referenceImages.length >= MAX_REFERENCE_IMAGES}
            >
              选择文件
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
              placeholder="或粘贴图片 URL"
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
              添加
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
                <div className="bl-status-strip__title">视觉读图模型不可用</div>
                <div className="bl-status-strip__detail">
                  上传的图会被忽略。可在
                  <a
                    href="#"
                    style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                    onClick={(e) => {
                      e.preventDefault();
                      nuwa.pet.openSettings();
                    }}
                  >
                    模型与 API Key
                  </a>
                  配置支持读图的模型。
                </div>
              </div>
            </div>
          ) : null}
        </fieldset>

        {/* —————— 折叠：补充素材 —————— */}
        <details className="forge-disclosure">
          <summary>补充素材（可选）</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CountedField
              label="一句话外貌"
              hint="比模型猜的更准，例如：短发 / 黑色高领 / 红领带"
              value={userHint}
              onChange={setUserHint}
              max={MAX_USER_HINT}
              placeholder="一句话即可"
            />
            <CountedTextarea
              label="文本素材"
              hint="一段访谈、博客、设定集摘录都行。仅用于这次造人，不上传。"
              value={userMaterial}
              onChange={setUserMaterial}
              max={MAX_USER_MATERIAL}
              placeholder="粘贴 ≤ 2000 字…"
            />
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
              骨架角色
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
              蒸馏过程的 {warnings.length} 条警告
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
                进角色仓库
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
          {isPrimary ? "主图" : img.source === "user-upload" ? "本地" : "URL"}
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
            title="设为主图"
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
          title="移除"
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
