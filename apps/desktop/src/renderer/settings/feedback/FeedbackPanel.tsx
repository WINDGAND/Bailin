import { useCallback, useEffect, useRef, useState } from "react";
import { useDirtyTracker } from "../app/dirty-context.js";
import { useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";
import { useBailin } from "../../shared/use-bailin.js";

const BODY_MIN = 8;
const BODY_MAX = 4000;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

interface LocalFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  previewUrl: string;
}

function normalizeMime(type: string): string | null {
  if (type === "image/jpg") return "image/jpeg";
  if (ALLOWED.has(type)) return type;
  return null;
}

export function FeedbackPanel(): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<LocalFile[]>([]);
  const [version, setVersion] = useState("");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [attachError, setAttachError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void bailin.app.getVersion().then(setVersion);
  }, [bailin]);

  filesRef.current = files;
  useEffect(() => {
    return () => {
      for (const file of filesRef.current) URL.revokeObjectURL(file.previewUrl);
    };
  }, []);

  const dirty = !sent && (body.trim().length > 0 || files.length > 0 || contact.trim().length > 0);
  useDirtyTracker(dirty);

  const trimmed = body.trim();
  const bodyError =
    trimmed.length === 0
      ? ""
      : trimmed.length < BODY_MIN
        ? t("userFeedback.bodyTooShort")
        : trimmed.length > BODY_MAX
          ? t("userFeedback.bodyTooLong")
          : "";
  const canSubmit = !submitting && trimmed.length >= BODY_MIN && trimmed.length <= BODY_MAX;

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (incoming.length === 0) return;
      setAttachError("");
      const next: LocalFile[] = [];
      let currentCount = files.length;
      for (const file of incoming) {
        if (currentCount + next.length >= MAX_FILES) {
          setAttachError(t("userFeedback.attachTooMany"));
          break;
        }
        const mime = normalizeMime(file.type);
        if (!mime) {
          setAttachError(t("userFeedback.attachBadType"));
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          setAttachError(t("userFeedback.attachTooBig"));
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        next.push({
          name: file.name || "paste.png",
          mime,
          bytes,
          previewUrl: URL.createObjectURL(file)
        });
      }
      if (next.length > 0) setFiles((prev) => [...prev, ...next]);
    },
    [files.length, t]
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setAttachError("");
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = e.clipboardData?.files;
      if (!pasted || pasted.length === 0) return;
      const images = Array.from(pasted).filter((f) => normalizeMime(f.type));
      if (images.length === 0) return;
      e.preventDefault();
      void addFiles(images);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  function resetForm(): void {
    for (const file of files) URL.revokeObjectURL(file.previewUrl);
    setBody("");
    setContact("");
    setFiles([]);
    setAttachError("");
    setFormError("");
    setSent(false);
  }

  async function onSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError("");
    try {
      const result = await bailin.feedback.submit({
        body: trimmed,
        contact: contact.trim() || undefined,
        files: files.map(({ name, mime, bytes }) => ({ name, mime, bytes }))
      });
      if (result.ok) {
        setSent(true);
        return;
      }
      if (result.code === "offline") {
        showToast({ kind: "error", text: t("userFeedback.toastOffline") });
        return;
      }
      if (result.code === "rate_limited") {
        showToast({ kind: "warn", text: t("userFeedback.toastRateLimited") });
        return;
      }
      if (result.code === "invalid" || result.code === "too_large") {
        setFormError(result.error);
        return;
      }
      showToast({ kind: "error", text: t("userFeedback.toastFailed") });
    } catch {
      showToast({ kind: "error", text: t("userFeedback.toastFailed") });
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="feedback-page fade-in-up">
        <div className="eyebrow">{t("userFeedback.eyebrow")}</div>
        <div className="display display--page">{t("userFeedback.title")}</div>
        <div className="feedback-thanks">
          <p className="display display--section" style={{ margin: "18px 0 8px" }}>
            {t("userFeedback.thanksTitle")}
          </p>
          <p className="apple-page-subtitle">{t("userFeedback.thanksBody")}</p>
          <button type="button" className="btn btn--ghost" onClick={resetForm}>
            {t("userFeedback.writeAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-page">
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("userFeedback.eyebrow")}</div>
        <div className="display display--page">{t("userFeedback.title")}</div>
        <p className="apple-page-subtitle">{t("userFeedback.subtitle")}</p>
        <p className="body-sm feedback-privacy" style={{ color: "var(--ink-soft)" }}>
          {t("userFeedback.privacy")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <section className="forge-section">
          <div className="forge-section__head">
            <label className="bl-field-label" htmlFor="feedback-body">
              {t("userFeedback.bodyLabel")}
            </label>
          </div>
          <textarea
            id="feedback-body"
            className={bodyError ? "textarea textarea--invalid" : "textarea"}
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("userFeedback.bodyPlaceholder")}
            disabled={submitting}
          />
          {bodyError ? (
            <p className="bl-field-hint bl-field-hint--error" role="alert">
              {bodyError}
            </p>
          ) : null}
        </section>

        <section
          className="forge-section"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void addFiles(e.dataTransfer?.files ?? []);
          }}
        >
          <div className="forge-section__head">
            <span className="bl-field-label">{t("userFeedback.attachLabel")}</span>
          </div>
          <div className="apple-dropzone">
            <div style={{ marginBottom: 10 }}>
              <div className="apple-dropzone__title">{t("userFeedback.attachTitle")}</div>
              <div className="apple-dropzone__hint">{t("userFeedback.attachHint")}</div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || files.length >= MAX_FILES}
            >
              {t("userFeedback.chooseFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(e.target.files ?? []);
                e.target.value = "";
              }}
            />
            {files.length > 0 ? (
              <ul className="feedback-thumbs">
                {files.map((file, i) => (
                  <li key={file.previewUrl} className="feedback-thumb">
                    <img src={file.previewUrl} alt={file.name} />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--icon feedback-thumb__remove"
                      aria-label={t("userFeedback.removeFile")}
                      onClick={() => removeFile(i)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {attachError ? (
            <p className="bl-field-hint bl-field-hint--error" role="alert">
              {attachError}
            </p>
          ) : null}
        </section>

        <section className="forge-section">
          <div className="forge-section__head">
            <label className="bl-field-label" htmlFor="feedback-contact">
              {t("userFeedback.contactLabel")}
            </label>
          </div>
          <input
            id="feedback-contact"
            className="input"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t("userFeedback.contactPlaceholder")}
            autoComplete="off"
            disabled={submitting}
          />
        </section>

        {formError ? (
          <p className="bl-field-hint bl-field-hint--error feedback-form-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="feedback-submit-row">
          <button
            type="button"
            className="btn btn--magenta"
            disabled={!canSubmit}
            onClick={() => void onSubmit()}
          >
            {submitting ? t("userFeedback.submitting") : t("userFeedback.submit")}
          </button>
          {version ? (
            <p className="body-sm feedback-version" style={{ color: "var(--ink-faint)" }}>
              {t("userFeedback.versionHint", { version })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
