import { RECOMMENDED_BUNDLES, type RecommendedBundle, type BundleFeature } from "./presets.js";
import { useT } from "../../shared/i18n/index.js";
import { FieldLabel } from "../../shared/FieldHelp.js";

const FEATURE_KEYS: BundleFeature[] = ["chat", "vision", "webSearch", "imageGen"];

const FEAT_I18N: Record<BundleFeature, string> = {
  chat: "featChat",
  vision: "featVision",
  webSearch: "featWeb",
  imageGen: "featImage"
};

interface BundleSelectProps {
  selectedId: string;
  onSelect(id: string): void;
}

export function BundleSelect({ selectedId, onSelect }: BundleSelectProps): JSX.Element {
  const t = useT();

  return (
    <div className="bl-bundle-grid">
      {RECOMMENDED_BUNDLES.map((bundle) => (
        <BundleCard
          key={bundle.id}
          bundle={bundle}
          selected={selectedId === bundle.id}
          onSelect={() => onSelect(bundle.id)}
          t={t}
        />
      ))}
    </div>
  );
}

function BundleCard({
  bundle,
  selected,
  onSelect,
  t
}: {
  bundle: RecommendedBundle;
  selected: boolean;
  onSelect(): void;
  t: (key: string) => string;
}): JSX.Element {
  const id = bundle.id;
  const prefix = `provider.bundles.${id}`;

  return (
    <button
      type="button"
      className={selected ? "bl-bundle-card is-active" : "bl-bundle-card"}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="bl-bundle-card__head">
        <span className="bl-bundle-card__title">{t(`${prefix}.label`)}</span>
        {bundle.recommended ? (
          <span className="bl-bundle-card__badge">{t("provider.recommendedBadge")}</span>
        ) : null}
      </div>
      <p className="bl-bundle-card__tagline">{t(`${prefix}.tagline`)}</p>
      <ul className="bl-bundle-card__features">
        {FEATURE_KEYS.map((feat) => {
          const enabled = bundle.capabilities[feat];
          return (
            <li
              key={feat}
              className={enabled ? "bl-bundle-card__feat is-on" : "bl-bundle-card__feat is-off"}
            >
              {enabled ? "✓" : "—"} {t(`${prefix}.${FEAT_I18N[feat]}`)}
            </li>
          );
        })}
      </ul>
    </button>
  );
}

interface ApiKeyFaqProps {
  faqId: RecommendedBundle["faqId"];
}

export function ApiKeyFaq({ faqId }: ApiKeyFaqProps): JSX.Element {
  const t = useT();
  const linkHref =
    faqId === "ohmygpt"
      ? "https://www.ohmygpt.com"
      : faqId === "openai"
        ? "https://platform.openai.com"
        : "https://platform.deepseek.com";
  const linkLabel =
    faqId === "ohmygpt"
      ? t("provider.faqLinkOhmygpt")
      : faqId === "openai"
        ? t("provider.faqLinkOpenai")
        : t("provider.faqLinkDeepseek");

  return (
    <details className="bl-provider-faq">
      <summary className="bl-provider-faq__summary">{t("provider.faqTitle")}</summary>
      <ol className="bl-provider-faq__steps">
        <li>{t(`provider.faqSteps.${faqId}.step1`)}</li>
        <li>{t(`provider.faqSteps.${faqId}.step2`)}</li>
        <li>{t(`provider.faqSteps.${faqId}.step3`)}</li>
        <li>{t(`provider.faqSteps.${faqId}.step4`)}</li>
      </ol>
      <a className="bl-provider-faq__link" href={linkHref} target="_blank" rel="noopener noreferrer">
        {linkLabel} →
      </a>
    </details>
  );
}

export function BundlesSectionLabel(): JSX.Element {
  const t = useT();
  return (
    <div className="bl-section-label">
      <FieldLabel help={t("provider.help.bundles")}>{t("provider.bundlesLabel")}</FieldLabel>
      <p className="bl-field-hint" style={{ marginTop: 4, marginBottom: 0 }}>
        {t("provider.bundlesHint")}
      </p>
    </div>
  );
}
