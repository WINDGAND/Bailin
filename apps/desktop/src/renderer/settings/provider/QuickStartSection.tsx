import type { RecommendedBundle } from "./presets.js";
import type { ReadinessMap } from "./apply-recommended-bundle.js";
import { FieldLabel } from "../../shared/FieldHelp.js";
import { ReadinessChecklist } from "./ReadinessChecklist.js";
import { useBailin } from "../../shared/use-bailin.js";
import { useT } from "../../shared/i18n/index.js";
import { OhMyGptDisclaimer } from "./OhMyGptDisclaimer.js";

const FAQ_LINKS: Record<RecommendedBundle["faqId"], { href: string; site: string }> = {
  ohmygpt: { href: "https://www.ohmygpt.com/", site: "OhMyGPT" },
  openai: { href: "https://platform.openai.com", site: "OpenAI" },
  deepseek: { href: "https://platform.deepseek.com", site: "DeepSeek" }
};

const STEP_KEYS = ["step1", "step2", "step3", "step4"] as const;

interface QuickStartSectionProps {
  selectedBundle: RecommendedBundle;
  apiKey: string;
  showKey: boolean;
  busy: boolean;
  oneClickProgress: string | null;
  readiness: ReadinessMap;
  onApiKeyChange(value: string): void;
  onToggleShowKey(): void;
  onConnect(): void;
  onClear(): void;
  compact?: boolean;
}

export function QuickStartSection({
  selectedBundle,
  apiKey,
  showKey,
  busy,
  oneClickProgress,
  readiness,
  onApiKeyChange,
  onToggleShowKey,
  onConnect,
  onClear,
  compact = false
}: QuickStartSectionProps): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const isAuthor = selectedBundle.id === "ohmygpt";
  const faqId = selectedBundle.faqId;
  const link = FAQ_LINKS[faqId];
  const bundleLabel = t(`provider.bundles.${selectedBundle.id}.label`);

  return (
    <section className="forge-section provider-connect-section">
      <div className="forge-section__head">
        <span className="bl-field-label">
          {isAuthor
            ? t("provider.quickStart.title")
            : t("provider.quickStart.titleAlt", { bundle: bundleLabel })}
        </span>
        <span className="forge-section__lede">
          {isAuthor ? t("provider.quickStart.subtitle") : t("provider.quickStart.subtitleAlt")}
        </span>
      </div>

      <div
        className={
          compact
            ? "provider-connect__surface provider-connect__surface--compact"
            : "provider-connect__surface"
        }
      >
        <div className={compact ? "provider-connect provider-connect--compact" : "provider-connect"}>
          <div className="provider-connect__steps">
            <div className="provider-connect__steps-label">{t("provider.quickStart.stepsTitle")}</div>
            <ol className="provider-step-rail" aria-label={t("provider.quickStart.stepsTitle")}>
              {STEP_KEYS.map((key, index) => (
                <li className="provider-step-rail__item" key={key}>
                  <span className="provider-step-rail__node" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="provider-step-rail__text">
                    {t(`provider.faqSteps.${faqId}.${key}`)}
                  </span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="provider-link-btn"
              onClick={() => void bailin.app.openExternal(link.href)}
            >
              {isAuthor
                ? t("provider.quickStart.openSite")
                : t("provider.quickStart.openSiteAlt", { site: link.site })}
            </button>
          </div>

          <div className="provider-connect__action">
            {isAuthor ? (
              <div className="provider-connect__brand">
                <span className="display display--section provider-connect__brand-name">OhMyGPT</span>
                <span className="provider-connect__tagline">
                  {t("provider.bundles.ohmygpt.tagline")}
                </span>
                {compact ? <OhMyGptDisclaimer /> : null}
              </div>
            ) : (
              <div className="provider-connect__brand">
                <span className="display display--section provider-connect__brand-name">
                  {bundleLabel}
                </span>
              </div>
            )}

            <div className="provider-connect__key-block">
              <FieldLabel htmlFor="provider-key" help={t("provider.help.apiKey")}>
                {t("provider.apiKeyLabel")}
              </FieldLabel>
              <div className="input-group provider-connect__key-input">
                <input
                  id="provider-key"
                  className="input input--provider-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="input-group__suffix">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={onToggleShowKey}
                    aria-label={showKey ? t("provider.hideKeyAria") : t("provider.showKeyAria")}
                  >
                    {showKey ? t("provider.hideKey") : t("provider.showKey")}
                  </button>
                </div>
              </div>
              <p className="bl-field-hint provider-connect__key-hint">{t("provider.apiKeyHint")}</p>
            </div>

            <div className="provider-connect__cta-row">
              {!compact ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={onClear}
                  disabled={busy || !apiKey}
                >
                  {t("provider.clearConfig")}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="btn btn--magenta provider-connect__cta"
                onClick={onConnect}
                disabled={busy || !apiKey.trim()}
                data-hint={!apiKey ? t("provider.fillKeyFirst") : ""}
              >
                {busy ? t("provider.oneClickRunning") : t("provider.verifyKeyAndChat")}
              </button>
            </div>

            {oneClickProgress ? <p className="bl-one-click-progress">{oneClickProgress}</p> : null}

            {!compact && Object.values(readiness).some((s) => s.status !== "idle") ? (
              <ReadinessChecklist
                readiness={readiness}
                rows={["chat"]}
                titleKey="provider.readinessTitleQuick"
                helpKey="provider.help.readinessQuick"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
