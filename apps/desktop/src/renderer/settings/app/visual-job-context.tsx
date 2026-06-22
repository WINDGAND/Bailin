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

export type VisualJobKind = "sprite" | "appearance";
export type VisualJobStatus = "running" | "success" | "error";

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
  runSpriteRegeneration: (characterId: string, characterName: string) => Promise<void>;
  runAppearanceRegeneration: (
    characterId: string,
    characterName: string,
    file: File
  ) => Promise<void>;
  dismissJob: (characterId: string) => void;
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
      if (!job || job.status === "running") return prev;
      const next = { ...prev };
      delete next[characterId];
      return next;
    });
  }, []);

  const runSpriteRegeneration = useCallback(
    async (characterId: string, characterName: string) => {
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

export function useVisualJobs(): VisualJobContextValue {
  const ctx = useContext(VisualJobContext);
  if (!ctx) throw new Error("useVisualJobs must be used within VisualJobProvider");
  return ctx;
}
