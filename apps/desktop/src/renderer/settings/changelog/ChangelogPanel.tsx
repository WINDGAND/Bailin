import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReleaseSummary } from "../../../shared/ipc-contract.js";
import { isNewerVersion } from "../../../shared/version-compare.js";
import { useBailin } from "../../shared/use-bailin.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import { ChatMarkdown } from "../../shared/chat-markdown.js";
import { useUpdateInfo } from "../app/update-context.js";
import { groupReleasesByDay } from "./group-releases.js";

type LoadState = "loading" | "error" | "ready";

/**
 * 侧栏「更新日志」页：按日分组的 Release 时间线。
 *
 * 「忽略此版本」只出现在同时满足两个条件的那一条上——比当前版本新、且正是
 * updateInfo.latestVersion（后台/手动检查记下来的那次结果）——其它历史条目
 * 只给一个「查看 Release」外链，不重复放忽略按钮（忽略语义是针对"最新一次
 * 检测到的新版本"，不是任意历史 Release）。
 */
export function ChangelogPanel(): JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const bailin = useBailin();
  const { currentVersion, updateInfo, dismiss } = useUpdateInfo();
  const [state, setState] = useState<LoadState>("loading");
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const result = await bailin.app.listReleases();
      if (result.ok) {
        setReleases(result.releases);
        setState("ready");
      } else {
        setError(result.error);
        setState("error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [bailin]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayGroups = useMemo(() => groupReleasesByDay(releases, locale), [releases, locale]);

  let itemIndex = -1;

  return (
    <div className="changelog">
      <div className="changelog__header">
        <div className="eyebrow changelog__eyebrow">{t("update.changelogEyebrow")}</div>
        <div className="display display--section changelog__title">{t("update.changelogTitle")}</div>
        <p className="body-md changelog__subtitle">{t("update.changelogSubtitle")}</p>
      </div>

      {state === "loading" ? (
        <div className="changelog__state" role="status" aria-live="polite">
          <span className="spinner spinner--magenta" aria-hidden="true" />
          <span>{t("update.changelogLoading")}</span>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="changelog__state changelog__state--error" role="alert">
          <span>{t("update.changelogError")}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
            {t("update.changelogRetry")}
          </button>
        </div>
      ) : null}

      {state === "ready" && dayGroups.length === 0 ? (
        <div className="changelog__state">
          <span>{t("update.changelogEmpty")}</span>
        </div>
      ) : null}

      {state === "ready" && dayGroups.length > 0 ? (
        <div className="changelog__timeline">
          {dayGroups.map((day) => (
            <div key={day.dayKey} className="changelog-day">
              <div className="changelog-day__heading">{day.dayLabel}</div>
              {day.items.map((item) => {
                itemIndex += 1;
                const isHighlighted =
                  isNewerVersion(item.version, currentVersion) && updateInfo?.latestVersion === item.version;
                return (
                  <ChangelogItemRow
                    key={item.tag}
                    item={item}
                    isHighlighted={isHighlighted}
                    delayIndex={itemIndex}
                    onView={() => void bailin.app.openExternal(item.url)}
                    onDismiss={dismiss}
                    t={t}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChangelogItemRow({
  item,
  isHighlighted,
  delayIndex,
  onView,
  onDismiss,
  t
}: {
  item: ReleaseSummary & { timeLabel: string };
  isHighlighted: boolean;
  delayIndex: number;
  onView: () => void;
  onDismiss: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}): JSX.Element {
  return (
    <div
      className="changelog-item fade-in-up"
      style={{ animationDelay: `${Math.min(delayIndex, 10) * 45}ms` }}
    >
      <div className="changelog-item__meta">
        <span className="changelog-item__time">{item.timeLabel}</span>
        {isHighlighted ? (
          <span className="changelog-item__status">
            <i className="changelog-item__dot" aria-hidden="true" />
            {t("update.changelogStatusUpdate")}
          </span>
        ) : null}
      </div>
      <div className="changelog-item__body">
        <div className="changelog-item__title">{item.title}</div>
        {item.notesMarkdown.trim() ? (
          <div className="changelog-item__notes">
            <ChatMarkdown text={item.notesMarkdown} />
          </div>
        ) : null}
        <div className="row gap-2 changelog-item__actions">
          {isHighlighted ? (
            <button type="button" className="btn btn--magenta btn--sm" onClick={onView}>
              {t("update.viewRelease")}
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onView}>
              {t("update.changelogViewRelease")}
            </button>
          )}
          {isHighlighted ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>
              {t("update.dismiss")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
