import { useT } from "../../shared/i18n/index.js";

/** 中性短提示：示例端点可替换，非品牌免责长文。 */
export function CloudEndpointHint(): JSX.Element {
  const t = useT();

  return (
    <p className="provider-cloud-endpoint-hint" role="note">
      {t("provider.guide.endpointHint")}
    </p>
  );
}
