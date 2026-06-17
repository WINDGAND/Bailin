import { useState } from "react";
import { STARTER_BUNDLES } from "@nuwa-pet/starter-library";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { useNuwa } from "../../shared/use-nuwa.js";
import { PetRenderer } from "../../shared/pet-renderer.js";
import { Spinner, StatusDot, useToast } from "../../shared/feedback.js";
import { BlSelect } from "../../shared/BlSelect.js";
import { PROVIDER_PRESETS, type ProviderPreset } from "../provider/presets.js";
import { useT } from "../../shared/i18n/index.js";

interface SetupWizardProps {
  onDone(): void | Promise<void>;
}

type Step = "welcome" | "disclaimer" | "provider" | "starter";
const HAS_STARTERS = STARTER_BUNDLES.length > 0;
const STEP_ORDER: Step[] = HAS_STARTERS
  ? ["welcome", "disclaimer", "provider", "starter"]
  : ["welcome", "disclaimer", "provider"];

const STEP_KEYS: Record<Step, string> = {
  welcome: "setup.stepWelcome",
  disclaimer: "setup.stepDisclaimer",
  provider: "setup.stepProvider",
  starter: "setup.stepStarter"
};

export function SetupWizard({ onDone }: SetupWizardProps): JSX.Element {
  const t = useT();
  const [step, setStep] = useState<Step>("welcome");
  const stepIndex = STEP_ORDER.indexOf(step);
  const stepTitle = t(STEP_KEYS[step]);

  function next() {
    const i = STEP_ORDER.indexOf(step);
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]!);
  }
  function back() {
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) setStep(STEP_ORDER[i - 1]!);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        background: "var(--paper)"
      }}
    >
      <section
        style={{
          padding: "56px 56px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 22
        }}
      >
        <div className="eyebrow">{t("setup.eyebrow")}</div>
        <h1 className="display display--hero">
          {t("setup.heroLine1")}
          <br />
          {t("setup.heroLine2")}
        </h1>
        <p className="body-md" style={{ maxWidth: 420 }}>
          {HAS_STARTERS ? t("setup.introWithStarters") : t("setup.introWithoutStarters")}
        </p>
        <div className="row gap-1 body-sm">
          <span className="kbd">Ctrl</span>
          <span className="kbd">Shift</span>
          <span className="kbd">P</span>
          <span style={{ marginLeft: 6 }}>{t("setup.shortcutHint")}</span>
        </div>

        <div style={{ marginTop: "auto" }}>
          <div
            className="row row--between"
            style={{ marginBottom: 8, fontSize: 12, color: "var(--ink-faint)" }}
          >
            <span className="mono">
              {t("setup.stepCounter", { current: stepIndex + 1, total: STEP_ORDER.length })}
            </span>
            <span>{stepTitle}</span>
          </div>
          <div className="steps">
            {STEP_ORDER.map((s, i) => (
              <div
                key={s}
                className={`steps__dot ${
                  i < stepIndex
                    ? "steps__dot--done"
                    : i === stepIndex
                      ? "steps__dot--active"
                      : ""
                }`}
              />
            ))}
          </div>
        </div>
      </section>
      <section
        style={{
          padding: "56px 48px",
          background: "var(--paper-deep)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          borderLeft: "1px solid var(--grid-strong)"
        }}
      >
        {step === "welcome" ? (
          <SimpleStep
            title={t("setup.stepWelcome")}
            body={t("setup.welcomeBody")}
            cta={t("setup.welcomeCta")}
            onNext={next}
          />
        ) : null}
        {step === "disclaimer" ? (
          <SimpleStep
            title={t("setup.stepDisclaimer")}
            body={t("setup.disclaimerBody")}
            cta={t("setup.disclaimerCta")}
            onNext={next}
            onBack={back}
          />
        ) : null}
        {step === "provider" ? (
          <ProviderStep
            onNext={HAS_STARTERS ? next : () => void onDone()}
            onBack={back}
          />
        ) : null}
        {step === "starter" ? <StarterStep onDone={onDone} onBack={back} /> : null}
      </section>
    </div>
  );
}

function SimpleStep({
  title,
  body,
  cta,
  onNext,
  onBack
}: {
  title: string;
  body: string;
  cta: string;
  onNext: () => void;
  onBack?: () => void;
}) {
  const t = useT();
  return (
    <div className="card fade-in-up" style={{ padding: 26 }}>
      <div className="display display--section" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <p className="body-md" style={{ marginBottom: 6 }}>
        {body}
      </p>
      <div className="row row--between gap-2" style={{ marginTop: 22 }}>
        <div>
          {onBack ? (
            <button className="btn btn--ghost btn--sm" onClick={onBack}>
              {t("setup.back")}
            </button>
          ) : null}
        </div>
        <button className="btn btn--magenta" onClick={onNext}>
          {cta}
        </button>
      </div>
    </div>
  );
}

function ProviderStep({
  onNext,
  onBack
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const nuwa = useNuwa();
  const { showToast } = useToast();
  const [kind, setKind] = useState<"openai-compatible" | "anthropic-compatible">(
    "openai-compatible"
  );
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; latency?: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function applyPreset(p: ProviderPreset) {
    setKind(p.kind);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setStatus({ kind: "idle" });
  }

  async function save(): Promise<void> {
    setBusy(true);
    setStatus({ kind: "running" });
    const r = await nuwa.llm.setProvider({ kind, baseUrl, model, apiKey });
    if (!r.ok) {
      setBusy(false);
      setStatus({ kind: "error", message: r.error ?? t("provider.toastSaveFailed") });
      return;
    }
    const test = await nuwa.llm.testConnection();
    setBusy(false);
    if (!test.ok) {
      setStatus({ kind: "error", message: test.error ?? t("setup.testFailed") });
      return;
    }
    setStatus({ kind: "ok", latency: test.latencyMs });
    showToast({
      kind: "success",
      text: t("provider.toastConnectOk", { latency: test.latencyMs ?? "?" })
    });
    setTimeout(onNext, 500);
  }

  return (
    <div
      className="card fade-in-up"
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="display display--section">{t("setup.stepProvider")}</div>
      <p className="body-md" style={{ marginTop: -4 }}>
        {t("setup.providerIntro")}
      </p>

      <div>
        <label className="eyebrow">{t("provider.presetsLabel")}</label>
        <div className="row gap-2 row--wrap" style={{ marginTop: 6 }}>
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn btn--ghost btn--sm ${
                baseUrl === p.baseUrl && model === p.model ? "btn--magenta" : ""
              }`}
              onClick={() => applyPreset(p)}
              data-hint={t(`provider.presetNotes.${p.id}`)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="eyebrow">{t("provider.protocolLabel")}</label>
        <BlSelect
          value={kind}
          onChange={setKind}
          triggerClassName="select"
          options={[
            { value: "openai-compatible", label: t("setup.protocolOpenAILong") },
            { value: "anthropic-compatible", label: t("setup.protocolAnthropicLong") }
          ]}
        />
      </div>
      <div>
        <label className="eyebrow">{t("provider.baseUrlLabel")}</label>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div>
        <label className="eyebrow">{t("setup.modelLabel")}</label>
        <input
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>
      <div>
        <label className="eyebrow">{t("provider.apiKeyLabel")}</label>
        <div className="input-group">
          <input
            className="input"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
          />
          <div className="input-group__suffix">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowKey((v) => !v)}
              data-hint={showKey ? t("provider.hideKey") : t("provider.showKey")}
              aria-label={showKey ? t("provider.hideKeyAria") : t("provider.showKeyAria")}
            >
              {showKey ? t("provider.hideKey") : t("provider.showKey")}
            </button>
          </div>
        </div>
      </div>

      {status.kind !== "idle" ? (
        <div className="row gap-2" style={{ minHeight: 22 }}>
          {status.kind === "running" ? (
            <>
              <Spinner magenta />
              <span className="body-sm">{t("setup.pinging", { url: baseUrl })}</span>
            </>
          ) : null}
          {status.kind === "ok" ? (
            <StatusDot
              kind="ok"
              label={t("setup.statusOk", { latency: status.latency ?? "?" })}
            />
          ) : null}
          {status.kind === "error" ? (
            <StatusDot kind="error" label={status.message} />
          ) : null}
        </div>
      ) : null}

      <div className="row row--between gap-2" style={{ marginTop: 6 }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          {t("setup.back")}
        </button>
        <button
          className="btn btn--magenta"
          onClick={() => void save()}
          disabled={busy || !apiKey}
          data-hint={!apiKey ? t("provider.fillKeyFirst") : ""}
        >
          {busy ? t("setup.saveTesting") : t("setup.saveAndTest")}
        </button>
      </div>
    </div>
  );
}

function StarterStep({
  onDone,
  onBack
}: {
  onDone(): void | Promise<void>;
  onBack: () => void;
}) {
  const t = useT();
  const nuwa = useNuwa();
  const { showToast } = useToast();
  const [importing, setImporting] = useState<string | null>(null);

  async function pick(id: string) {
    setImporting(id);
    const r = await nuwa.characters.importStarter(id);
    if (r.ok) {
      showToast({ kind: "success", text: t("setup.toastCharacterReady") });
      await onDone();
    } else {
      showToast({
        kind: "error",
        text: r.error ?? t("setup.toastImportFailed")
      });
    }
    setImporting(null);
  }

  return (
    <div className="card fade-in-up" style={{ padding: 24 }}>
      <div className="display display--section" style={{ marginBottom: 4 }}>
        {t("setup.stepStarter")}
      </div>
      <p className="body-md">{t("setup.starterIntro")}</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 14
        }}
      >
        {STARTER_BUNDLES.map((bundle: CharacterBundle, i) => (
          <button
            key={bundle.card.id}
            className="card card--interactive fade-in-up"
            style={{
              textAlign: "left",
              padding: 12,
              cursor: "pointer",
              background: "var(--paper)",
              animationDelay: `${i * 50}ms`,
              display: "flex",
              gap: 12,
              alignItems: "center"
            }}
            onClick={() => void pick(bundle.card.id)}
            disabled={importing != null}
            aria-busy={importing === bundle.card.id}
          >
            <div
              style={{
                width: 48,
                height: 48,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <PetRenderer program={bundle.sprite} width={48} height={48} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row row--between gap-2" style={{ marginBottom: 4 }}>
                <span
                  className="display display--section"
                  style={{ fontSize: 14, lineHeight: 1.15 }}
                >
                  {bundle.card.meta.name.replace(/ · 视角助手| · 灵感陪伴/, "")}
                </span>
                <span className={`badge badge--${bundle.card.meta.track}`}>
                  {bundle.card.meta.track === "utility"
                    ? t("setup.trackUtilityShort")
                    : t("setup.trackCompanionShort")}
                </span>
              </div>
              <p
                className="body-sm"
                style={{
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical"
                }}
              >
                {bundle.card.meta.quoteOneLiner ?? bundle.card.identity.selfIntro}
              </p>
              {importing === bundle.card.id ? (
                <span className="body-sm" style={{ color: "var(--magenta)" }}>
                  {t("setup.starterImporting")}
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
      <div className="row row--between gap-2" style={{ marginTop: 16 }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          {t("setup.back")}
        </button>
        <button className="btn btn--ghost" onClick={() => void onDone()}>
          {t("setup.starterSkip")}
        </button>
      </div>
    </div>
  );
}
