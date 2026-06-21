import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ulid } from "ulid";
import type {
  MemorySettings,
  ProfileChange,
  ProfileChangeRecord,
  ProfileFact,
  ProfileFactCategory,
  UserProfile
} from "../../../shared/ipc-contract.js";
import {
  emptyProfile,
  groupFactsByCategory,
  PROFILE_FACT_CATEGORY_ORDER
} from "../../../shared/profile.js";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { useDirtyTracker } from "../app/dirty-context.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import { formatChatTime } from "../../shared/format-chat-time.js";
import { Icon } from "../../shared/icon.js";

const MAX_NAME = 24;
const UNDO_WINDOW_MS = 10 * 60 * 1000;

function profileKey(p: UserProfile): string {
  return JSON.stringify(p);
}

function cleanProfileForSave(profile: UserProfile, now: number): UserProfile {
  const nameText = profile.preferredName?.text?.trim();
  return {
    preferredName: nameText
      ? {
          text: nameText,
          updatedAt: now,
          source: "manual" as const,
          characterId: profile.preferredName?.characterId,
          sessionId: profile.preferredName?.sessionId
        }
      : undefined,
    facts: profile.facts
      .map((f) => ({
        ...f,
        text: f.text.trim(),
        source: "manual" as const,
        updatedAt: now
      }))
      .filter((f) => f.text.length > 0)
  };
}

export function MemoryPanel(): JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<UserProfile>(emptyProfile());
  const [initial, setInitial] = useState<UserProfile>(emptyProfile());
  const [settings, setSettings] = useState<MemorySettings>({
    autoLearnEnabled: true,
    extractEveryNTurns: 2
  });
  const [recentChanges, setRecentChanges] = useState<ProfileChangeRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pendingAutoBanner, setPendingAutoBanner] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const autoLearnToggleId = useId();

  const groupedFacts = useMemo(() => groupFactsByCategory(profile.facts), [profile.facts]);
  const hasAnyFacts = profile.facts.length > 0;

  async function reload(): Promise<void> {
    try {
      const [p, s, changes] = await Promise.all([
        nuwa.memory.getProfile(),
        nuwa.memory.getSettings(),
        nuwa.memory.getRecentChanges(5)
      ]);
      setProfile(p);
      setInitial(p);
      setSettings(s);
      setRecentChanges(changes);
      setPendingAutoBanner(false);
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

  const dirtyRef = useRef(false);
  const dirty = useMemo(
    () => loaded && profileKey(profile) !== profileKey(initial),
    [profile, initial, loaded]
  );
  dirtyRef.current = dirty;
  useDirtyTracker(dirty);

  useEffect(() => {
    return nuwa.on.profileUpdated((evt) => {
      if (dirtyRef.current) {
        setPendingAutoBanner(true);
        return;
      }
      setProfile(evt.profile);
      setInitial(evt.profile);
      void nuwa.memory.getRecentChanges(5).then(setRecentChanges);
    });
  }, [nuwa]);

  async function save(): Promise<void> {
    setSaving(true);
    const clean = cleanProfileForSave(profile, Date.now());
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
    setPendingAutoBanner(false);
  }

  function updateFacts(next: ProfileFact[]): void {
    setProfile({ ...profile, facts: next });
  }

  function addFact(category: ProfileFactCategory): void {
    updateFacts([
      ...profile.facts,
      {
        id: ulid(),
        text: "",
        category,
        updatedAt: Date.now(),
        source: "manual"
      }
    ]);
  }

  async function toggleAutoLearn(enabled: boolean): Promise<void> {
    try {
      const next = await nuwa.memory.setSettings({ autoLearnEnabled: enabled });
      setSettings(next);
      showToast({
        kind: "info",
        text: enabled ? t("memory.autoLearnOn") : t("memory.autoLearnOff")
      });
    } catch (e) {
      showToast({
        kind: "error",
        text: t("memory.toastSaveFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    }
  }

  async function undoLast(): Promise<void> {
    setUndoing(true);
    try {
      const res = await nuwa.memory.undoLastChange();
      if (res.ok && res.profile) {
        setProfile(res.profile);
        setInitial(res.profile);
        setRecentChanges(await nuwa.memory.getRecentChanges(5));
        showToast({ kind: "info", text: t("memory.toastUndone") });
      } else if (res.reason === "expired") {
        showToast({ kind: "error", text: t("memory.toastUndoExpired") });
      } else {
        showToast({ kind: "error", text: t("memory.toastUndoFailed") });
      }
    } finally {
      setUndoing(false);
    }
  }

  const canUndo = useMemo(() => {
    const latest = recentChanges[0];
    if (!latest) return false;
    return Date.now() - latest.appliedAt <= UNDO_WINDOW_MS;
  }, [recentChanges]);

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
      setProfile(emptyProfile());
      setInitial(emptyProfile());
      setRecentChanges([]);
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
      setProfile(emptyProfile());
      setInitial(emptyProfile());
      setRecentChanges([]);
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
        {pendingAutoBanner ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginBottom: 16,
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--surface-muted, rgba(0,0,0,0.04))"
            }}
          >
            <span className="body-sm" style={{ flex: 1 }}>
              {t("memory.pendingAutoBanner")}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
              {t("memory.refreshProfile")}
            </button>
          </div>
        ) : null}

        <div
          className="apple-list-row"
          style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--grid)" }}
        >
          <div className="row row--between gap-3" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="bl-field-label">{t("memory.autoLearnTitle")}</div>
              <p className="bl-field-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                {t("memory.autoLearnHint")}
              </p>
              <p className="bl-field-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                {t("memory.autoLearnInterval", { n: settings.extractEveryNTurns })}
              </p>
            </div>
            <label htmlFor={autoLearnToggleId} className="row gap-2" style={{ alignItems: "center", cursor: "pointer" }}>
              <input
                id={autoLearnToggleId}
                type="checkbox"
                checked={settings.autoLearnEnabled}
                onChange={(e) => void toggleAutoLearn(e.target.checked)}
              />
              <span className="body-sm">{t("memory.autoLearnToggle")}</span>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 26 }}>
          <p className="body-md" style={{ margin: "0 0 24px", maxWidth: 520 }}>
            {t("memory.introHint")}
          </p>

          <div style={{ marginBottom: 28 }}>
            <label htmlFor="memory-name" className="bl-field-label bl-field-label--with-hint">
              {t("memory.nameLabel")}
              {profile.preferredName?.source === "auto" ? (
                <span
                  className="bl-tag"
                  style={{ marginLeft: 8, fontSize: 10.5, padding: "2px 7px" }}
                >
                  {t("memory.sourceAuto")}
                </span>
              ) : null}
            </label>
            <p className="bl-field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              {t("memory.nameHint")}
            </p>
            <input
              id="memory-name"
              className="forge-field-name__input"
              value={profile.preferredName?.text ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  preferredName: e.target.value.trim()
                    ? {
                        text: e.target.value,
                        updatedAt: Date.now(),
                        source: "manual"
                      }
                    : undefined
                })
              }
              placeholder={t("memory.namePlaceholder")}
              maxLength={MAX_NAME + 10}
              style={{ fontSize: "clamp(22px, 2.4vw, 28px)" }}
            />
          </div>

          <div className="apple-list-group">
            <div className="apple-list-row">
              <div className="bl-field-label">{t("memory.factsSectionTitle")}</div>
              <p className="bl-field-hint" style={{ marginTop: 0 }}>
                {t("memory.factsSectionHint")}
              </p>

              {!hasAnyFacts ? (
                <p className="bl-field-hint" style={{ margin: "12px 0 0" }}>
                  {t("memory.factsEmpty")}
                </p>
              ) : (
                <div className="stack" style={{ marginTop: 12, gap: 20 }}>
                  {PROFILE_FACT_CATEGORY_ORDER.map((category) => {
                    const items = groupedFacts.get(category) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <FactGroup
                        key={category}
                        category={category}
                        facts={items}
                        allFacts={profile.facts}
                        onChange={updateFacts}
                        locale={locale}
                      />
                    );
                  })}
                </div>
              )}

              <div className="row gap-2 row--wrap" style={{ marginTop: 14 }}>
                <AddFactButton onAdd={addFact} />
              </div>
            </div>
          </div>

          {recentChanges.length > 0 ? (
            <div style={{ marginTop: 28 }}>
              <div className="row row--between" style={{ marginBottom: 10 }}>
                <div className="bl-field-label">{t("memory.recentLearned")}</div>
                {canUndo ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={undoing}
                    onClick={() => void undoLast()}
                  >
                    {t("memory.undoLast")}
                  </button>
                ) : null}
              </div>
              <ul className="stack" style={{ gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                {recentChanges
                  .flatMap((rec) =>
                    rec.changes.slice(0, 3).map((c, i) => (
                      <li
                        key={`${rec.id}-${i}`}
                        className="body-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {formatChangeLine(c, t)} · {formatChatTime(c.at, locale)}
                      </li>
                    ))
                  )
                  .slice(0, 5)}
              </ul>
            </div>
          ) : null}
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
              <span className="body-sm">
                {t("memory.synced")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatChangeLine(
  change: ProfileChange,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const prefix = change.kind.startsWith("remove") ? "−" : "+";
  if (change.kind === "add_name") {
    return `${prefix} ${t("memory.changeName")}：${change.text}`;
  }
  const catKey = change.category ? `memory.category.${change.category}` : "memory.category.other";
  return `${prefix} ${t(catKey)}：${change.text}`;
}

function FactGroup({
  category,
  facts,
  allFacts,
  onChange,
  locale
}: {
  category: ProfileFactCategory;
  facts: ProfileFact[];
  allFacts: ProfileFact[];
  onChange: (facts: ProfileFact[]) => void;
  locale: "zh" | "en";
}) {
  const t = useT();
  const isBoundary = category === "boundary";

  return (
    <div>
      <div className="bl-field-label bl-field-label--with-hint" style={{ marginBottom: 8 }}>
        {t(`memory.category.${category}`)}
        {isBoundary ? (
          <span
            className="bl-tag"
            style={{ marginLeft: 8, fontSize: 10.5, padding: "2px 7px" }}
          >
            {t("memory.softConstraint")}
          </span>
        ) : null}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {facts.map((entry) => (
          <FactRow
            key={entry.id}
            entry={entry}
            locale={locale}
            placeholder={t("memory.factPlaceholder")}
            onChange={(text) => {
              onChange(
                allFacts.map((f) =>
                  f.id === entry.id
                    ? { ...f, text, updatedAt: Date.now(), source: "manual" as const }
                    : f
                )
              );
            }}
            onRemove={() => {
              onChange(allFacts.filter((f) => f.id !== entry.id));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AddFactButton({ onAdd }: { onAdd: (category: ProfileFactCategory) => void }): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const groupId = useId();

  return (
    <div className="row gap-2 row--wrap" style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? groupId : undefined}
      >
        {t("memory.addFact")}
      </button>
      {open ? (
        <div
          id={groupId}
          className="row gap-2 row--wrap"
          role="group"
          aria-label={t("memory.addFact")}
          style={{ marginTop: 4 }}
        >
          {PROFILE_FACT_CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onAdd(cat);
                setOpen(false);
              }}
            >
              {t(`memory.category.${cat}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FactRow({
  entry,
  onChange,
  onRemove,
  placeholder,
  locale
}: {
  entry: ProfileFact;
  onChange: (v: string) => void;
  onRemove: () => void;
  placeholder?: string;
  locale: "zh" | "en";
}) {
  const t = useT();
  const [hover, setHover] = useState(false);
  return (
    <div
      className="stack"
      style={{ gap: 4 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="row gap-2">
        <input
          className="input"
          value={entry.text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "..."}
          style={{ flex: 1 }}
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
          <Icon name="close" size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="row gap-2" style={{ paddingLeft: 2 }}>
        {entry.source === "auto" ? (
          <span className="bl-tag" style={{ fontSize: 10.5, padding: "2px 7px" }}>
            {t("memory.sourceAuto")}
          </span>
        ) : null}
        <span className="body-sm" style={{ color: "var(--ink-faint)" }}>
          {formatChatTime(entry.updatedAt, locale)}
        </span>
      </div>
    </div>
  );
}
