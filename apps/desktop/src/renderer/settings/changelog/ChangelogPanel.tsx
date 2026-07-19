import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReleaseSummary } from "../../../shared/ipc-contract.js";
import { isNewerVersion } from "../../../shared/version-compare.js";
import { useBailin } from "../../shared/use-bailin.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import { ChatMarkdown } from "../../shared/chat-markdown.js";
import { useUpdateInfo } from "../app/update-context.js";
import { groupReleasesByDay } from "./group-releases.js";
import { stripLeadingDuplicateTitle } from "./strip-leading-duplicate-title.js";

type LoadState = "loading" | "error" | "ready";

function formatVersionChip(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "";
  return /^v/i.test(trimmed) ? trimmed : `v${trimmed}`;
}

/**
 * 侧栏「更新日志」页：按日分组的 Release 时间线。
 *
 * 「忽略此版本」只出现在同时满足两个条件的那一条上——比当前版本新、且正是
 * updateInfo.latestVersion（后台/手动检查记下来的那次结果）——其它历史条目
 * 只给一个「查看 Release」外链，不重复放忽略按钮。
 */
export function ChangelogPanel(): JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const bailin = useBailin();
  const { currentVersion, updateInfo, dismiss, syncFromServer } = useUpdateInfo();
  const [state, setState] = useState<LoadState>("loading");
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [error, setError] = useState("");
  const [staleReason, setStaleReason] = useState("");

  const load = useCallback(
    async (forceRefresh = false) => {
      setState("loading");
      setError("");
      setStaleReason("");
      try {
        const result = await bailin.app.listReleases({ forceRefresh });
        if (result.ok) {
          setReleases(result.releases);
          setStaleReason(result.staleReason?.trim() ?? "");
          setState("ready");
        } else {
          setError(result.error);
          setState("error");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    },
    [bailin]
  );

  // 打开本页时强制刷新：否则 6 小时磁盘缓存会挡住刚发布的 Release，
  // 用户看不到新版本条目；同时静默同步更新检查，点亮侧栏/高亮 CTA。
  useEffect(() => {
    void load(true);
    void syncFromServer();
  }, [load, syncFromServer]);

  const dayGroups = useMemo(() => groupReleasesByDay(releases, locale), [releases, locale]);

  let itemIndex = -1;

  return (
    <div className="changelog">
      <header className="changelog__header">
        <div className="eyebrow">{t("update.changelogEyebrow")}</div>
        <div className="display display--page">{t("update.changelogTitle")}</div>
        <p className="apple-page-subtitle">{t("update.changelogSubtitle")}</p>
      </header>

      {state === "ready" && staleReason ? (
        <div className="changelog__stale" role="status">
          <span>
            {t("update.changelogStale", { reason: staleReason })}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load(true)}>
            {t("update.changelogRetry")}
          </button>
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="changelog__state" role="status" aria-live="polite">
          <span className="spinner spinner--magenta" aria-hidden="true" />
          <span>{t("update.changelogLoading")}</span>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="changelog__state changelog__state--error" role="alert">
          <span>{t("update.changelogError")}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load(true)}>
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
            <section key={day.dayKey} className="changelog-day">
              <div className="changelog-day__heading">
                <span className="changelog-day__title">{day.dayTitle}</span>
                <span className="changelog-day__weekday">{day.dayWeekday}</span>
                <span className="changelog-day__rule" aria-hidden="true" />
              </div>
              <div className="changelog-day__entries">
                {day.items.map((item) => {
                  itemIndex += 1;
                  const isHighlighted =
                    isNewerVersion(item.version, currentVersion) &&
                    updateInfo?.latestVersion === item.version;
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
            </section>
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
  const notes = stripLeadingDuplicateTitle(item.notesMarkdown, item.title);
  const versionChip = formatVersionChip(item.version);

  return (
    <article
      className={`changelog-item fade-in-up${isHighlighted ? " changelog-item--new" : ""}`}
      style={{ animationDelay: `${Math.min(delayIndex, 10) * 45}ms` }}
    >
      <div className="changelog-item__meta">
        <span className="changelog-item__time">{item.timeLabel}</span>
        <span className="changelog-item__status">
          <i className="changelog-item__dot" aria-hidden="true" />
          {t("update.changelogStatusUpdate")}
        </span>
      </div>
      <div className="changelog-item__rail" aria-hidden="true">
        <span className="changelog-item__node" />
      </div>
      <div className="changelog-item__body">
        <div className="changelog-item__heading">
          <div className="changelog-item__title" translate="no">
            {item.title}
          </div>
          {versionChip ? (
            <span className="changelog-item__version" translate="no">
              {versionChip}
            </span>
          ) : null}
          {isHighlighted ? <span className="changelog-item__new-dot" aria-hidden="true" /> : null}
        </div>
        {notes.trim() ? (
          <div className="changelog-item__notes">
            <ChatMarkdown text={notes} />
          </div>
        ) : null}
        <div className="row gap-2 changelog-item__actions">
          {isHighlighted ? (
            <button type="button" className="btn btn--magenta btn--sm" onClick={onView}>
              {t("update.viewRelease")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--sm changelog-item__cta"
              onClick={onView}
            >
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
    </article>
  );
}
