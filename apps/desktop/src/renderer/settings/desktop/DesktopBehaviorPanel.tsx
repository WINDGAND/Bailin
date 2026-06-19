import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  CompanionFrequency,
  ProactiveSettings,
  ProactiveStatus
} from "../../../shared/ipc-contract.js";
import {
  COMPANION_FREQUENCIES,
  DEFAULT_SCENARIO_TOGGLES,
  frequencySupportsSmartScreenshot,
  frequencyToMaxPerHour
} from "../../../shared/proactive-companion.js";
import {
  clampPetDisplayScale,
  PET_DISPLAY_SCALE_DEFAULT,
  PET_DISPLAY_SCALE_MAX,
  PET_DISPLAY_SCALE_MIN,
  PET_DISPLAY_SCALE_STEP,
  resolveAtlasPetPixelSize,
  resolveDslPetPixelSize
} from "../../../shared/pet-display-scale.js";
import { useNuwa, useActiveCharacter } from "../../shared/use-nuwa.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { BlSelect } from "../../shared/BlSelect.js";
import { PetPreview } from "../../shared/pet-preview.js";
import { useI18n } from "../../shared/i18n/index.js";
import { translateTriggerReason as translateTriggerReasonText } from "../../shared/translate-trigger-reason.js";

const DEFAULT_SETTINGS: ProactiveSettings = {
  enabled: true,
  intensity: "light",
  maxPerHour: 1,
  companionFrequency: "light",
  scenarioToggles: { ...DEFAULT_SCENARIO_TOGGLES },
  defaultHushMinutes: 30,
  defaultFocusMinutes: 25,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  screenAwareness: "off",
  petDisplayScale: PET_DISPLAY_SCALE_DEFAULT
};

const HUSH_MINUTES = [15, 30, 60] as const;

const FREQUENCY_HINT_KEYS: Record<CompanionFrequency, string> = {
  off: "desktop.frequencyHint_off",
  light: "desktop.frequencyHint_light",
  standard: "desktop.frequencyHint_standard",
  active: "desktop.frequencyHint_active",
  intense: "desktop.frequencyHint_intense"
};

const LAST_REASON_KEYS: Record<string, string> = {
  long_active: "desktop.lastReasonLongActive",
  idle: "desktop.lastReasonIdle",
  active: "desktop.lastReasonReturn",
  unlock: "desktop.lastReasonUnlock",
  resume: "desktop.lastReasonUnlock",
  manual: "desktop.lastReasonManual",
  llm: "desktop.lastReasonLlm"
};

export function DesktopBehaviorPanel(): JSX.Element {
  const { t, locale } = useI18n();
  const nuwa = useNuwa();
  const { bundle } = useActiveCharacter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [settings, setSettings] = useState<ProactiveSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [visionAvailable, setVisionAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [hushDraftMinutes, setHushDraftMinutes] = useState<ProactiveSettings["defaultHushMinutes"]>(30);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [statusOpen, setStatusOpen] = useState(true);

  const refreshStatus = useCallback(async () => {
    setStatus(await nuwa.proactive.getStatus());
  }, [nuwa]);

  useEffect(() => {
    void (async () => {
      const [s, st, vision] = await Promise.all([
        nuwa.proactive.getSettings(),
        nuwa.proactive.getStatus(),
        nuwa.characters.detectVisionCapability().catch(() => null)
      ]);
      setSettings(s);
      setStatus(st);
      setVisionAvailable(vision?.vision ?? null);
    })();
    const timer = window.setInterval(() => void refreshStatus(), 30_000);
    return () => window.clearInterval(timer);
  }, [nuwa, refreshStatus]);

  useEffect(() => {
    setHushDraftMinutes(settings.defaultHushMinutes);
  }, [settings.defaultHushMinutes]);

  async function save(next: ProactiveSettings, opts?: { silent?: boolean }): Promise<void> {
    setSettings(next);
    setSaving(true);
    try {
      const saved = await nuwa.proactive.setSettings(next);
      setSettings(saved);
      await refreshStatus();
      if (!opts?.silent) {
        showToast({ kind: "success", text: t("desktop.toastSaved") });
      }
    } finally {
      setSaving(false);
    }
  }

  function setFrequency(companionFrequency: CompanionFrequency): void {
    void save({
      ...settings,
      companionFrequency,
      intensity: companionFrequency,
      enabled: companionFrequency !== "off",
      maxPerHour: frequencyToMaxPerHour(companionFrequency)
    });
  }

  async function setSmartScreenshot(enabled: boolean): Promise<void> {
    if (enabled) {
      const ok = await confirm({
        title: t("desktop.smartScreenshotConfirmTitle"),
        body: t("desktop.smartScreenshotConfirmBody"),
        confirmLabel: t("desktop.smartScreenshotConfirmOk"),
        cancelLabel: t("common.discardCancel")
      });
      if (!ok) return;
    }
    void save({
      ...settings,
      screenAwareness: enabled ? "screenshots" : "off"
    });
  }

  function translateTriggerReason(reason: string | undefined): string {
    return translateTriggerReasonText(t, reason);
  }

  async function confirmHush(): Promise<void> {
    const minutes = hushDraftMinutes;
    if (minutes !== settings.defaultHushMinutes) {
      await save({ ...settings, defaultHushMinutes: minutes }, { silent: true });
    }
    await nuwa.pet.hush(minutes * 60 * 1000);
    await refreshStatus();
    showToast({
      kind: "success",
      text: t("desktop.toastHushStarted", {
        minutes,
        time: new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString(timeLocale)
      })
    });
  }

  function cancelHushDraft(): void {
    setHushDraftMinutes(settings.defaultHushMinutes);
    showToast({ kind: "info", text: t("desktop.toastHushCancelled") });
  }

  function lastReasonLabel(reason: string | undefined): string {
    if (!reason) return t("desktop.lastReasonNone");
    const key = LAST_REASON_KEYS[reason];
    return key ? t(key) : reason;
  }

  const timeLocale = locale === "zh" ? "zh-CN" : "en-US";

  const previewSize = useMemo(() => {
    const scale = settings.petDisplayScale ?? PET_DISPLAY_SCALE_DEFAULT;
    const program = bundle?.sprite;
    if (!program) return { width: 108, height: 128 };
    if (program.mode === "atlas" && program.atlas) {
      const px = resolveAtlasPetPixelSize(program.atlas.cell, scale);
      const fit = Math.min(108 / px.width, 128 / px.height, 1);
      return { width: Math.round(px.width * fit), height: Math.round(px.height * fit) };
    }
    const px = resolveDslPetPixelSize(program.size, program.displayScale, scale);
    const fit = Math.min(108 / px.width, 128 / px.height, 1);
    return { width: Math.round(px.width * fit), height: Math.round(px.height * fit) };
  }, [bundle?.sprite, settings.petDisplayScale]);

  const scalePercent = Math.round((settings.petDisplayScale ?? PET_DISPLAY_SCALE_DEFAULT) * 100);
  const frequency = settings.companionFrequency;
  const screenshotsOn = settings.screenAwareness === "screenshots";

  const frequencyHint = t(FREQUENCY_HINT_KEYS[frequency] as "desktop.frequencyHint_off");
  const trackHint =
    bundle?.card.meta.track === "companion"
      ? t("desktop.trackHintCompanion")
      : bundle?.card.meta.track === "utility"
        ? t("desktop.trackHintUtility")
        : null;

  const statusSummary = useMemo(() => {
    const count = status?.utterancesThisHour ?? 0;
    const max = status?.maxPerHour ?? settings.maxPerHour;
    const now = Date.now();
    const quietUntil = Math.max(
      status?.hushUntil && status.hushUntil > now ? status.hushUntil : 0,
      status?.focusModeUntil && status.focusModeUntil > now ? status.focusModeUntil : 0
    );
    if (quietUntil > now) {
      return t("desktop.statusSummaryHush", {
        time: new Date(quietUntil).toLocaleTimeString(timeLocale),
        count,
        max
      });
    }
    return t("desktop.statusSummaryReady", { count, max });
  }, [status, settings.maxPerHour, t, timeLocale]);

  const screenshotStatusLine = useMemo(() => {
    if (!screenshotsOn) return null;
    const parts: string[] = [];
    if (status?.lastScreenshotAt) {
      parts.push(
        t("desktop.smartScreenshotLastAt", {
          time: new Date(status.lastScreenshotAt).toLocaleString(timeLocale)
        })
      );
    }
    if (!frequencySupportsSmartScreenshot(frequency)) {
      parts.push(t("desktop.smartScreenshotRequiresStandard"));
    } else if (visionAvailable === false) {
      parts.push(t("desktop.smartScreenshotRequiresVision"));
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [screenshotsOn, status?.lastScreenshotAt, frequency, visionAvailable, t, timeLocale]);

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <div className="eyebrow">{t("desktop.eyebrow")}</div>
        <h1 className="display display--page" style={{ margin: "6px 0 0" }}>
          {t("desktop.title")}
        </h1>
        <p className="bl-field-hint" style={{ maxWidth: 520, margin: "8px 0 0" }}>
          {t("desktop.subtitle")}
        </p>
      </div>

      <section className="card" style={{ padding: 18 }}>
        <div className="row gap-3 row--start-top" style={{ alignItems: "flex-start" }}>
          <div
            className="apple-stage"
            style={{
              flexShrink: 0,
              width: 128,
              height: 148,
              borderRadius: 20,
              display: "grid",
              placeItems: "center"
            }}
          >
            {bundle?.sprite ? (
              <PetPreview
                program={bundle.sprite}
                width={previewSize.width}
                height={previewSize.height}
              />
            ) : (
              <span className="body-sm" style={{ textAlign: "center", padding: 8 }}>
                {t("desktop.petSizePreviewEmpty")}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
              {t("desktop.petSizeTitle")}
            </h2>
            <label className="stack" style={{ gap: 8, marginTop: 14 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="body-sm">{t("desktop.petSizeLabel")}</span>
                <span className="body-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t("desktop.petSizePercent", { percent: scalePercent })}
                </span>
              </div>
              <input
                type="range"
                min={Math.round(PET_DISPLAY_SCALE_MIN * 100)}
                max={Math.round(PET_DISPLAY_SCALE_MAX * 100)}
                step={Math.round(PET_DISPLAY_SCALE_STEP * 100)}
                value={scalePercent}
                onChange={(e) => {
                  const nextScale = clampPetDisplayScale(Number(e.currentTarget.value) / 100);
                  void save({ ...settings, petDisplayScale: nextScale }, { silent: true });
                }}
                onPointerUp={() => {
                  showToast({ kind: "success", text: t("desktop.toastSaved") });
                }}
                style={{ width: "100%" }}
              />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="body-sm">
                  {t("desktop.petSizePercent", { percent: Math.round(PET_DISPLAY_SCALE_MIN * 100) })}
                </span>
                <span className="body-sm">
                  {t("desktop.petSizePercent", { percent: Math.round(PET_DISPLAY_SCALE_MAX * 100) })}
                </span>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
          {t("desktop.proactiveTitle")}
        </h2>

        <Field label={t("desktop.frequencyLabel")} style={{ marginTop: 16 }}>
          <p className="bl-field-hint" style={{ margin: "0 0 8px" }}>
            {t("desktop.frequencyQuotaNote")}
          </p>
          <BlSelect
            value={frequency}
            onChange={(companionFrequency) => setFrequency(companionFrequency)}
            options={COMPANION_FREQUENCIES.map((f) => ({
              value: f,
              label: t(`desktop.frequency_${f}` as "desktop.frequency_off")
            }))}
          />
          <p className="bl-field-hint" style={{ margin: "6px 0 0" }}>
            {frequencyHint}
            {trackHint ? ` ${trackHint}` : null}
          </p>
        </Field>

        {frequencySupportsSmartScreenshot(frequency) ? (
          <div
            className="stack"
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 12,
              background: "var(--bl-surface-muted, rgba(0, 0, 0, 0.03))"
            }}
          >
            <label className="row gap-2" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={screenshotsOn}
                onChange={(e) => void setSmartScreenshot(e.currentTarget.checked)}
              />
              <span className="body-sm">{t("desktop.smartScreenshotEnable")}</span>
            </label>
            {screenshotsOn ? (
              <>
                {screenshotStatusLine ? (
                  <p className="bl-field-hint" style={{ margin: 0 }}>
                    {screenshotStatusLine}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn--magenta"
                  style={{ alignSelf: "flex-start" }}
                  disabled={llmTesting || saving}
                  onClick={async () => {
                    setLlmTesting(true);
                    try {
                      const r = await nuwa.proactive.triggerLlmScreenshot();
                      showToast({
                        kind: r.ok ? "success" : "info",
                        text: r.ok
                          ? t("desktop.toastLlmTriggered")
                          : t("desktop.toastTriggerFailed", {
                              reason: translateTriggerReason(r.reason)
                            })
                      });
                      await refreshStatus();
                    } finally {
                      setLlmTesting(false);
                    }
                  }}
                >
                  {llmTesting ? t("common.loading") : t("desktop.smartScreenshotTryButton")}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <details
          style={{ marginTop: 18 }}
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="body-sm" style={{ cursor: "pointer", userSelect: "none" }}>
            {t("desktop.advancedTitle")}
          </summary>
          <div className="stack stack--lg" style={{ marginTop: 14 }}>
            <div className="stack" style={{ gap: 10 }}>
              <span className="bl-field-label" style={{ fontSize: "var(--text-caption)", fontWeight: 500 }}>
                {t("desktop.scenariosTitle")}
              </span>
              <ScenarioToggle
                label={t("desktop.scenarioLongActive")}
                checked={settings.scenarioToggles.longActive}
                onChange={(longActive) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, longActive }
                  })
                }
              />
              <ScenarioToggle
                label={t("desktop.scenarioIdle")}
                checked={settings.scenarioToggles.idle}
                onChange={(idle) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, idle }
                  })
                }
              />
              <ScenarioToggle
                label={t("desktop.scenarioReturn")}
                checked={settings.scenarioToggles.returnActive}
                onChange={(returnActive) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, returnActive }
                  })
                }
              />
              <ScenarioToggle
                label={t("desktop.scenarioUnlock")}
                checked={settings.scenarioToggles.unlock}
                onChange={(unlock) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, unlock }
                  })
                }
              />
            </div>

            <Field label={t("desktop.quietHoursTitle")}>
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                <label className="row gap-2">
                  <input
                    type="checkbox"
                    checked={settings.quietHoursEnabled}
                    onChange={(e) =>
                      void save({ ...settings, quietHoursEnabled: e.currentTarget.checked })
                    }
                  />
                  <span className="body-sm">{t("desktop.quietHoursEnable")}</span>
                </label>
                <input
                  className="input"
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) => void save({ ...settings, quietHoursStart: e.currentTarget.value })}
                  style={{ maxWidth: 140 }}
                  disabled={!settings.quietHoursEnabled}
                />
                <span className="body-sm">{t("desktop.quietHoursTo")}</span>
                <input
                  className="input"
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) => void save({ ...settings, quietHoursEnd: e.currentTarget.value })}
                  style={{ maxWidth: 140 }}
                  disabled={!settings.quietHoursEnabled}
                />
              </div>
            </Field>
          </div>
        </details>
      </section>

      <details
        className="card"
        style={{ padding: 18 }}
        open={statusOpen}
        onToggle={(e) => setStatusOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary
          className="body-sm"
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <span className="display display--section" style={{ fontSize: 20 }}>
            {t("desktop.statusAdvancedTitle")}
          </span>
          <span className="bl-field-hint" style={{ display: "block", marginTop: 6 }}>
            {statusSummary}
          </span>
        </summary>

        <div className="body-sm" style={{ marginTop: 14 }}>
          {status?.lastAt
            ? t("desktop.statusLastTrigger", {
                reason: lastReasonLabel(status.lastReason),
                time: new Date(status.lastAt).toLocaleTimeString(timeLocale)
              })
            : t("desktop.statusNoLastTrigger")}
        </div>

        <p className="bl-field-hint" style={{ margin: "12px 0 0" }}>
          {t("desktop.quickActionsHint")}
        </p>

        <div
          className="row gap-2"
          style={{ marginTop: 12, flexWrap: "wrap", alignItems: "center" }}
        >
          <span className="body-sm">{t("desktop.hushActionLabel")}</span>
          <div style={{ width: 112, flexShrink: 0 }}>
            <BlSelect
              value={String(hushDraftMinutes)}
              onChange={(raw) =>
                setHushDraftMinutes(Number(raw) as ProactiveSettings["defaultHushMinutes"])
              }
              options={HUSH_MINUTES.map((n) => ({
                value: String(n),
                label: t("desktop.minutes", { count: n })
              }))}
              aria-label={t("desktop.hushDurationAria")}
            />
          </div>
          <button type="button" className="btn btn--magenta" onClick={() => void confirmHush()}>
            {t("desktop.hushConfirm")}
          </button>
          <button type="button" className="btn btn--ghost" onClick={cancelHushDraft}>
            {t("desktop.hushCancel")}
          </button>
        </div>

        <div className="row gap-2" style={{ marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--magenta"
            disabled={saving}
            onClick={async () => {
              const r = await nuwa.proactive.triggerNow("manual");
              showToast({
                kind: r.ok ? "success" : "info",
                text: r.ok
                  ? t("desktop.toastTriggered")
                  : t("desktop.toastTriggerFailed", {
                      reason: translateTriggerReason(r.reason)
                    })
              });
              await refreshStatus();
            }}
          >
            {t("desktop.triggerButton")}
          </button>
        </div>
      </details>
    </div>
  );
}

function Field({
  label,
  children,
  style
}: {
  label: string;
  children: ReactNode;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div className="stack" style={{ gap: 8, ...style }}>
      <span className="body-sm">{label}</span>
      {children}
    </div>
  );
}

function ScenarioToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <label className="row gap-2" style={{ cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="body-sm">{label}</span>
    </label>
  );
}
