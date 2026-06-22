import { useCallback, useEffect, useMemo, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import type {
  ImageGenerationConfigDTO,
  ImageTierConfigDTO,
  ImageTierName
} from "../../../shared/ipc-contract.js";
import { useDirtyTracker } from "../app/dirty-context.js";
import {
  EMPTY_IMAGE_CONFIG,
  DEFAULT_BUNDLE_ID,
  getRecommendedBundle,
  type RecommendedBundle
} from "./presets.js";
import {
  applyOhMyGptBundle,
  verifyCustomProvider,
  IDLE_READINESS,
  type ReadinessKey,
  type ReadinessMap
} from "./apply-recommended-bundle.js";
import { ProviderGuideSection } from "./ProviderGuideSection.js";
import { QuickStartSection } from "./QuickStartSection.js";
import { CustomConfigSection } from "./CustomConfigSection.js";
import {
  ProviderModeSwitch,
  readProviderMode,
  writeProviderMode,
  type ProviderMode
} from "./ProviderModeSwitch.js";
import { useT } from "../../shared/i18n/index.js";

type Kind = "openai-compatible" | "anthropic-compatible";

const OHMYGPT_BUNDLE = getRecommendedBundle(DEFAULT_BUNDLE_ID)!;

const DEFAULT_WEB_SEARCH_MODEL = "gpt-4o-mini-search-preview";

function applyBundleToForm(
  bundle: RecommendedBundle,
  setters: {
    setKind: (k: Kind) => void;
    setBaseUrl: (u: string) => void;
    setModel: (m: string) => void;
    setVisionModel: (v: string) => void;
    setWebSearchModel: (v: string) => void;
    setImageConfig: (c: ImageGenerationConfigDTO) => void;
  }
): void {
  setters.setKind(bundle.llm.kind);
  setters.setBaseUrl(bundle.llm.baseUrl);
  setters.setModel(bundle.llm.model);
  setters.setVisionModel(bundle.llm.visionModel);
  setters.setWebSearchModel(bundle.llm.webSearchModel);
  setters.setImageConfig({ ...bundle.image });
}

export function ApiKeyPanel(): JSX.Element {
  const t = useT();
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [mode, setMode] = useState<ProviderMode>(() => readProviderMode());
  const [kind, setKind] = useState<Kind>("openai-compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [webSearchModel, setWebSearchModel] = useState(DEFAULT_WEB_SEARCH_MODEL);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessMap>(IDLE_READINESS);
  const [baseline, setBaseline] = useState<{
    kind: Kind;
    baseUrl: string;
    model: string;
    visionModel: string;
    webSearchModel: string;
    hasKey: boolean;
  } | null>(null);

  const [imageConfig, setImageConfig] = useState<ImageGenerationConfigDTO>(EMPTY_IMAGE_CONFIG);
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState("");

  const bundleSetters = useMemo(
    () => ({ setKind, setBaseUrl, setModel, setVisionModel, setWebSearchModel, setImageConfig }),
    []
  );

  useEffect(() => {
    void (async () => {
      const p = (await nuwa.llm.getProvider()) as
        | {
            kind: string;
            baseUrl: string;
            model: string;
            visionModel?: string;
            webSearchModel?: string;
            apiKey: string;
          }
        | null;
      if (p) {
        const nextKind = p.kind as Kind;
        const nextVision = p.visionModel?.trim() ?? "";
        const nextWeb = p.webSearchModel?.trim() || DEFAULT_WEB_SEARCH_MODEL;
        setKind(nextKind);
        setBaseUrl(p.baseUrl);
        setModel(p.model);
        setVisionModel(nextVision);
        setWebSearchModel(nextWeb);
        setApiKey(p.apiKey);
        setBaseline({
          kind: nextKind,
          baseUrl: p.baseUrl,
          model: p.model,
          visionModel: nextVision,
          webSearchModel: nextWeb,
          hasKey: !!p.apiKey
        });
        try {
          const img = await nuwa.imageGen.getConfig();
          if (img) setImageConfig(img);
        } catch {
          // ignore
        }
      }
    })();
  }, [nuwa]);

  const dirty = useMemo(() => {
    if (!baseline) {
      return (
        apiKey.length > 0 ||
        baseUrl.length > 0 ||
        model.length > 0 ||
        visionModel.length > 0 ||
        webSearchModel.length > 0
      );
    }
    return (
      kind !== baseline.kind ||
      baseUrl.trim() !== baseline.baseUrl ||
      model.trim() !== baseline.model ||
      visionModel.trim() !== baseline.visionModel ||
      webSearchModel.trim() !== baseline.webSearchModel ||
      (apiKey.length > 0 && !baseline.hasKey) ||
      (apiKey === "" && baseline.hasKey)
    );
  }, [kind, baseUrl, model, visionModel, webSearchModel, apiKey, baseline]);

  useDirtyTracker(dirty);

  const ohmygptProgressLabels: Partial<Record<ReadinessKey, string>> = useMemo(
    () => ({
      chat: t("provider.oneClickProgressChat")
    }),
    [t]
  );

  const customProgressLabels: Record<ReadinessKey, string> = useMemo(
    () => ({
      chat: t("provider.oneClickProgressChat"),
      vision: t("provider.oneClickProgressVision"),
      webSearch: t("provider.oneClickProgressWeb"),
      imageGen: t("provider.oneClickProgressImage")
    }),
    [t]
  );

  async function handleModeChange(next: ProviderMode): Promise<void> {
    if (next === mode) return;
    if (dirty) {
      const ok = await confirm({
        title: t("common.discardTitle"),
        body: t("common.discardBody"),
        confirmLabel: t("common.discardConfirm"),
        cancelLabel: t("common.discardCancel"),
        danger: true
      });
      if (!ok) return;
    }
    writeProviderMode(next);
    setMode(next);
    setReadiness(IDLE_READINESS);
    setProgressLabel(null);
    if (next === "ohmygpt") {
      applyBundleToForm(OHMYGPT_BUNDLE, bundleSetters);
    }
  }

  async function oneClickConnect(): Promise<void> {
    if (!apiKey.trim()) return;
    applyBundleToForm(OHMYGPT_BUNDLE, bundleSetters);
    setBusy(true);
    setProgressLabel(t("provider.oneClickProgressSave"));
    setReadiness(IDLE_READINESS);

    try {
      const result = await applyOhMyGptBundle(
        nuwa,
        OHMYGPT_BUNDLE,
        apiKey.trim(),
        (key, state) => {
          if (state.status === "running" && ohmygptProgressLabels[key]) {
            setProgressLabel(ohmygptProgressLabels[key]!);
          }
          setReadiness((prev) => ({ ...prev, [key]: state }));
        }
      );

      if (!result.saveOk) {
        showToast({ kind: "error", text: result.saveError ?? t("provider.toastSaveFailed") });
        return;
      }

      const bundle = OHMYGPT_BUNDLE;
      setBaseline({
        kind: bundle.llm.kind,
        baseUrl: bundle.llm.baseUrl.trim(),
        model: bundle.llm.model.trim(),
        visionModel: bundle.llm.visionModel,
        webSearchModel: bundle.llm.webSearchModel,
        hasKey: !!apiKey
      });
      setImageConfig({ ...bundle.image });

      if (result.allRequiredPassed) {
        // allRequiredPassed=true 时 chat 必为 ok 状态；TS 无法跨返回值 narrow，显式取。
        const chat = result.readiness.chat;
        const latency = chat.status === "ok" ? chat.latencyMs : undefined;
        showToast({
          kind: "success",
          text: t("provider.toastChatReady", {
            latency: latency ?? "?"
          })
        });
      } else {
        const reason =
          result.readiness.chat.status === "fail" ? result.readiness.chat.reason : undefined;
        showToast({
          kind: "error",
          text: reason ?? t("provider.toastTestFailed", { error: t("provider.readinessFail") })
        });
      }
    } finally {
      setBusy(false);
      setProgressLabel(null);
    }
  }

  async function verifyCustom(): Promise<void> {
    if (!apiKey.trim()) return;
    setBusy(true);
    setProgressLabel(t("provider.oneClickProgressSave"));
    setReadiness(IDLE_READINESS);

    try {
      const result = await verifyCustomProvider(
        nuwa,
        {
          kind,
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          visionModel: visionModel.trim(),
          webSearchModel: webSearchModel.trim(),
          apiKey: apiKey.trim(),
          imageConfig,
          imageApiKey: imageConfig.useLLMProvider ? undefined : imageApiKeyDraft || undefined
        },
        (key, state) => {
          if (state.status === "running") setProgressLabel(customProgressLabels[key]);
          setReadiness((prev) => ({ ...prev, [key]: state }));
        }
      );

      if (!result.saveOk) {
        const err = result.saveError;
        showToast({
          kind: "error",
          text:
            err && err.startsWith("provider.")
              ? t(err as "provider.imageCustomBodyInvalid")
              : (err ?? t("provider.toastSaveFailed"))
        });
        return;
      }

      setBaseline({
        kind,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        visionModel: visionModel.trim(),
        webSearchModel: webSearchModel.trim(),
        hasKey: !!apiKey
      });

      if (result.allRequiredPassed) {
        showToast({ kind: "success", text: t("provider.toastAllReady") });
      } else {
        showToast({ kind: "warn", text: t("provider.toastPartialReady") });
      }
    } finally {
      setBusy(false);
      setProgressLabel(null);
    }
  }

  function updateImageTier(tier: ImageTierName, patch: Partial<ImageTierConfigDTO>): void {
    setImageConfig((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [tier]: { ...prev.tiers[tier], ...patch }
      }
    }));
  }

  async function clear(): Promise<void> {
    const ok = await confirm({
      title: t("provider.clearKeyTitle"),
      body: t("provider.clearKeyBody"),
      confirmLabel: t("provider.clearKeyConfirm"),
      cancelLabel: t("common.thinkAgain"),
      danger: true
    });
    if (!ok) return;
    try {
      await nuwa.llm.clearKey();
      setApiKey("");
      setBaseline(null);
      setReadiness(IDLE_READINESS);
      showToast({ kind: "info", text: t("provider.toastKeyCleared") });
    } catch (e) {
      showToast({
        kind: "error",
        text: t("provider.toastClearFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    }
  }

  async function clearImageKey(): Promise<void> {
    const ok = await confirm({
      title: t("provider.clearImageKeyTitle"),
      body: t("provider.clearImageKeyBody"),
      confirmLabel: t("provider.clearKeyConfirm"),
      cancelLabel: t("common.thinkAgain"),
      danger: true
    });
    if (!ok) return;
    try {
      await nuwa.imageGen.clearKey();
      setImageApiKeyDraft("");
      showToast({ kind: "info", text: t("provider.toastImageKeyCleared") });
    } catch (e) {
      showToast({
        kind: "error",
        text: t("provider.toastClearFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("provider.eyebrow")}</div>
        <div className="display display--page">{t("provider.title")}</div>
        <p className="apple-page-subtitle">{t("provider.subtitle")}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <ProviderModeSwitch mode={mode} onChange={(m) => void handleModeChange(m)} />

        <ProviderGuideSection compact={mode === "custom"} />

        {mode === "ohmygpt" ? (
          <QuickStartSection
            selectedBundle={OHMYGPT_BUNDLE}
            apiKey={apiKey}
            showKey={showKey}
            busy={busy}
            oneClickProgress={progressLabel}
            readiness={readiness}
            onApiKeyChange={setApiKey}
            onToggleShowKey={() => setShowKey((v) => !v)}
            onConnect={() => void oneClickConnect()}
            onClear={() => void clear()}
          />
        ) : (
          <CustomConfigSection
            busy={busy}
            apiKey={apiKey}
            showKey={showKey}
            kind={kind}
            baseUrl={baseUrl}
            model={model}
            visionModel={visionModel}
            webSearchModel={webSearchModel}
            verifyProgress={progressLabel}
            readiness={readiness}
            onApiKeyChange={setApiKey}
            onToggleShowKey={() => setShowKey((v) => !v)}
            onKindChange={setKind}
            onBaseUrlChange={setBaseUrl}
            onModelChange={setModel}
            onVisionModelChange={setVisionModel}
            onWebSearchModelChange={setWebSearchModel}
            onVerify={() => void verifyCustom()}
            onClear={() => void clear()}
            imageConfig={imageConfig}
            imageApiKeyDraft={imageApiKeyDraft}
            onImageConfigChange={setImageConfig}
            onImageApiKeyDraftChange={setImageApiKeyDraft}
            onUpdateImageTier={updateImageTier}
            onClearImageKey={() => void clearImageKey()}
          />
        )}
      </div>
    </div>
  );
}
