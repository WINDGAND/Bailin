import { useState } from "react";
import { useBailin } from "../../shared/use-bailin.js";
import { useT } from "../../shared/i18n/index.js";
import { ChatMarkdown } from "../../shared/chat-markdown.js";
import { useUpdateInfo } from "./update-context.js";

const NOTES_PREVIEW_LENGTH = 220;

function UpdateArrowIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 向上的箭头 + 底线：升级 / 有新版本可用 */}
      <path d="M12 16V6" />
      <path d="M7 11l5-5 5 5" />
      <path d="M5 19h14" />
    </svg>
  );
}

/**
 * 新版本提醒横幅。
 *
 * 之前这里是照抄 DistillationJobBanner 那种"细边框+纯文字"的极简横幅，
 * 更新说明还是原始 Markdown 文本直接糊上去（"## " "- " 这些语法符号会
 * 原样露出来），跟应用其它页面的视觉质感明显脱节。这版改成：
 *   - 用图标锚点 + eyebrow/display 排版层级，跟设置页其它区块的调性一致
 *   - 更新说明复用聊天消息已有的 ChatMarkdown 轻量渲染（标题/列表/粗体），
 *     不再露出裸露的 Markdown 符号
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
    <div className="update-announce fade-in">
      <div className="update-announce__icon">
        <UpdateArrowIcon />
      </div>
      <div className="update-announce__body">
        <div className="eyebrow update-announce__eyebrow">{t("update.eyebrow")}</div>
        <div className="display display--section update-announce__title">
          {t("update.bannerTitle", { version: updateInfo.latestVersion ?? "" })}
        </div>
        {notes ? (
          <div className="update-announce__notes">
            <ChatMarkdown text={displayedNotes} />
            {isLong ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm update-announce__toggle"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? t("update.hideChangelog") : t("update.viewChangelog")}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="row gap-2 update-announce__actions">
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
    </div>
  );
}
