import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
import { useBailin, useActiveCharacter } from "../../shared/use-bailin.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { BlSwitchRow, BlToggleRow } from "../../shared/bl-switch.js";
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

const SCALE_MIN_PERCENT = Math.round(PET_DISPLAY_SCALE_MIN * 100);
const SCALE_MAX_PERCENT = Math.round(PET_DISPLAY_SCALE_MAX * 100);

export function DesktopBehaviorPanel(): JSX.Element {
  const { t, locale } = useI18n();
  const bailin = useBailin();
  const { bundle } = useActiveCharacter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [settings, setSettings] = useState<ProactiveSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [visionAvailable, setVisionAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [hushDraftMinutes, setHushDraftMinutes] = useState<ProactiveSettings["defaultHushMinutes"]>(30);
  const smartScreenshotLabelId = useId();
  const quietHoursLabelId = useId();

  const refreshStatus = useCallback(async () => {
    setStatus(await bailin.proactive.getStatus());
  }, [bailin]);

  useEffect(() => {
    void (async () => {
      const [s, st, vision] = await Promise.all([
        bailin.proactive.getSettings(),
        bailin.proactive.getStatus(),
        bailin.characters.detectVisionCapability().catch(() => null)
      ]);
      setSettings(s);
      setStatus(st);
      setVisionAvailable(vision?.vision ?? null);
    })();
    const timer = window.setInterval(() => void refreshStatus(), 30_000);
    return () => window.clearInterval(timer);
  }, [bailin, refreshStatus]);

  useEffect(() => {
    setHushDraftMinutes(settings.defaultHushMinutes);
  }, [settings.defaultHushMinutes]);

  async function save(next: ProactiveSettings, opts?: { silent?: boolean }): Promise<void> {
    setSettings(next);
    setSaving(true);
    try {
      const saved = await bailin.proactive.setSettings(next);
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
    await bailin.pet.hush(minutes * 60 * 1000);
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
  const switchOn = t("desktop.switchOn");
  const switchOff = t("desktop.switchOff");

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
  const scaleFillPercent =
    ((scalePercent - SCALE_MIN_PERCENT) / (SCALE_MAX_PERCENT - SCALE_MIN_PERCENT)) * 100;

  const frequency = settings.companionFrequency;
  const screenshotsOn = settings.screenAwareness === "screenshots";

  const frequencyHint = useMemo(() => {
    const base = t(FREQUENCY_HINT_KEYS[frequency] as "desktop.frequencyHint_off");
    const trackHint =
      bundle?.card.meta.track === "companion"
        ? t("desktop.trackHintCompanion")
        : bundle?.card.meta.track === "utility"
          ? t("desktop.trackHintUtility")
          : null;
    return trackHint ? `${base} ${trackHint}` : base;
  }, [frequency, bundle?.card.meta.track, t]);

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

  const lastTriggerLine = status?.lastAt
    ? t("desktop.statusLastTrigger", {
        reason: lastReasonLabel(status.lastReason),
        time: new Date(status.lastAt).toLocaleTimeString(timeLocale)
      })
    : t("desktop.statusNoLastTrigger");

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
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">{t("desktop.eyebrow")}</div>
        <div className="display display--page">{t("desktop.title")}</div>
        <p className="apple-page-subtitle">{t("desktop.subtitle")}</p>
      </div>

      <section className="desktop-section">
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
            <h2 className="desktop-section__title">{t("desktop.petSizeTitle")}</h2>
            <label className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="bl-field-label">{t("desktop.petSizeLabel")}</span>
                <span
                  className="body-sm"
                  style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-soft)" }}
                >
                  {t("desktop.petSizePercent", { percent: scalePercent })}
                </span>
              </div>
              <input
                type="range"
                className="desktop-scale"
                min={SCALE_MIN_PERCENT}
                max={SCALE_MAX_PERCENT}
                step={Math.round(PET_DISPLAY_SCALE_STEP * 100)}
                value={scalePercent}
                aria-label={t("desktop.petSizeLabel")}
                aria-valuetext={t("desktop.petSizePercent", { percent: scalePercent })}
                style={{ "--desktop-scale-fill": `${scaleFillPercent}%` } as React.CSSProperties}
                onChange={(e) => {
                  const nextScale = clampPetDisplayScale(Number(e.currentTarget.value) / 100);
                  void save({ ...settings, petDisplayScale: nextScale }, { silent: true });
                }}
                onPointerUp={() => {
                  showToast({ kind: "success", text: t("desktop.toastSaved") });
                }}
              />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="body-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t("desktop.petSizePercent", { percent: SCALE_MIN_PERCENT })}
                </span>
                <span className="body-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t("desktop.petSizePercent", { percent: SCALE_MAX_PERCENT })}
                </span>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="desktop-section">
        <h2 className="desktop-section__title">{t("desktop.proactiveTitle")}</h2>

        <div className="stack" style={{ gap: 8 }}>
          <span className="bl-field-label">{t("desktop.frequencyLabel")}</span>
          <p className="bl-field-hint" style={{ margin: 0 }}>
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
          <p className="bl-field-hint" style={{ margin: 0 }}>
            {frequencyHint}
          </p>
        </div>

        {frequencySupportsSmartScreenshot(frequency) ? (
          <>
            <BlSwitchRow
              labelId={smartScreenshotLabelId}
              label={t("desktop.smartScreenshotEnable")}
              checked={screenshotsOn}
              onCheckedChange={(enabled) => void setSmartScreenshot(enabled)}
              statusOn={switchOn}
              statusOff={switchOff}
              disabled={saving}
              style={{ marginTop: 8, paddingBottom: screenshotsOn ? 0 : 20 }}
            />
            {screenshotsOn ? (
              <div className="desktop-screenshot-meta">
                {screenshotStatusLine ? (
                  <p className="bl-field-hint" style={{ margin: "0 0 10px" }}>
                    {screenshotStatusLine}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={llmTesting || saving}
                  onClick={async () => {
                    setLlmTesting(true);
                    try {
                      const r = await bailin.proactive.triggerLlmScreenshot();
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
              </div>
            ) : null}
          </>
        ) : null}

        <details className="desktop-advanced">
          <summary className="desktop-advanced__summary">{t("desktop.advancedTitle")}</summary>
          <div style={{ marginTop: 4 }}>
            <span className="bl-field-label">{t("desktop.scenariosTitle")}</span>
            <div className="desktop-toggle-list">
              <BlToggleRow
                label={t("desktop.scenarioLongActive")}
                checked={settings.scenarioToggles.longActive}
                onCheckedChange={(longActive) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, longActive }
                  })
                }
              />
              <BlToggleRow
                label={t("desktop.scenarioIdle")}
                checked={settings.scenarioToggles.idle}
                onCheckedChange={(idle) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, idle }
                  })
                }
              />
              <BlToggleRow
                label={t("desktop.scenarioReturn")}
                checked={settings.scenarioToggles.returnActive}
                onCheckedChange={(returnActive) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, returnActive }
                  })
                }
              />
              <BlToggleRow
                label={t("desktop.scenarioUnlock")}
                checked={settings.scenarioToggles.unlock}
                onCheckedChange={(unlock) =>
                  void save({
                    ...settings,
                    scenarioToggles: { ...settings.scenarioToggles, unlock }
                  })
                }
              />
            </div>

            <div className="desktop-quiet-hours">
              <BlSwitchRow
                labelId={quietHoursLabelId}
                label={t("desktop.quietHoursTitle")}
                checked={settings.quietHoursEnabled}
                onCheckedChange={(quietHoursEnabled) =>
                  void save({ ...settings, quietHoursEnabled })
                }
                statusOn={switchOn}
                statusOff={switchOff}
                style={{ paddingTop: 0, borderBottom: "none" }}
              />
              {settings.quietHoursEnabled ? (
                <div className="desktop-quiet-hours__times">
                  <span className="body-sm">{t("desktop.quietHoursFrom")}</span>
                  <input
                    className="input"
                    type="time"
                    value={settings.quietHoursStart}
                    aria-label={t("desktop.quietHoursStartAria")}
                    onChange={(e) => void save({ ...settings, quietHoursStart: e.target.value })}
                    style={{ maxWidth: 140 }}
                  />
                  <span className="body-sm">{t("desktop.quietHoursTo")}</span>
                  <input
                    className="input"
                    type="time"
                    value={settings.quietHoursEnd}
                    aria-label={t("desktop.quietHoursEndAria")}
                    onChange={(e) => void save({ ...settings, quietHoursEnd: e.target.value })}
                    style={{ maxWidth: 140 }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </details>
      </section>

      <section className="desktop-section desktop-status">
        <h2 className="desktop-section__title">{t("desktop.statusAdvancedTitle")}</h2>

        <div className="desktop-status__bar">
          <span className="desktop-status__summary">{statusSummary}</span>
          <span className="desktop-status__meta">{lastTriggerLine}</span>
        </div>

        <p className="bl-field-hint" style={{ margin: "0 0 12px" }}>
          {t("desktop.quickActionsHint")}
        </p>

        <div className="desktop-status__actions">
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
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void confirmHush()}>
            {t("desktop.hushConfirm")}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={cancelHushDraft}>
            {t("desktop.hushCancel")}
          </button>
          <button
            type="button"
            className="btn btn--magenta"
            disabled={saving}
            onClick={async () => {
              const r = await bailin.proactive.triggerNow("manual");
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
      </section>
    </div>
  );
}
