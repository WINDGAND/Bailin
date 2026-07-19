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
import { useBailin } from "../../shared/use-bailin.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { useDirtyTracker } from "../app/dirty-context.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import { formatChatTime } from "../../shared/format-chat-time.js";
import { Icon } from "../../shared/icon.js";
import { BlSwitch } from "../../shared/bl-switch.js";

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
  const bailin = useBailin();
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
  const autoLearnLabelId = useId();

  const groupedFacts = useMemo(() => groupFactsByCategory(profile.facts), [profile.facts]);
  const hasAnyFacts = profile.facts.length > 0;

  async function reload(): Promise<void> {
    try {
      const [p, s, changes] = await Promise.all([
        bailin.memory.getProfile(),
        bailin.memory.getSettings(),
        bailin.memory.getRecentChanges(5)
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
  }, [bailin]);

  const dirtyRef = useRef(false);
  const dirty = useMemo(
    () => loaded && profileKey(profile) !== profileKey(initial),
    [profile, initial, loaded]
  );
  dirtyRef.current = dirty;
  useDirtyTracker(dirty);

  useEffect(() => {
    return bailin.on.profileUpdated((evt) => {
      if (dirtyRef.current) {
        setPendingAutoBanner(true);
        return;
      }
      setProfile(evt.profile);
      setInitial(evt.profile);
      void bailin.memory.getRecentChanges(5).then(setRecentChanges);
    });
  }, [bailin]);

  async function save(): Promise<void> {
    setSaving(true);
    const clean = cleanProfileForSave(profile, Date.now());
    try {
      await bailin.memory.updateProfile(clean);
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
      const next = await bailin.memory.setSettings({ autoLearnEnabled: enabled });
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
      const res = await bailin.memory.undoLastChange();
      if (res.ok && res.profile) {
        setProfile(res.profile);
        setInitial(res.profile);
        setRecentChanges(await bailin.memory.getRecentChanges(5));
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

  const latestChangeRecord = recentChanges[0];

  const canUndo = useMemo(() => {
    if (!latestChangeRecord) return false;
    return Date.now() - latestChangeRecord.appliedAt <= UNDO_WINDOW_MS;
  }, [latestChangeRecord]);

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
      await bailin.memory.clearProfile();
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

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">{t("memory.eyebrow")}</div>
        <div className="display display--page">{t("memory.title")}</div>
        <p className="apple-page-subtitle">{t("memory.subtitle")}</p>
        <p className="bl-field-hint" style={{ marginTop: 10, maxWidth: 480 }}>
          {t("memory.introHint")}
        </p>
      </div>

      <div>
        {pendingAutoBanner ? (
          <div role="status" aria-live="polite" className="memory-pending-banner" style={{ marginBottom: 20 }}>
            <span className="body-sm" style={{ flex: 1 }}>
              {t("memory.pendingAutoBanner")}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
              {t("memory.refreshProfile")}
            </button>
          </div>
        ) : null}

        <div className="bl-switch-row memory-switch-row" style={{ marginBottom: 28 }}>
          <div>
            <div id={autoLearnLabelId} className="bl-field-label">
              {t("memory.autoLearnTitle")}
            </div>
            <p className="bl-field-hint" style={{ marginTop: 4, marginBottom: 0 }}>
              {t("memory.autoLearnHint")}
            </p>
            <p className="bl-field-hint" style={{ marginTop: 6, marginBottom: 0 }}>
              {t("memory.autoLearnInterval", { n: settings.extractEveryNTurns })}
            </p>
          </div>
          <div className="bl-switch-row__control memory-switch-row__control">
            <span className="body-sm" style={{ color: "var(--ink-soft)" }}>
              {settings.autoLearnEnabled ? t("memory.autoLearnOn") : t("memory.autoLearnOff")}
            </span>
            <BlSwitch
              checked={settings.autoLearnEnabled}
              onCheckedChange={(enabled) => void toggleAutoLearn(enabled)}
              labelledBy={autoLearnLabelId}
            />
          </div>
        </div>

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

        <div style={{ marginBottom: 24 }}>
          <div className="bl-field-label">{t("memory.factsSectionTitle")}</div>
          <p className="bl-field-hint" style={{ marginTop: 0 }}>
            {t("memory.factsSectionHint")}
          </p>

          {!hasAnyFacts ? (
            <p className="bl-field-hint" style={{ margin: "12px 0 0" }}>
              {t("memory.factsEmpty")}
            </p>
          ) : (
            <div className="stack" style={{ marginTop: 14, gap: 22 }}>
              {PROFILE_FACT_CATEGORY_ORDER.map((category, index) => {
                const items = groupedFacts.get(category) ?? [];
                if (items.length === 0) return null;
                return (
                  <FactGroup
                    key={category}
                    index={index}
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

          <div style={{ marginTop: 16 }}>
            <AddFactButton onAdd={addFact} />
          </div>
        </div>

        {latestChangeRecord ? (
          <div className="memory-activity" style={{ marginBottom: 24 }}>
            <span className="memory-activity__icon">
              <Icon name="sparkle" size={13} />
            </span>
            <span className="memory-activity__text">
              <strong>{t("memory.recentLearned")}</strong>
              {"："}
              {summarizeLatestChanges(latestChangeRecord.changes, t)}
            </span>
            <span className="memory-activity__time">
              {formatChatTime(latestChangeRecord.appliedAt, locale)}
            </span>
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
        ) : null}

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

/** 活动条只承担审计 / 撤回，不复述完整台账——最多展示最近一批的 2 条变更。 */
function summarizeLatestChanges(
  changes: ProfileChange[],
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const shown = changes.slice(0, 2).map((c) => {
    const prefix = c.kind === "remove_fact" ? "−" : "+";
    return `${prefix} ${c.text}`;
  });
  const extra = changes.length - shown.length;
  const summary = shown.join("、");
  return extra > 0 ? `${summary} ${t("memory.justLearnedMore", { n: extra })}` : summary;
}

function FactGroup({
  category,
  facts,
  allFacts,
  onChange,
  locale,
  index
}: {
  category: ProfileFactCategory;
  facts: ProfileFact[];
  allFacts: ProfileFact[];
  onChange: (facts: ProfileFact[]) => void;
  locale: "zh" | "en";
  index: number;
}) {
  const t = useT();
  const isBoundary = category === "boundary";

  return (
    <div className="fade-in-up" style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}>
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
      <ul className="memory-ledger">
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
      </ul>
    </div>
  );
}

function AddFactButton({ onAdd }: { onAdd: (category: ProfileFactCategory) => void }): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const groupId = useId();

  return (
    <div>
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
          className="forge-chips"
          role="group"
          aria-label={t("memory.addFact")}
          style={{ marginTop: 10 }}
        >
          {PROFILE_FACT_CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              className="forge-chip"
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
  return (
    <li className="memory-ledger-row">
      <input
        className="memory-ledger-row__input"
        value={entry.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "…"}
        aria-label={t(`memory.category.${entry.category}`)}
      />
      <div className="memory-ledger-row__meta">
        {entry.source === "auto" ? (
          <span className="bl-tag" style={{ fontSize: 10.5, padding: "2px 7px" }}>
            {t("memory.sourceAuto")}
          </span>
        ) : null}
        <span className="memory-ledger-row__time">{formatChatTime(entry.updatedAt, locale)}</span>
        <button
          type="button"
          className="memory-ledger-row__remove"
          onClick={onRemove}
          aria-label={t("memory.removeRow")}
          data-hint={t("memory.removeHint")}
        >
          <Icon name="close" size={13} strokeWidth={1.8} />
        </button>
      </div>
    </li>
  );
}
