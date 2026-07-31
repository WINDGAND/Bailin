import { useEffect, useState } from "react";
import {
  SINGLE_KEY_EXAMPLE_STACK,
  MODEL_ROLE_IDS,
  type ModelRoleId
} from "./presets.js";
import { useT } from "../../shared/i18n/index.js";
import { CloudEndpointHint } from "./CloudEndpointHint.js";

const ROLE_I18N: Record<ModelRoleId, string> = {
  chat: "chat",
  vision: "vision",
  webSearch: "web",
  imageGen: "image"
};

const ROLE_INDEX: Record<ModelRoleId, string> = {
  chat: "01",
  vision: "02",
  webSearch: "03",
  imageGen: "04"
};

interface ProviderGuideSectionProps {
  compact?: boolean;
}

export function ProviderGuideSection({ compact = false }: ProviderGuideSectionProps): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!compact) setOpen(true);
  }, [compact]);

  return (
    <section className="forge-section">
      <details
        className="forge-disclosure"
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary>{t("provider.guide.title")}</summary>

        <div className="provider-guide-body">
          <div>
            <div className="bl-field-label" style={{ marginBottom: 10 }}>
              {t("provider.guide.modelRolesTitle")}
            </div>
            <div className="provider-role-spectrum">
              {MODEL_ROLE_IDS.map((role) => {
                const key = ROLE_I18N[role];
                return (
                  <div
                    className={`provider-role-spectrum__item provider-role-spectrum__item--${role}`}
                    key={role}
                  >
                    <span className="provider-role-spectrum__index">{ROLE_INDEX[role]}</span>
                    <div className="provider-role-spectrum__copy">
                      <div className="provider-role-spectrum__label">
                        {t(`provider.guide.modelRoles.${key}.label`)}
                      </div>
                      <div className="provider-role-spectrum__when">
                        {t(`provider.guide.modelRoles.${key}.when`)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!compact ? (
            <>
              <div>
                <div className="bl-field-label" style={{ marginBottom: 6 }}>
                  {t("provider.guide.singleKeyExample.title")}
                </div>
                <p className="bl-field-hint" style={{ margin: "0 0 12px" }}>
                  {t("provider.guide.singleKeyExample.intro")}
                </p>
                <dl className="provider-spec-rail">
                  <div className="provider-spec-rail__row">
                    <dt>{t("provider.guide.singleKeyExampleRows.relay")}</dt>
                    <dd>
                      {SINGLE_KEY_EXAMPLE_STACK.relay.label}
                      <code className="provider-spec-rail__mono">
                        {SINGLE_KEY_EXAMPLE_STACK.relay.baseUrl}
                      </code>
                    </dd>
                  </div>
                  <div className="provider-spec-rail__row">
                    <dt>{t("provider.guide.singleKeyExampleRows.chat")}</dt>
                    <dd>
                      <code className="provider-spec-rail__mono">
                        {SINGLE_KEY_EXAMPLE_STACK.chat.model}
                      </code>
                    </dd>
                  </div>
                  <div className="provider-spec-rail__row">
                    <dt>{t("provider.guide.singleKeyExampleRows.vision")}</dt>
                    <dd>
                      <code className="provider-spec-rail__mono">
                        {SINGLE_KEY_EXAMPLE_STACK.vision.model}
                      </code>
                    </dd>
                  </div>
                  <div className="provider-spec-rail__row">
                    <dt>{t("provider.guide.singleKeyExampleRows.webSearch")}</dt>
                    <dd>
                      <code className="provider-spec-rail__mono">
                        {SINGLE_KEY_EXAMPLE_STACK.webSearch.model}
                      </code>
                    </dd>
                  </div>
                  <div className="provider-spec-rail__row">
                    <dt>{t("provider.guide.singleKeyExampleRows.imageGen")}</dt>
                    <dd>
                      <code className="provider-spec-rail__mono">
                        {SINGLE_KEY_EXAMPLE_STACK.imageGen.model}
                      </code>
                      <span className="provider-spec-rail__tier">
                        ({SINGLE_KEY_EXAMPLE_STACK.imageGen.tier})
                      </span>
                    </dd>
                  </div>
                </dl>
                <CloudEndpointHint />
              </div>

              <p className="bl-field-hint" style={{ margin: 0 }}>
                {t("provider.guide.otherRelays")}
              </p>
            </>
          ) : null}
        </div>
      </details>
    </section>
  );
}
