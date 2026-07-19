import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { UpdateCheckResult } from "../../../shared/ipc-contract.js";
import { useBailin } from "../../shared/use-bailin.js";
import { useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";

interface UpdateContextValue {
  /** 当前应用版本号（来自 app.getVersion()，还没拿到时是空字符串）。 */
  currentVersion: string;
  /** 有新版本且未被用户忽略时非 null；用户忽略/查看后清空。 */
  updateInfo: UpdateCheckResult | null;
  checking: boolean;
  /** 设置页"检查更新"按钮用：总是给出真实结果 + toast 反馈，不受忽略状态影响。 */
  checkNow: () => Promise<void>;
  /**
   * 静默同步最新版本状态（无 toast）。供更新日志页打开时调用，
   * 避免列表已刷新但侧栏高亮仍停在旧检查结果。
   */
  syncFromServer: () => Promise<void>;
  /** 侧栏高亮 / Changelog 忽略此版本用：记住这个版本号，侧栏红点与 Changelog 高亮一并消失。 */
  dismiss: () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }): JSX.Element {
  const bailin = useBailin();
  const t = useT();
  const { showToast } = useToast();
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void bailin.app.getVersion().then(setCurrentVersion);
  }, [bailin]);

  useEffect(() => {
    return bailin.on.updateAvailable((result) => {
      if (result.hasUpdate) setUpdateInfo(result);
    });
  }, [bailin]);

  const applyCheckResult = useCallback((result: UpdateCheckResult) => {
    if (result.hasUpdate && !result.dismissed) {
      setUpdateInfo(result);
    } else if (!result.hasUpdate && !result.error) {
      setUpdateInfo(null);
    }
  }, []);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const result = await bailin.app.checkForUpdates();
      applyCheckResult(result);
      if (result.hasUpdate && result.dismissed) {
        // 有更新，但正是用户刚忽略的那个版本——不重新点亮提醒（否则"忽略"
        // 功能形同虚设），但如实告诉用户确实有更新，而不是谎称已是最新。
        showToast({ kind: "info", text: t("update.bannerTitle", { version: result.latestVersion ?? "" }) });
      } else if (result.error) {
        showToast({ kind: "error", text: t("update.checkFailed") });
      } else if (!result.hasUpdate) {
        showToast({ kind: "success", text: t("update.upToDate") });
      }
    } catch {
      showToast({ kind: "error", text: t("update.checkFailed") });
    } finally {
      setChecking(false);
    }
  }, [applyCheckResult, bailin, showToast, t]);

  const syncFromServer = useCallback(async () => {
    try {
      const result = await bailin.app.checkForUpdates();
      applyCheckResult(result);
    } catch {
      // 静默失败：不打扰用户，后台定时检查还会再试。
    }
  }, [applyCheckResult, bailin]);

  const dismiss = useCallback(() => {
    if (!updateInfo?.latestVersion) return;
    void bailin.app.dismissUpdate(updateInfo.latestVersion);
    setUpdateInfo(null);
  }, [bailin, updateInfo]);

  const value = useMemo<UpdateContextValue>(
    () => ({ currentVersion, updateInfo, checking, checkNow, syncFromServer, dismiss }),
    [currentVersion, updateInfo, checking, checkNow, syncFromServer, dismiss]
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdateInfo(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdateInfo must be used within UpdateProvider");
  return ctx;
}
