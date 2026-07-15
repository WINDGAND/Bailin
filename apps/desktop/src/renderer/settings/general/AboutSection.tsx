import { useT } from "../../shared/i18n/index.js";
import { useUpdateInfo } from "../app/update-context.js";

/**
 * "关于"小节：显示当前版本号（顺带修掉侧栏一直硬编码 0.0.1 的 bug），
 * 提供一个手动"检查更新"入口——不用等后台每 24 小时才检查一次。
 * 新版本详情不在这里展示，去侧栏"更新日志" tab 看（ChangelogPanel）。
 */
export function AboutSection(): JSX.Element {
  const t = useT();
  const { currentVersion, checking, checkNow } = useUpdateInfo();

  return (
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
  );
}
