import { useState } from "react";
import { useBailin } from "../../shared/use-bailin.js";
import { useT } from "../../shared/i18n/index.js";
import { useUpdateInfo } from "./update-context.js";

const NOTES_PREVIEW_LENGTH = 160;

/**
 * 新版本提醒横幅——视觉上跟着 DistillationJobBanner 的既有约定走：
 * 用基础 `.card` 类（只有 border-top 的极简卡片）+ 内联样式给一条彩色顶边，
 * 不新增专门的 CSS 组件类。因为这里内容比其它横幅多一层"更新说明"，
 * 用 flex column 撑开，而不是那些单行横幅的 flex row。
 */
export function UpdateBanner(): JSX.Element | null {
  const t = useT();
  const bailin = useBailin();
  const { updateInfo, dismiss } = useUpdateInfo();
  const [expanded, setExpanded] = useState(false);

  if (!updateInfo || !updateInfo.hasUpdate) return null;

  const notes = updateInfo.releaseNotes?.trim() ?? "";
  const isLong = notes.length > NOTES_PREVIEW_LENGTH;
  const displayedNotes = expanded || !isLong ? notes : `${notes.slice(0, NOTES_PREVIEW_LENGTH)}…`;

  return (
    <div
      className="card fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        marginBottom: 16,
        borderColor: "var(--magenta-soft)"
      }}
    >
      <div className="display display--section" style={{ fontSize: 15 }}>
        {t("update.bannerTitle", { version: updateInfo.latestVersion ?? "" })}
      </div>
      {notes ? (
        <div>
          <p
            className="body-sm"
            style={{ margin: 0, color: "var(--ink-soft)", whiteSpace: "pre-wrap" }}
          >
            {displayedNotes}
          </p>
          {isLong ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 6, padding: "2px 8px" }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t("update.hideChangelog") : t("update.viewChangelog")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="row gap-2">
        <button
          type="button"
          className="btn btn--magenta"
          onClick={() => {
            if (updateInfo.releaseUrl) void bailin.app.openExternal(updateInfo.releaseUrl);
          }}
        >
          {t("update.viewRelease")}
        </button>
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          {t("update.dismiss")}
        </button>
      </div>
    </div>
  );
}
