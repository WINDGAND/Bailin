import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProactiveSettings, ProactiveStatus } from "../../../shared/ipc-contract.js";
import {
  clampPetDisplayScale,
  PET_DISPLAY_SCALE_MAX,
  PET_DISPLAY_SCALE_MIN,
  PET_DISPLAY_SCALE_STEP,
  resolveAtlasPetPixelSize,
  resolveDslPetPixelSize
} from "../../../shared/pet-display-scale.js";
import { useNuwa, useActiveCharacter } from "../../shared/use-nuwa.js";
import { useToast } from "../../shared/feedback.js";
import { BlSelect } from "../../shared/BlSelect.js";
import { PetPreview } from "../../shared/pet-preview.js";
import { useI18n } from "../../shared/i18n/index.js";

const DEFAULT_SETTINGS: ProactiveSettings = {
  enabled: true,
  intensity: "light",
  maxPerHour: 1,
  defaultHushMinutes: 30,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  screenAwareness: "off",
  petDisplayScale: 1
};

const HUSH_MINUTES = [15, 30, 60] as const;
const MAX_PER_HOUR = [0, 1, 2] as const;

const TRIGGER_REASON_KEYS: Record<string, string> = {
  disabled: "desktop.triggerReasonDisabled",
  "quiet-hours": "desktop.triggerReasonQuietHours",
  hushed: "desktop.triggerReasonHushed",
  "chat-visible": "desktop.triggerReasonChatVisible",
  locked: "desktop.triggerReasonLocked",
  "quota-disabled": "desktop.triggerReasonQuotaDisabled",
  "hourly-quota": "desktop.triggerReasonHourlyQuota",
  "no-active-character": "desktop.triggerReasonNoActiveCharacter",
  "character-not-found": "desktop.triggerReasonCharacterNotFound"
};

export function DesktopBehaviorPanel(): JSX.Element {
  const { t, locale } = useI18n();
  const nuwa = useNuwa();
  const { bundle } = useActiveCharacter();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<ProactiveSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, st] = await Promise.all([
        nuwa.proactive.getSettings(),
        nuwa.proactive.getStatus()
      ]);
      setSettings(s);
      setStatus(st);
    })();
  }, [nuwa]);

  async function save(next: ProactiveSettings, opts?: { silent?: boolean }): Promise<void> {
    setSettings(next);
    setSaving(true);
    try {
      const saved = await nuwa.proactive.setSettings(next);
      setSettings(saved);
      setStatus(await nuwa.proactive.getStatus());
      if (!opts?.silent) {
        showToast({ kind: "success", text: t("desktop.toastSaved") });
      }
    } finally {
      setSaving(false);
    }
  }

  function translateTriggerReason(reason: string | undefined): string {
    if (!reason) return t("common.unknownError");
    const key = TRIGGER_REASON_KEYS[reason];
    return key ? t(key) : reason;
  }

  function screenAwarenessLabel(value: ProactiveSettings["screenAwareness"]): string {
    if (value === "signals") return t("desktop.screenLabelSignals");
    if (value === "screenshots") return t("desktop.screenLabelScreenshots");
    return t("desktop.screenLabelOff");
  }

  const timeLocale = locale === "zh" ? "zh-CN" : "en-US";

  const previewSize = useMemo(() => {
    const scale = settings.petDisplayScale ?? 1;
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

  const scalePercent = Math.round((settings.petDisplayScale ?? 1) * 100);

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <div className="eyebrow">{t("desktop.eyebrow")}</div>
        <h1 className="display display--page" style={{ margin: "6px 0 8px" }}>
          {t("desktop.title")}
        </h1>
        <p className="body-md" style={{ maxWidth: 620 }}>
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
              <span className="body-sm" style={{ opacity: 0.55, textAlign: "center", padding: 8 }}>
                {t("desktop.petSizePreviewEmpty")}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
              {t("desktop.petSizeTitle")}
            </h2>
            <p className="body-sm" style={{ margin: "6px 0 14px" }}>
              {t("desktop.petSizeHint")}
            </p>
            <label className="stack" style={{ gap: 8 }}>
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
                <span className="body-sm" style={{ opacity: 0.6 }}>
                  {t("desktop.petSizePercent", { percent: Math.round(PET_DISPLAY_SCALE_MIN * 100) })}
                </span>
                <span className="body-sm" style={{ opacity: 0.6 }}>
                  {t("desktop.petSizePercent", { percent: Math.round(PET_DISPLAY_SCALE_MAX * 100) })}
                </span>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
              {t("desktop.proactiveTitle")}
            </h2>
            <p className="body-sm" style={{ margin: "6px 0 0" }}>
              {t("desktop.proactiveHint")}
            </p>
          </div>
          <label className="row gap-2" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                void save({
                  ...settings,
                  enabled: e.currentTarget.checked,
                  intensity: e.currentTarget.checked ? "light" : "off"
                })
              }
            />
            <span>{settings.enabled ? t("desktop.toggleOn") : t("desktop.toggleOff")}</span>
          </label>
        </div>

        <div className="grid-2" style={{ marginTop: 18 }}>
          <Field label={t("desktop.intensityLabel")}>
            <BlSelect
              value={settings.intensity}
              onChange={(intensity) =>
                void save({
                  ...settings,
                  intensity,
                  enabled: intensity !== "off"
                })
              }
              options={[
                { value: "off", label: t("desktop.intensityOff") },
                { value: "light", label: t("desktop.intensityLight") },
                { value: "standard", label: t("desktop.intensityStandard") }
              ]}
            />
          </Field>
          <Field label={t("desktop.maxPerHourLabel")}>
            <BlSelect
              value={String(settings.maxPerHour)}
              onChange={(raw) =>
                void save({
                  ...settings,
                  maxPerHour: Number(raw) as ProactiveSettings["maxPerHour"]
                })
              }
              options={MAX_PER_HOUR.map((n) => ({
                value: String(n),
                label: t("desktop.timesPerHour", { count: n })
              }))}
            />
          </Field>
          <Field label={t("desktop.defaultHushLabel")}>
            <BlSelect
              value={String(settings.defaultHushMinutes)}
              onChange={(raw) =>
                void save({
                  ...settings,
                  defaultHushMinutes: Number(raw) as ProactiveSettings["defaultHushMinutes"]
                })
              }
              options={HUSH_MINUTES.map((n) => ({
                value: String(n),
                label: t("desktop.minutes", { count: n })
              }))}
            />
          </Field>
          <Field label={t("desktop.screenAwarenessLabel")}>
            <BlSelect
              value={settings.screenAwareness}
              onChange={(screenAwareness) =>
                void save({
                  ...settings,
                  screenAwareness
                })
              }
              options={[
                { value: "off", label: t("desktop.screenOptionOff") },
                { value: "signals", label: t("desktop.screenOptionSignals") },
                { value: "screenshots", label: t("desktop.screenOptionScreenshots") }
              ]}
            />
          </Field>
        </div>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
          {t("desktop.quietHoursTitle")}
        </h2>
        <div className="row gap-2" style={{ marginTop: 12 }}>
          <label className="row gap-2">
            <input
              type="checkbox"
              checked={settings.quietHoursEnabled}
              onChange={(e) =>
                void save({ ...settings, quietHoursEnabled: e.currentTarget.checked })
              }
            />
            <span>{t("desktop.quietHoursEnable")}</span>
          </label>
          <input
            className="input"
            type="time"
            value={settings.quietHoursStart}
            onChange={(e) => void save({ ...settings, quietHoursStart: e.currentTarget.value })}
            style={{ maxWidth: 140 }}
          />
          <span className="body-sm">{t("desktop.quietHoursTo")}</span>
          <input
            className="input"
            type="time"
            value={settings.quietHoursEnd}
            onChange={(e) => void save({ ...settings, quietHoursEnd: e.currentTarget.value })}
            style={{ maxWidth: 140 }}
          />
        </div>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
          {t("desktop.statusTitle")}
        </h2>
        <div className="body-md" style={{ marginTop: 10 }}>
          {status?.hushUntil && status.hushUntil > Date.now()
            ? t("desktop.statusHushedUntil", {
                time: new Date(status.hushUntil).toLocaleTimeString(timeLocale)
              })
            : t("desktop.statusNoHush")}
          <br />
          {t("desktop.statusUtterances", { count: status?.utterancesThisHour ?? 0 })}
          <br />
          {t("desktop.statusScreenAwareness", {
            label: screenAwarenessLabel(settings.screenAwareness)
          })}
        </div>
        <div className="row gap-2" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void nuwa.pet.hush(settings.defaultHushMinutes * 60 * 1000)}
          >
            {t("desktop.hushButton", { minutes: settings.defaultHushMinutes })}
          </button>
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
              setStatus(await nuwa.proactive.getStatus());
            }}
          >
            {t("desktop.triggerButton")}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span className="body-sm">{label}</span>
      {children}
    </label>
  );
}
