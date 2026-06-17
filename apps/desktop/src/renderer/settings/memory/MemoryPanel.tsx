import { useEffect, useMemo, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { useDirtyTracker } from "../app/dirty-context.js";
import { useT } from "../../shared/i18n/index.js";

interface Profile {
  preferredName?: string;
  currentGoals: string[];
  ongoingConcerns: string[];
  tabooTopics: string[];
}

const EMPTY: Profile = {
  currentGoals: [],
  ongoingConcerns: [],
  tabooTopics: []
};

const MAX_NAME = 24;

function profileKey(p: Profile): string {
  return JSON.stringify({
    preferredName: p.preferredName ?? "",
    currentGoals: p.currentGoals,
    ongoingConcerns: p.ongoingConcerns,
    tabooTopics: p.tabooTopics
  });
}

export function MemoryPanel(): JSX.Element {
  const t = useT();
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [initial, setInitial] = useState<Profile>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function reload(): Promise<void> {
    try {
      const p = (await nuwa.memory.getProfile()) as Profile;
      setProfile(p);
      setInitial(p);
    } catch (e) {
      showToast({
        kind: "error",
        text: t("memory.toastLoadFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void reload();
  }, [nuwa]);

  const dirty = useMemo(
    () => loaded && profileKey(profile) !== profileKey(initial),
    [profile, initial, loaded]
  );

  useDirtyTracker(dirty);

  async function save(): Promise<void> {
    setSaving(true);
    const clean: Profile = {
      preferredName: profile.preferredName?.trim() || undefined,
      currentGoals: profile.currentGoals.map((s) => s.trim()).filter(Boolean),
      ongoingConcerns: profile.ongoingConcerns.map((s) => s.trim()).filter(Boolean),
      tabooTopics: profile.tabooTopics.map((s) => s.trim()).filter(Boolean)
    };
    try {
      await nuwa.memory.updateProfile(clean);
      setProfile(clean);
      setInitial(clean);
      showToast({ kind: "success", text: t("memory.toastSaved") });
    } catch (e) {
      showToast({
        kind: "error",
        text: t("memory.toastSaveFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    } finally {
      setSaving(false);
    }
  }

  function discard(): void {
    setProfile(initial);
  }

  async function clearProfile(): Promise<void> {
    const ok = await confirm({
      title: t("memory.clearProfileTitle"),
      body: (
        <span>
          {t("memory.clearProfileBody")}
          <p style={{ marginTop: 8, color: "var(--ink-soft)" }}>
            {t("memory.clearProfileNote")}
          </p>
        </span>
      ),
      confirmLabel: t("memory.clearProfileConfirm"),
      cancelLabel: t("common.thinkAgain"),
      danger: true
    });
    if (!ok) return;
    setClearing(true);
    try {
      await nuwa.memory.clearProfile();
      setProfile(EMPTY);
      setInitial(EMPTY);
      showToast({ kind: "info", text: t("memory.toastProfileCleared") });
    } catch (e) {
      showToast({
        kind: "error",
        text: t("memory.toastClearFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    } finally {
      setClearing(false);
    }
  }

  async function clearAll(): Promise<void> {
    const ok = await confirm({
      title: t("memory.clearAllTitle"),
      body: (
        <span>
          {t("memory.clearAllIntro")}
          <ul style={{ margin: "6px 0 0 18px", padding: 0, color: "var(--ink-soft)" }}>
            <li>{t("memory.clearAllItemCharacters")}</li>
            <li>{t("memory.clearAllItemMemory")}</li>
            <li>{t("memory.clearAllItemSettings")}</li>
          </ul>
          <p style={{ marginTop: 8 }}>{t("memory.clearAllIrreversible")}</p>
        </span>
      ),
      confirmLabel: t("memory.clearAllConfirm"),
      cancelLabel: t("common.thinkAgain"),
      danger: true,
      requireText: "DELETE"
    });
    if (!ok) return;
    setClearing(true);
    try {
      await nuwa.memory.clearAll();
      setProfile(EMPTY);
      setInitial(EMPTY);
      showToast({ kind: "info", text: t("memory.toastAllCleared") });
    } catch (e) {
      showToast({
        kind: "error",
        text: t("memory.toastClearFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("memory.eyebrow")}</div>
        <div className="display display--page">{t("memory.title")}</div>
        <p className="apple-page-subtitle">{t("memory.subtitle")}</p>
      </div>

      <div style={{ maxWidth: 760 }}>
        <div className="row row--between gap-3" style={{ alignItems: "flex-start", marginBottom: 24 }}>
          <p className="body-md" style={{ margin: 0, maxWidth: 480 }}>
            {t("memory.introHint")}
          </p>
          <div className="row gap-2 row--wrap" style={{ justifyContent: "flex-end" }}>
            <span className="bl-tag">{t("memory.tagName")}</span>
            <span className="bl-tag">{t("memory.tagGoals")}</span>
            <span className="bl-tag">{t("memory.tagTaboo")}</span>
          </div>
        </div>

        <div style={{ marginBottom: 26 }}>
          <label htmlFor="memory-name" className="bl-field-label bl-field-label--with-hint">
            {t("memory.nameLabel")}
          </label>
          <p className="bl-field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
            {t("memory.nameHint")}
          </p>
          <input
            id="memory-name"
            className="forge-field-name__input"
            value={profile.preferredName ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, preferredName: e.target.value })
            }
            placeholder={t("memory.namePlaceholder")}
            maxLength={MAX_NAME + 10}
            style={{ fontSize: "clamp(22px, 2.4vw, 28px)" }}
          />
        </div>

        <div className="apple-list-group">
          <ListField
            label={t("memory.goalsLabel")}
            hint={t("memory.goalsHint")}
            emptyHint={t("memory.goalsEmpty")}
            placeholder={t("memory.goalsPlaceholder")}
            values={profile.currentGoals}
            onChange={(v) => setProfile({ ...profile, currentGoals: v })}
          />
          <ListField
            label={t("memory.concernsLabel")}
            hint={t("memory.concernsHint")}
            emptyHint={t("memory.concernsEmpty")}
            placeholder={t("memory.concernsPlaceholder")}
            values={profile.ongoingConcerns}
            onChange={(v) => setProfile({ ...profile, ongoingConcerns: v })}
          />
          <ListField
            label={t("memory.tabooLabel")}
            hint={t("memory.tabooHint")}
            emptyHint={t("memory.tabooEmpty")}
            placeholder={t("memory.tabooPlaceholder")}
            values={profile.tabooTopics}
            onChange={(v) => setProfile({ ...profile, tabooTopics: v })}
            tone="caution"
          />
        </div>

        <div className="bl-action-bar">
          <div className="bl-action-bar__left">
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => void clearProfile()}
              disabled={clearing}
            >
              {t("memory.clearProfile")}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void clearAll()}
              disabled={clearing}
            >
              {t("memory.clearAllData")}
            </button>
          </div>
          <div className="bl-action-bar__right">
            {dirty ? <span className="bl-dirty-dot">{t("memory.unsaved")}</span> : null}
            {dirty ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={discard}
                disabled={saving}
              >
                {t("memory.discard")}
              </button>
            ) : null}
            {dirty ? (
              <button
                type="button"
                className="btn btn--magenta"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? t("memory.saving") : t("memory.save")}
              </button>
            ) : (
              <span className="body-sm" style={{ color: "var(--ink-faint)" }}>
                {t("memory.synced")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListField({
  label,
  hint,
  emptyHint,
  placeholder,
  values,
  onChange,
  tone
}: {
  label: string;
  hint?: string;
  emptyHint: string;
  placeholder?: string;
  values: string[];
  onChange(v: string[]): void;
  tone?: "default" | "caution";
}) {
  const t = useT();
  const isCaution = tone === "caution";
  return (
    <div className="apple-list-row">
      <label className="bl-field-label bl-field-label--with-hint">
        {label}
        {isCaution ? (
          <span
            className="bl-tag"
            style={{ marginLeft: 8, fontSize: 10.5, padding: "2px 7px" }}
          >
            {t("memory.softConstraint")}
          </span>
        ) : null}
      </label>
      {hint ? <p className="bl-field-hint">{hint}</p> : null}
      <div className="stack" style={{ marginTop: 8, gap: 6 }}>
        {values.length === 0 ? (
          <p
            className="body-sm"
            style={{ margin: 0, color: "var(--ink-faint)" }}
          >
            {emptyHint}
          </p>
        ) : (
          values.map((v, i) => (
            <ListRow
              key={i}
              value={v}
              placeholder={placeholder}
              onChange={(text) => {
                const next = [...values];
                next[i] = text;
                onChange(next);
              }}
              onRemove={() => {
                const next = values.filter((_, idx) => idx !== i);
                onChange(next);
              }}
            />
          ))
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ alignSelf: "flex-start", marginTop: 4 }}
          onClick={() => onChange([...values, ""])}
        >
          {t("memory.addRow")}
        </button>
      </div>
    </div>
  );
}

function ListRow({
  value,
  onChange,
  onRemove,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  placeholder?: string;
}) {
  const t = useT();
  const [hover, setHover] = useState(false);
  return (
    <div
      className="row gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
    >
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "..."}
      />
      <button
        type="button"
        className="btn btn--icon"
        onClick={onRemove}
        aria-label={t("memory.removeRow")}
        data-hint={t("memory.removeHint")}
        style={{
          opacity: hover ? 1 : 0.45,
          transition: "opacity var(--motion-fast) var(--ease-out)"
        }}
      >
        ×
      </button>
    </div>
  );
}
