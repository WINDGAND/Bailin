import { useCallback, useEffect, useMemo, useState } from "react";
import { useBailin } from "../../shared/use-bailin.js";
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
  DEFAULT_LOCAL_PRESET_ID,
  LOCAL_PLACEHOLDER_API_KEY,
  getLocalEndpointPreset,
  getRecommendedBundle,
  isLocalBaseUrl,
  type LocalEndpointPreset,
  type RecommendedBundle
} from "./presets.js";
import {
  applyOhMyGptBundle,
  verifyCustomProvider,
  verifyLocalProvider,
  IDLE_READINESS,
  type ReadinessKey,
  type ReadinessMap
} from "./apply-recommended-bundle.js";
import { ProviderGuideSection } from "./ProviderGuideSection.js";
import { QuickStartSection } from "./QuickStartSection.js";
import { CustomConfigSection } from "./CustomConfigSection.js";
import { LocalConfigSection } from "./LocalConfigSection.js";
import {
  ProviderModeSwitch,
  readProviderMode,
  writeProviderMode,
  type ProviderMode
} from "./ProviderModeSwitch.js";
import { useT } from "../../shared/i18n/index.js";

type Kind = "openai-compatible" | "anthropic-compatible";

const CLOUD_DEFAULT_BUNDLE = getRecommendedBundle(DEFAULT_BUNDLE_ID)!;
const DEFAULT_LOCAL = getLocalEndpointPreset(DEFAULT_LOCAL_PRESET_ID)!;

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

function resolveLocalPresetId(baseUrl: string): string {
  const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  const ollama = getLocalEndpointPreset("ollama");
  const lm = getLocalEndpointPreset("lmstudio");
  if (ollama && norm(baseUrl) === norm(ollama.baseUrl)) return ollama.id;
  if (lm && norm(baseUrl) === norm(lm.baseUrl)) return lm.id;
  return DEFAULT_LOCAL_PRESET_ID;
}

type FormOrigin = {
  kind: Kind;
  baseUrl: string;
  model: string;
  visionModel: string;
  webSearchModel: string;
  hasKey: boolean;
};

function formDiffersFromOrigin(
  form: {
    kind: Kind;
    baseUrl: string;
    model: string;
    visionModel: string;
    webSearchModel: string;
    apiKey: string;
  },
  origin: FormOrigin
): boolean {
  return (
    form.kind !== origin.kind ||
    form.baseUrl.trim() !== origin.baseUrl.trim() ||
    form.model.trim() !== origin.model.trim() ||
    form.visionModel.trim() !== origin.visionModel.trim() ||
    form.webSearchModel.trim() !== origin.webSearchModel.trim() ||
    (form.apiKey.length > 0 && !origin.hasKey) ||
    (form.apiKey === "" && origin.hasKey)
  );
}

function snapshotOrigin(input: {
  kind: Kind;
  baseUrl: string;
  model: string;
  visionModel: string;
  webSearchModel: string;
  apiKey: string;
}): FormOrigin {
  return {
    kind: input.kind,
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    visionModel: input.visionModel.trim(),
    webSearchModel: input.webSearchModel.trim(),
    hasKey: Boolean(input.apiKey.trim())
  };
}

export function ApiKeyPanel(): JSX.Element {
  const t = useT();
  const bailin = useBailin();
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
  const [localPresetId, setLocalPresetId] = useState(DEFAULT_LOCAL_PRESET_ID);
  const [baseline, setBaseline] = useState<FormOrigin | null>(null);

  const [imageConfig, setImageConfig] = useState<ImageGenerationConfigDTO>(EMPTY_IMAGE_CONFIG);
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState("");
  /** 避免 getProvider 返回前，默认 webSearchModel 等把页面标成 dirty。 */
  const [hydrated, setHydrated] = useState(false);
  /**
   * 尚无已保存 provider 时，用这份快照判断侧栏离开是否脏。
   * 有 vault baseline 时不用它。
   */
  const [draftOrigin, setDraftOrigin] = useState<FormOrigin | null>(null);
  /**
   * 进入当前模式标签时的表单快照。
   * 三档切换只在「相对此快照有编辑」时弹丢弃确认，避免仅切换标签就误报。
   */
  const [viewOrigin, setViewOrigin] = useState<FormOrigin | null>(null);
  /** 已保存的 Key，切到本地再切回时用于恢复，避免清空导致脏标记。 */
  const [savedApiKey, setSavedApiKey] = useState("");

  const bundleSetters = useMemo(
    () => ({ setKind, setBaseUrl, setModel, setVisionModel, setWebSearchModel, setImageConfig }),
    []
  );

  const applyLocalPreset = useCallback((preset: LocalEndpointPreset) => {
    setLocalPresetId(preset.id);
    setKind("openai-compatible");
    setBaseUrl(preset.baseUrl);
    setModel(preset.defaultModel);
    setVisionModel("");
    setWebSearchModel("");
    setImageConfig({ ...EMPTY_IMAGE_CONFIG });
  }, []);

  /** 用户在本地面板点预设：同步当前标签原点，避免空手点预设也算未保存。 */
  function handleLocalPresetChange(preset: LocalEndpointPreset): void {
    applyLocalPreset(preset);
    setApiKey("");
    const origin: FormOrigin = {
      kind: "openai-compatible",
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
      visionModel: "",
      webSearchModel: "",
      hasKey: false
    };
    if (!baseline) setDraftOrigin(origin);
    setViewOrigin(origin);
  }

  function restoreFromBaseline(): void {
    if (!baseline) return;
    setKind(baseline.kind);
    setBaseUrl(baseline.baseUrl);
    setModel(baseline.model);
    setVisionModel(baseline.visionModel);
    setWebSearchModel(baseline.webSearchModel);
    setApiKey(savedApiKey);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = (await bailin.llm.getProvider()) as
        | {
            kind: string;
            baseUrl: string;
            model: string;
            visionModel?: string;
            webSearchModel?: string;
            apiKey: string;
          }
        | null;
      if (cancelled) return;
      if (p) {
        const nextKind = p.kind as Kind;
        const nextVision = p.visionModel?.trim() ?? "";
        const storedWeb = p.webSearchModel?.trim() ?? "";
        const nextWeb = isLocalBaseUrl(p.baseUrl)
          ? storedWeb
          : storedWeb || DEFAULT_WEB_SEARCH_MODEL;
        const displayKey = p.apiKey === LOCAL_PLACEHOLDER_API_KEY ? "" : p.apiKey;
        setKind(nextKind);
        setBaseUrl(p.baseUrl);
        setModel(p.model);
        setVisionModel(nextVision);
        setWebSearchModel(nextWeb);
        setApiKey(displayKey);
        setSavedApiKey(displayKey);
        const origin: FormOrigin = {
          kind: nextKind,
          baseUrl: p.baseUrl,
          model: p.model,
          visionModel: nextVision,
          webSearchModel: nextWeb,
          hasKey: !!p.apiKey && p.apiKey !== LOCAL_PLACEHOLDER_API_KEY
        };
        setBaseline(origin);
        setDraftOrigin(null);
        setViewOrigin(origin);
        if (isLocalBaseUrl(p.baseUrl)) {
          setMode("local");
          writeProviderMode("local");
          setLocalPresetId(resolveLocalPresetId(p.baseUrl));
        }
        try {
          const img = await bailin.imageGen.getConfig();
          if (!cancelled && img) setImageConfig(img);
        } catch {
          // ignore
        }
      } else if (readProviderMode() === "local") {
        applyLocalPreset(DEFAULT_LOCAL);
        setApiKey("");
        setSavedApiKey("");
        setBaseline(null);
        const origin: FormOrigin = {
          kind: "openai-compatible",
          baseUrl: DEFAULT_LOCAL.baseUrl,
          model: DEFAULT_LOCAL.defaultModel,
          visionModel: "",
          webSearchModel: "",
          hasKey: false
        };
        setDraftOrigin(origin);
        setViewOrigin(origin);
      } else {
        setSavedApiKey("");
        const origin: FormOrigin = {
          kind: "openai-compatible",
          baseUrl: "",
          model: "",
          visionModel: "",
          webSearchModel: DEFAULT_WEB_SEARCH_MODEL,
          hasKey: false
        };
        setDraftOrigin(origin);
        setViewOrigin(origin);
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [bailin, applyLocalPreset]);

  const formFields = useMemo(
    () => ({ kind, baseUrl, model, visionModel, webSearchModel, apiKey }),
    [kind, baseUrl, model, visionModel, webSearchModel, apiKey]
  );

  /** 相对进入当前标签时的快照；侧栏离开与三档切换共用，避免仅切换本地预设就误报未保存。 */
  const modeDirty = useMemo(() => {
    if (!hydrated || !viewOrigin) return false;
    return formDiffersFromOrigin(formFields, viewOrigin);
  }, [hydrated, formFields, viewOrigin]);

  useDirtyTracker(modeDirty);

  const cloudProgressLabels: Partial<Record<ReadinessKey, string>> = useMemo(
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
    if (modeDirty) {
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

    let nextOrigin: FormOrigin;

    if (next === "local") {
      applyLocalPreset(DEFAULT_LOCAL);
      setApiKey("");
      nextOrigin = {
        kind: "openai-compatible",
        baseUrl: DEFAULT_LOCAL.baseUrl,
        model: DEFAULT_LOCAL.defaultModel,
        visionModel: "",
        webSearchModel: "",
        hasKey: false
      };
    } else if (next === "cloud") {
      if (baseline && !isLocalBaseUrl(baseline.baseUrl)) {
        restoreFromBaseline();
        nextOrigin = { ...baseline };
      } else {
        applyBundleToForm(CLOUD_DEFAULT_BUNDLE, bundleSetters);
        setApiKey(savedApiKey);
        nextOrigin = {
          kind: CLOUD_DEFAULT_BUNDLE.llm.kind,
          baseUrl: CLOUD_DEFAULT_BUNDLE.llm.baseUrl,
          model: CLOUD_DEFAULT_BUNDLE.llm.model,
          visionModel: CLOUD_DEFAULT_BUNDLE.llm.visionModel,
          webSearchModel: CLOUD_DEFAULT_BUNDLE.llm.webSearchModel,
          hasKey: Boolean(savedApiKey.trim())
        };
      }
    } else {
      // custom
      if (baseline) {
        restoreFromBaseline();
        nextOrigin = { ...baseline };
      } else {
        nextOrigin = snapshotOrigin({
          kind,
          baseUrl,
          model,
          visionModel,
          webSearchModel,
          apiKey
        });
      }
    }

    setViewOrigin(nextOrigin);
    if (!baseline) setDraftOrigin(nextOrigin);
  }

  async function oneClickConnect(): Promise<void> {
    if (!apiKey.trim()) return;
    applyBundleToForm(CLOUD_DEFAULT_BUNDLE, bundleSetters);
    setBusy(true);
    setProgressLabel(t("provider.oneClickProgressSave"));
    setReadiness(IDLE_READINESS);

    try {
      const result = await applyOhMyGptBundle(
        bailin,
        CLOUD_DEFAULT_BUNDLE,
        apiKey.trim(),
        (key, state) => {
          if (state.status === "running" && cloudProgressLabels[key]) {
            setProgressLabel(cloudProgressLabels[key]!);
          }
          setReadiness((prev) => ({ ...prev, [key]: state }));
        }
      );

      if (!result.saveOk) {
        showToast({ kind: "error", text: result.saveError ?? t("provider.toastSaveFailed") });
        return;
      }

      const bundle = CLOUD_DEFAULT_BUNDLE;
      const origin: FormOrigin = {
        kind: bundle.llm.kind,
        baseUrl: bundle.llm.baseUrl.trim(),
        model: bundle.llm.model.trim(),
        visionModel: bundle.llm.visionModel,
        webSearchModel: bundle.llm.webSearchModel,
        hasKey: !!apiKey.trim()
      };
      setBaseline(origin);
      setDraftOrigin(null);
      setViewOrigin(origin);
      setSavedApiKey(apiKey.trim());
      setImageConfig({ ...bundle.image });
      writeProviderMode("cloud");

      if (result.allRequiredPassed) {
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
        bailin,
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

      const origin: FormOrigin = {
        kind,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        visionModel: visionModel.trim(),
        webSearchModel: webSearchModel.trim(),
        hasKey: !!apiKey.trim()
      };
      setBaseline(origin);
      setDraftOrigin(null);
      setViewOrigin(origin);
      setSavedApiKey(apiKey.trim());

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

  async function verifyLocal(): Promise<void> {
    if (!baseUrl.trim() || !model.trim()) return;
    setBusy(true);
    setProgressLabel(t("provider.oneClickProgressSave"));
    setReadiness(IDLE_READINESS);

    const effectiveKey = apiKey.trim() || LOCAL_PLACEHOLDER_API_KEY;

    try {
      const result = await verifyLocalProvider(
        bailin,
        {
          kind: "openai-compatible",
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          visionModel: visionModel.trim(),
          webSearchModel: webSearchModel.trim(),
          apiKey: effectiveKey,
          imageConfig: EMPTY_IMAGE_CONFIG
        },
        (key, state) => {
          if (state.status === "running") setProgressLabel(customProgressLabels[key]);
          setReadiness((prev) => ({ ...prev, [key]: state }));
        }
      );

      if (!result.saveOk) {
        showToast({ kind: "error", text: result.saveError ?? t("provider.toastSaveFailed") });
        return;
      }

      const origin: FormOrigin = {
        kind: "openai-compatible",
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        visionModel: visionModel.trim(),
        webSearchModel: webSearchModel.trim(),
        hasKey: Boolean(apiKey.trim())
      };
      setBaseline(origin);
      setDraftOrigin(null);
      setViewOrigin(origin);
      setSavedApiKey(apiKey.trim());
      setImageConfig({ ...EMPTY_IMAGE_CONFIG });

      if (result.allRequiredPassed) {
        const chat = result.readiness.chat;
        const latency = chat.status === "ok" ? chat.latencyMs : undefined;
        showToast({
          kind: "success",
          text: t("provider.toastLocalReady", { latency: latency ?? "?" })
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
      await bailin.llm.clearKey();
      setApiKey("");
      setSavedApiKey("");
      setBaseline(null);
      const origin = snapshotOrigin({
        kind,
        baseUrl,
        model,
        visionModel,
        webSearchModel,
        apiKey: ""
      });
      setDraftOrigin(origin);
      setViewOrigin(origin);
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
      await bailin.imageGen.clearKey();
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

        {mode !== "local" ? <ProviderGuideSection compact={mode === "custom"} /> : null}

        {mode === "cloud" ? (
          <QuickStartSection
            selectedBundle={CLOUD_DEFAULT_BUNDLE}
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
        ) : null}

        {mode === "local" ? (
          <LocalConfigSection
            busy={busy}
            presetId={localPresetId}
            baseUrl={baseUrl}
            model={model}
            apiKey={apiKey}
            showKey={showKey}
            verifyProgress={progressLabel}
            readiness={readiness}
            onPresetChange={handleLocalPresetChange}
            onBaseUrlChange={setBaseUrl}
            onModelChange={setModel}
            onApiKeyChange={setApiKey}
            onToggleShowKey={() => setShowKey((v) => !v)}
            onVerify={() => void verifyLocal()}
            onClear={() => void clear()}
          />
        ) : null}

        {mode === "custom" ? (
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
        ) : null}
      </div>
    </div>
  );
}
