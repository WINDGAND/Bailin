import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useBailin } from "../../shared/use-bailin.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";

/**
 * 角色库「视觉重做」任务的 React Context。
 *
 * 把精灵图重生与外貌重生从页面组件里抽出来：每个 `characterId` 同时只跑一条任务，
 * 状态挂在不随设置 tab 卸载的 Provider 上，横幅 / 角色卡读同一份快照。
 * 任务结束会 toast，并通知 `subscribeJobSettled` 的订阅者；进行中的任务不能 dismiss，
 * 以免 UI 丢进度但 IPC 仍在跑。
 */

/** 视觉任务种类：重生精灵图，或按新参考图重生外貌。 */
export type VisualJobKind = "sprite" | "appearance";
/** 任务生命周期：跑着 / 成功 / 失败。 */
export type VisualJobStatus = "running" | "success" | "error";

/**
 * 单个角色当前（或刚结束）的视觉任务快照。
 * `finishedAt` 只在终态写入，供 UI 决定何时允许关掉横幅。
 */
export interface VisualJob {
  characterId: string;
  characterName: string;
  kind: VisualJobKind;
  status: VisualJobStatus;
  error?: string;
  finishedAt?: number;
}

type JobSettledListener = (characterId: string, outcome: "success" | "error") => void;

interface VisualJobContextValue {
  jobsByCharacterId: Record<string, VisualJob>;
  runningJobs: VisualJob[];
  getJob: (characterId: string) => VisualJob | undefined;
  isBusy: (characterId: string) => boolean;
  /** 先确认再调 IPC 重生精灵图；同角色已在跑则直接返回。 */
  runSpriteRegeneration: (characterId: string, characterName: string) => Promise<void>;
  /** 先校验参考图大小并确认，再以 data URL 调 IPC 重生外貌。 */
  runAppearanceRegeneration: (
    characterId: string,
    characterName: string,
    file: File
  ) => Promise<void>;
  /** 清掉终态任务；`running` 时无操作。 */
  dismissJob: (characterId: string) => void;
  /** 注册任务结束回调；返回取消订阅函数。 */
  subscribeJobSettled: (listener: JobSettledListener) => () => void;
}

const VisualJobContext = createContext<VisualJobContextValue | null>(null);

function patchJob(
  prev: Record<string, VisualJob>,
  characterId: string,
  patch: VisualJob
): Record<string, VisualJob> {
  return { ...prev, [characterId]: patch };
}

/**
 * 提供视觉任务状态与启动入口。
 *
 * 副作用：弹确认框、经 preload 调主进程重生、toast、广播 settled。
 * 不改变角色数据本身——写入由主进程 IPC 完成。
 */
export function VisualJobProvider({ children }: { children: ReactNode }): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [jobsByCharacterId, setJobsByCharacterId] = useState<Record<string, VisualJob>>({});
  const settledListenersRef = useRef(new Set<JobSettledListener>());

  const notifySettled = useCallback((characterId: string, outcome: "success" | "error") => {
    for (const listener of settledListenersRef.current) {
      listener(characterId, outcome);
    }
  }, []);

  const subscribeJobSettled = useCallback((listener: JobSettledListener) => {
    settledListenersRef.current.add(listener);
    return () => {
      settledListenersRef.current.delete(listener);
    };
  }, []);

  const getJob = useCallback(
    (characterId: string) => jobsByCharacterId[characterId],
    [jobsByCharacterId]
  );

  const isBusy = useCallback(
    (characterId: string) => jobsByCharacterId[characterId]?.status === "running",
    [jobsByCharacterId]
  );

  const dismissJob = useCallback((characterId: string) => {
    setJobsByCharacterId((prev) => {
      const job = prev[characterId];
      // 进行中不能关：横幅一丢，用户会以为取消了，但主进程仍在生成。
      if (!job || job.status === "running") return prev;
      const next = { ...prev };
      delete next[characterId];
      return next;
    });
  }, []);

  const runSpriteRegeneration = useCallback(
    async (characterId: string, characterName: string) => {
      // 同一角色叠跑会打乱 jobsByCharacterId 的单一快照，直接忽略第二次点击。
      if (jobsByCharacterId[characterId]?.status === "running") return;
      const ok = await confirm({
        title: t("library.confirmSpriteTitle"),
        body: t("library.confirmSpriteBody"),
        confirmLabel: t("library.confirmSpriteConfirm"),
        cancelLabel: t("common.cancel")
      });
      if (!ok) return;

      setJobsByCharacterId((prev) =>
        patchJob(prev, characterId, {
          characterId,
          characterName,
          kind: "sprite",
          status: "running"
        })
      );

      try {
        const r = await bailin.characters.regenerateSprite(characterId);
        const warnTail =
          r.warnings && r.warnings.length > 0
            ? t("library.warningsSuffix", { count: r.warnings.length })
            : "";
        if (!r.ok) {
          const error = r.error ?? t("common.unknownError");
          setJobsByCharacterId((prev) =>
            patchJob(prev, characterId, {
              characterId,
              characterName,
              kind: "sprite",
              status: "error",
              error,
              finishedAt: Date.now()
            })
          );
          showToast({
            kind: "error",
            text: t("library.toastSpriteRegenerateFailed", { error })
          });
          notifySettled(characterId, "error");
        } else {
          setJobsByCharacterId((prev) =>
            patchJob(prev, characterId, {
              characterId,
              characterName,
              kind: "sprite",
              status: "success",
              finishedAt: Date.now()
            })
          );
          showToast({
            kind: "success",
            text: t("library.toastSpriteUpdated", { warnings: warnTail })
          });
          notifySettled(characterId, "success");
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : t("common.unknownError");
        setJobsByCharacterId((prev) =>
          patchJob(prev, characterId, {
            characterId,
            characterName,
            kind: "sprite",
            status: "error",
            error,
            finishedAt: Date.now()
          })
        );
        showToast({
          kind: "error",
          text: t("library.toastSpriteRegenerateFailed", { error })
        });
        notifySettled(characterId, "error");
      }
    },
    [jobsByCharacterId, confirm, t, bailin, showToast, notifySettled]
  );

  const runAppearanceRegeneration = useCallback(
    async (characterId: string, characterName: string, file: File) => {
      if (jobsByCharacterId[characterId]?.status === "running") return;
      // 与主进程参考图上限对齐：超过 4MB 只 toast，不弹确认、不读文件。
      if (file.size > 4 * 1024 * 1024) {
        showToast({
          kind: "warn",
          text: t("library.toastImageTooLarge", {
            size: (file.size / 1024 / 1024).toFixed(1)
          })
        });
        return;
      }
      const ok = await confirm({
        title: t("library.confirmNewRefTitle"),
        body: t("library.confirmNewRefBody"),
        confirmLabel: t("library.confirmNewRefConfirm"),
        cancelLabel: t("common.cancel")
      });
      if (!ok) return;

      setJobsByCharacterId((prev) =>
        patchJob(prev, characterId, {
          characterId,
          characterName,
          kind: "appearance",
          status: "running"
        })
      );

      try {
        const dataUri = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result ?? ""));
          reader.onerror = () => rej(reader.error ?? new Error("read failed"));
          reader.readAsDataURL(file);
        });
        const r = await bailin.characters.regenerateAppearance({
          characterId,
          referenceImages: [
            {
              url: dataUri,
              source: "user-upload",
              role: "primary",
              notes: file.name
            }
          ]
        });
        const warnTail =
          r.warnings && r.warnings.length > 0
            ? t("library.warningsSuffix", { count: r.warnings.length })
            : "";
        if (!r.ok) {
          const error = r.error ?? t("common.unknownError");
          setJobsByCharacterId((prev) =>
            patchJob(prev, characterId, {
              characterId,
              characterName,
              kind: "appearance",
              status: "error",
              error,
              finishedAt: Date.now()
            })
          );
          showToast({
            kind: "error",
            text: t("library.toastRegenerateFailed", { error })
          });
          notifySettled(characterId, "error");
        } else {
          setJobsByCharacterId((prev) =>
            patchJob(prev, characterId, {
              characterId,
              characterName,
              kind: "appearance",
              status: "success",
              finishedAt: Date.now()
            })
          );
          showToast({
            kind: "success",
            text: t("library.toastRegenerateSuccess", { warnings: warnTail })
          });
          notifySettled(characterId, "success");
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : t("common.unknownError");
        setJobsByCharacterId((prev) =>
          patchJob(prev, characterId, {
            characterId,
            characterName,
            kind: "appearance",
            status: "error",
            error,
            finishedAt: Date.now()
          })
        );
        showToast({
          kind: "error",
          text: t("library.toastRegenerateFailed", { error })
        });
        notifySettled(characterId, "error");
      }
    },
    [jobsByCharacterId, confirm, t, bailin, showToast, notifySettled]
  );

  const runningJobs = useMemo(
    () => Object.values(jobsByCharacterId).filter((j) => j.status === "running"),
    [jobsByCharacterId]
  );

  const value = useMemo(
    () => ({
      jobsByCharacterId,
      runningJobs,
      getJob,
      isBusy,
      runSpriteRegeneration,
      runAppearanceRegeneration,
      dismissJob,
      subscribeJobSettled
    }),
    [
      jobsByCharacterId,
      runningJobs,
      getJob,
      isBusy,
      runSpriteRegeneration,
      runAppearanceRegeneration,
      dismissJob,
      subscribeJobSettled
    ]
  );

  return <VisualJobContext.Provider value={value}>{children}</VisualJobContext.Provider>;
}

/**
 * 读取视觉任务 context。
 *
 * @returns Provider 注入的任务表与操作方法。
 * @throws 未包在 `VisualJobProvider` 内时抛错。
 */
export function useVisualJobs(): VisualJobContextValue {
  const ctx = useContext(VisualJobContext);
  if (!ctx) throw new Error("useVisualJobs must be used within VisualJobProvider");
  return ctx;
}
