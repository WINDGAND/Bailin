import { useT } from "../../shared/i18n/index.js";

export function OhMyGptDisclaimer(): JSX.Element {
  const t = useT();

  return (
    <p className="provider-ohmygpt-disclaimer" role="note">
      {t("provider.guide.ohmygptDisclaimer")}
    </p>
  );
}
