import { useCallback, useEffect, useRef, useState } from "react";
import { useDirtyTracker } from "../app/dirty-context.js";
import { useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";
import { useBailin } from "../../shared/use-bailin.js";
import { isFeedbackEmail } from "../../../shared/feedback-email.js";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FeedbackPanel(): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<LocalFile[]>([]);
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [attachError, setAttachError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [shakeBody, setShakeBody] = useState(false);

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
        ? t("userFeedback.bodyTooShort", { count: BODY_MIN - trimmed.length })
        : trimmed.length > BODY_MAX
          ? t("userFeedback.bodyTooLong")
          : "";
  const contactTrimmed = contact.trim();
  const contactError =
    contactTrimmed.length === 0
      ? ""
      : isFeedbackEmail(contactTrimmed)
        ? ""
        : t("userFeedback.contactInvalid");
  const canSubmit =
    !submitting &&
    trimmed.length >= BODY_MIN &&
    trimmed.length <= BODY_MAX &&
    !contactError;
  const charCount = trimmed.length;
  const charCountTone =
    charCount > BODY_MAX ? "danger" : charCount > BODY_MAX * 0.9 ? "warn" : "";

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
    if (!canSubmit) {
      setShakeBody(true);
      window.setTimeout(() => setShakeBody(false), 500);
      return;
    }
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
      <div className="feedback-page feedback-page--sent fade-in-up">
        <div className="eyebrow">{t("userFeedback.eyebrow")}</div>
        <div className="display display--page">{t("userFeedback.title")}</div>
        <div className="feedback-thanks">
          <div className="feedback-thanks__icon" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p className="display display--section feedback-thanks__title">
            {t("userFeedback.thanksTitle")}
          </p>
          <p className="apple-page-subtitle feedback-thanks__body">
            {t("userFeedback.thanksBody")}
          </p>
          <button type="button" className="btn btn--ghost" onClick={resetForm}>
            {t("userFeedback.writeAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-page">
      <header className="feedback-header">
        <div className="eyebrow">{t("userFeedback.eyebrow")}</div>
        <h1 className="display display--page feedback-header__title">
          {t("userFeedback.title")}
        </h1>
      </header>

      <div className="feedback-form">
        <section className="forge-section feedback-field">
          <div className="forge-section__head feedback-field__head">
            <label className="bl-field-label" htmlFor="feedback-body">
              {t("userFeedback.bodyLabel")}
            </label>
            <span
              className={`char-count${charCountTone ? ` char-count--${charCountTone}` : ""}`}
              aria-live="polite"
            >
              {t("userFeedback.bodyCount", { count: charCount })}
            </span>
          </div>
          <textarea
            id="feedback-body"
            className={`textarea feedback-textarea${bodyError ? " textarea--invalid" : ""}${shakeBody ? " shake-once" : ""}`}
            rows={7}
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
          className={`forge-section feedback-field feedback-dropzone-section${dragOver ? " is-dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            void addFiles(e.dataTransfer?.files ?? []);
          }}
        >
          <div className="forge-section__head feedback-field__head">
            <span className="bl-field-label">{t("userFeedback.attachLabel")}</span>
            <span className="bl-field-hint">{t("userFeedback.attachHint")}</span>
          </div>
          <div className="apple-dropzone feedback-dropzone">
            <div className="feedback-dropzone__copy">
              <div className="apple-dropzone__title">{t("userFeedback.attachTitle")}</div>
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
                    <span className="feedback-thumb__size">{formatBytes(file.bytes.length)}</span>
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

        <section className="forge-section feedback-field">
          <div className="forge-section__head feedback-field__head">
            <label className="bl-field-label" htmlFor="feedback-contact">
              {t("userFeedback.contactLabel")}
            </label>
          </div>
          <input
            id="feedback-contact"
            className={contactError ? "input input--invalid" : "input"}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t("userFeedback.contactPlaceholder")}
            disabled={submitting}
            aria-invalid={contactError ? true : undefined}
            aria-describedby={contactError ? "feedback-contact-error" : undefined}
          />
          {contactError ? (
            <p id="feedback-contact-error" className="bl-field-hint bl-field-hint--error" role="alert">
              {contactError}
            </p>
          ) : null}
        </section>

        {formError ? (
          <p className="bl-field-hint bl-field-hint--error feedback-form-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="feedback-submit-row">
          <button
            type="button"
            className={`btn btn--magenta feedback-submit${submitting ? " is-submitting" : ""}`}
            disabled={!canSubmit}
            onClick={() => void onSubmit()}
          >
            {submitting ? (
              <>
                <span className="spinner spinner--magenta" aria-hidden="true" />
                {t("userFeedback.submitting")}
              </>
            ) : (
              t("userFeedback.submit")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
