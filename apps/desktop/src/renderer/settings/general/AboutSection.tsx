import { useBailin } from "../../shared/use-bailin.js";
import { useT } from "../../shared/i18n/index.js";
import { useUpdateInfo } from "../app/update-context.js";

/**
 * "关于"小节：显示当前版本号（顺带修掉侧栏一直硬编码 0.0.1 的 bug），
 * 提供一个手动"检查更新"入口——不用等后台每 24 小时才检查一次。
 */
export function AboutSection(): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const { currentVersion, updateInfo, checking, checkNow } = useUpdateInfo();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row row--between" style={{ alignItems: "center" }}>
        <span className="body-sm" style={{ color: "var(--ink-soft)" }}>
          {t("update.currentVersionLabel")}
          {currentVersion ? ` v${currentVersion}` : ""}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={checking}
          onClick={() => void checkNow()}
        >
          {checking ? t("update.checking") : t("update.checkNow")}
        </button>
      </div>
      {updateInfo?.hasUpdate ? (
        <div
          className="card"
          style={{
            padding: "10px 12px",
            borderColor: "var(--magenta-soft)"
          }}
        >
          <p className="body-sm" style={{ margin: "0 0 8px", color: "var(--ink)" }}>
            {t("update.bannerTitle", { version: updateInfo.latestVersion ?? "" })}
          </p>
          <button
            type="button"
            className="btn btn--magenta btn--sm"
            onClick={() => {
              if (updateInfo.releaseUrl) void bailin.app.openExternal(updateInfo.releaseUrl);
            }}
          >
            {t("update.viewRelease")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
