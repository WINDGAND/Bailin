import { useState } from "react";
import { STARTER_BUNDLES } from "@nuwa-pet/starter-library";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { useNuwa } from "../../shared/use-nuwa.js";
import { PetRenderer } from "../../shared/pet-renderer.js";
import { Spinner, StatusDot, useToast } from "../../shared/feedback.js";
import {
  DEFAULT_BUNDLE_ID,
  getRecommendedBundle
} from "../provider/presets.js";
import {
  applyOhMyGptBundle,
  IDLE_READINESS,
  type ReadinessMap
} from "../provider/apply-recommended-bundle.js";
import { ProviderGuideSection } from "../provider/ProviderGuideSection.js";
import { QuickStartSection } from "../provider/QuickStartSection.js";
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
            <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
              {t("setup.back")}
            </button>
          ) : null}
        </div>
        <button type="button" className="btn btn--magenta" onClick={onNext}>
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
  const [selectedBundleId] = useState(DEFAULT_BUNDLE_ID);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oneClickProgress, setOneClickProgress] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessMap>(IDLE_READINESS);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; latency?: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const selectedBundle = getRecommendedBundle(selectedBundleId)!;

  async function connect(): Promise<void> {
    if (!apiKey.trim()) return;
    setBusy(true);
    setStatus({ kind: "running" });
    setReadiness(IDLE_READINESS);

    const result = await applyOhMyGptBundle(
      nuwa,
      selectedBundle,
      apiKey.trim(),
      (key, state) => {
        if (state.status === "running" && key === "chat") {
          setOneClickProgress(t("provider.oneClickProgressChat"));
        }
        setReadiness((prev) => ({ ...prev, [key]: state }));
      }
    );
    setBusy(false);
    setOneClickProgress(null);

    if (!result.saveOk) {
      setStatus({ kind: "error", message: result.saveError ?? t("provider.toastSaveFailed") });
      return;
    }
    const chat = result.readiness.chat;
    if (chat.status !== "ok") {
      setStatus({
        kind: "error",
        message: chat.status === "fail" ? chat.reason : t("setup.testFailed")
      });
      return;
    }
    setStatus({ kind: "ok", latency: chat.latencyMs });
    showToast({
      kind: "success",
      text: t("provider.toastChatReady", { latency: chat.latencyMs ?? "?" })
    });
    setTimeout(onNext, 500);
  }

  return (
    <div
      className="card fade-in-up"
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="display display--section" style={{ marginBottom: 8 }}>
        {t("setup.stepProvider")}
      </div>

      <ProviderGuideSection compact />

      <QuickStartSection
        compact
        selectedBundle={selectedBundle}
        apiKey={apiKey}
        showKey={showKey}
        busy={busy}
        oneClickProgress={oneClickProgress}
        readiness={readiness}
        onApiKeyChange={setApiKey}
        onToggleShowKey={() => setShowKey((v) => !v)}
        onConnect={() => void connect()}
        onClear={() => {}}
      />

      {status.kind !== "idle" ? (
        <div className="row gap-2" style={{ minHeight: 22, marginTop: 8 }}>
          {status.kind === "running" ? (
            <>
              <Spinner magenta />
              <span className="body-sm">{t("provider.oneClickRunning")}</span>
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

      <div className="row row--between gap-2" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
          {t("setup.back")}
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
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
          {t("setup.back")}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => void onDone()}>
          {t("setup.starterSkip")}
        </button>
      </div>
    </div>
  );
}
