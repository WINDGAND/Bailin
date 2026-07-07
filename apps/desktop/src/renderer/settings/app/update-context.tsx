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
  /** 横幅"忽略此版本"用：记住这个版本号，横幅消失。 */
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

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const result = await bailin.app.checkForUpdates();
      if (result.hasUpdate && !result.dismissed) {
        // 真的有一个用户还没处理过的新版本：弹横幅。
        setUpdateInfo(result);
      } else if (result.hasUpdate && result.dismissed) {
        // 有更新，但正是用户刚忽略的那个版本——不重新弹横幅（否则"忽略"
        // 功能形同虚设），但如实告诉用户确实有更新，而不是谎称已是最新。
        showToast({ kind: "info", text: t("update.bannerTitle", { version: result.latestVersion ?? "" }) });
      } else if (result.error) {
        showToast({ kind: "error", text: t("update.checkFailed") });
      } else {
        showToast({ kind: "success", text: t("update.upToDate") });
      }
    } catch {
      showToast({ kind: "error", text: t("update.checkFailed") });
    } finally {
      setChecking(false);
    }
  }, [bailin, showToast, t]);

  const dismiss = useCallback(() => {
    if (!updateInfo?.latestVersion) return;
    void bailin.app.dismissUpdate(updateInfo.latestVersion);
    setUpdateInfo(null);
  }, [bailin, updateInfo]);

  const value = useMemo<UpdateContextValue>(
    () => ({ currentVersion, updateInfo, checking, checkNow, dismiss }),
    [currentVersion, updateInfo, checking, checkNow, dismiss]
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdateInfo(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdateInfo must be used within UpdateProvider");
  return ctx;
}
