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
  RECOMMENDED_BUNDLES,
  getRecommendedBundle,
  bundleMatchesConfig,
  type RecommendedBundle
} from "./presets.js";
import {
  applyRecommendedBundle,
  IDLE_READINESS,
  type ReadinessKey,
  type ReadinessMap
} from "./apply-recommended-bundle.js";
import { ProviderGuideSection } from "./ProviderGuideSection.js";
import { QuickStartSection } from "./QuickStartSection.js";
import { CustomConfigSection } from "./CustomConfigSection.js";
import type { ConnStatus, WebProbe, VisionProbe } from "./provider-strips.js";
import { useT } from "../../shared/i18n/index.js";

type Kind = "openai-compatible" | "anthropic-compatible";

function applyBundleToForm(
  bundle: RecommendedBundle,
  setters: {
    setKind: (k: Kind) => void;
    setBaseUrl: (u: string) => void;
    setModel: (m: string) => void;
    setVisionModel: (v: string) => void;
    setImageConfig: (c: ImageGenerationConfigDTO) => void;
  }
): void {
  setters.setKind(bundle.llm.kind);
  setters.setBaseUrl(bundle.llm.baseUrl);
  setters.setModel(bundle.llm.model);
  setters.setVisionModel(bundle.llm.visionModel);
  setters.setImageConfig({ ...bundle.image });
}

export function ApiKeyPanel(): JSX.Element {
  const t = useT();
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [selectedBundleId, setSelectedBundleId] = useState(DEFAULT_BUNDLE_ID);
  const [kind, setKind] = useState<Kind>("openai-compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oneClickProgress, setOneClickProgress] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessMap>(IDLE_READINESS);
  const [baseline, setBaseline] = useState<{
    kind: Kind;
    baseUrl: string;
    model: string;
    visionModel: string;
    hasKey: boolean;
  } | null>(null);

  const [status, setStatus] = useState<ConnStatus>({ kind: "idle" });
  const [caps, setCaps] = useState<{ webSearch: boolean; reason: string } | null>(null);
  const [vision, setVision] = useState<{ vision: boolean; reason: string } | null>(null);
  const [probe, setProbe] = useState<WebProbe>(null);
  const [visionProbe, setVisionProbe] = useState<VisionProbe>(null);

  const [imageConfig, setImageConfig] = useState<ImageGenerationConfigDTO>(EMPTY_IMAGE_CONFIG);
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState("");
  const [imageBusy, setImageBusy] = useState<ImageTierName | "save" | null>(null);
  const [imageStatus, setImageStatus] = useState<
    | null
    | { kind: "ok"; reason: string }
    | { kind: "error"; reason: string }
    | { kind: "test"; tier: ImageTierName; model?: string; latencyMs?: number; cost?: number }
  >(null);

  const bundleSetters = useMemo(
    () => ({ setKind, setBaseUrl, setModel, setVisionModel, setImageConfig }),
    []
  );

  const selectedBundle = getRecommendedBundle(selectedBundleId) ?? RECOMMENDED_BUNDLES[0]!;

  const deviatedFromBundle = useMemo(() => {
    if (!baseline) return false;
    const b = getRecommendedBundle(selectedBundleId);
    if (!b) return false;
    return !bundleMatchesConfig(b, { kind, baseUrl, model, visionModel });
  }, [selectedBundleId, kind, baseUrl, model, visionModel, baseline]);

  useEffect(() => {
    void (async () => {
      const p = (await nuwa.llm.getProvider()) as
        | {
            kind: string;
            baseUrl: string;
            model: string;
            visionModel?: string;
            apiKey: string;
          }
        | null;
      if (p) {
        const nextKind = p.kind as Kind;
        const nextVision = p.visionModel?.trim() ?? "";
        setKind(nextKind);
        setBaseUrl(p.baseUrl);
        setModel(p.model);
        setVisionModel(nextVision);
        setApiKey(p.apiKey);
        setBaseline({
          kind: nextKind,
          baseUrl: p.baseUrl,
          model: p.model,
          visionModel: nextVision,
          hasKey: !!p.apiKey
        });
        const matched = RECOMMENDED_BUNDLES.find((b) =>
          bundleMatchesConfig(b, {
            kind: nextKind,
            baseUrl: p.baseUrl,
            model: p.model,
            visionModel: nextVision
          })
        );
        if (matched) setSelectedBundleId(matched.id);
        try {
          const img = await nuwa.imageGen.getConfig();
          if (img) setImageConfig(img);
        } catch {
          // ignore
        }
      }
      try {
        setCaps(await nuwa.characters.detectCapabilities());
      } catch {
        // ignore
      }
      try {
        setVision(await nuwa.characters.detectVisionCapability());
      } catch {
        // ignore
      }
    })();
  }, [nuwa]);

  const dirty = useMemo(() => {
    if (!baseline) return apiKey.length > 0 || baseUrl.length > 0 || model.length > 0;
    return (
      kind !== baseline.kind ||
      baseUrl.trim() !== baseline.baseUrl ||
      model.trim() !== baseline.model ||
      visionModel.trim() !== baseline.visionModel ||
      (apiKey.length > 0 && !baseline.hasKey) ||
      (apiKey === "" && baseline.hasKey)
    );
  }, [kind, baseUrl, model, visionModel, apiKey, baseline]);

  useDirtyTracker(dirty);

  const keyMasked = apiKey.length > 6 ? `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}` : "";
  const isAnthropic = kind === "anthropic-compatible";
  const readyForDeep =
    probe?.state === "done" &&
    probe.ok &&
    probe.realWebSearch &&
    visionProbe?.state === "done" &&
    visionProbe.ok;

  const unavailableReason = useCallback(
    (feature: ReadinessKey): string => {
      if (feature === "vision") return t("provider.readinessUnavailableVision");
      if (feature === "webSearch") return t("provider.readinessUnavailableWeb");
      return t("provider.readinessUnavailableImage");
    },
    [t]
  );

  async function runProbe(): Promise<void> {
    setProbe({ state: "running" });
    try {
      const r = await nuwa.characters.probeWebSearch();
      setProbe({
        state: "done",
        ok: r.ok,
        realWebSearch: r.realWebSearch,
        citations: r.citations,
        latencyMs: r.latencyMs,
        reason: r.reason
      });
    } catch (e) {
      setProbe({
        state: "done",
        ok: false,
        realWebSearch: false,
        citations: 0,
        reason: e instanceof Error ? e.message : t("common.unknownError")
      });
    }
  }

  async function runVisionProbe(): Promise<void> {
    setVisionProbe({ state: "running" });
    try {
      const r = await nuwa.characters.probeVision();
      setVisionProbe({
        state: "done",
        ok: r.ok,
        latencyMs: r.latencyMs,
        reason: r.reason
      });
    } catch (e) {
      setVisionProbe({
        state: "done",
        ok: false,
        reason: e instanceof Error ? e.message : t("common.unknownError")
      });
    }
  }

  async function oneClickConnect(): Promise<void> {
    if (!apiKey.trim()) return;
    const bundle = getRecommendedBundle(selectedBundleId) ?? RECOMMENDED_BUNDLES[0]!;
    applyBundleToForm(bundle, bundleSetters);
    setBusy(true);
    setOneClickProgress(t("provider.oneClickProgressSave"));
    setReadiness(IDLE_READINESS);

    const progressLabels: Record<ReadinessKey, string> = {
      chat: t("provider.oneClickProgressChat"),
      vision: t("provider.oneClickProgressVision"),
      webSearch: t("provider.oneClickProgressWeb"),
      imageGen: t("provider.oneClickProgressImage")
    };

    try {
      const result = await applyRecommendedBundle(
        nuwa,
        bundle,
        apiKey.trim(),
        (key, state) => {
          if (state.status === "running") setOneClickProgress(progressLabels[key]);
          setReadiness((prev) => ({ ...prev, [key]: state }));
        },
        unavailableReason
      );

      if (!result.saveOk) {
        showToast({ kind: "error", text: result.saveError ?? t("provider.toastSaveFailed") });
        return;
      }

      const normalizedVision = bundle.llm.visionModel;
      setBaseline({
        kind: bundle.llm.kind,
        baseUrl: bundle.llm.baseUrl.trim(),
        model: bundle.llm.model.trim(),
        visionModel: normalizedVision,
        hasKey: !!apiKey
      });
      setImageConfig({ ...bundle.image });

      const chatState = result.readiness.chat;
      if (chatState.status === "ok") {
        setStatus({ kind: "ok", latency: chatState.latencyMs });
      } else if (chatState.status === "fail") {
        setStatus({ kind: "error", message: chatState.reason });
      }

      try {
        setCaps(await nuwa.characters.detectCapabilities());
      } catch {
        // ignore
      }
      try {
        setVision(await nuwa.characters.detectVisionCapability());
      } catch {
        // ignore
      }
      setProbe(null);
      setVisionProbe(null);

      if (result.allRequiredPassed) {
        showToast({ kind: "success", text: t("provider.toastAllReady") });
      } else {
        showToast({ kind: "warn", text: t("provider.toastPartialReady") });
      }
    } finally {
      setBusy(false);
      setOneClickProgress(null);
    }
  }

  async function saveAdvanced(): Promise<void> {
    setBusy(true);
    setStatus({ kind: "running" });
    try {
      const normalizedVision = visionModel.trim();
      const r = await nuwa.llm.setProvider({
        kind,
        baseUrl,
        model,
        visionModel: normalizedVision,
        apiKey
      });
      if (!r.ok) {
        const err = r.error ?? t("provider.toastSaveFailed");
        setStatus({ kind: "error", message: err });
        showToast({ kind: "error", text: err });
        return;
      }
      const payload: ImageGenerationConfigDTO = {
        ...imageConfig,
        apiKey: imageConfig.useLLMProvider ? undefined : imageApiKeyDraft || undefined
      };
      const imgR = await nuwa.imageGen.setConfig(payload);
      if (!imgR.ok) {
        const err = imgR.error ?? t("provider.toastSaveFailed");
        setStatus({ kind: "error", message: err });
        showToast({ kind: "error", text: err });
        return;
      }
      const testResult = await nuwa.llm.testConnection();
      if (testResult.ok) {
        setStatus({ kind: "ok", latency: testResult.latencyMs });
        showToast({
          kind: "success",
          text: t("provider.toastConnectOk", { latency: testResult.latencyMs ?? "?" })
        });
      } else {
        const err = testResult.error ?? t("provider.toastImageTestFailed");
        setStatus({ kind: "error", message: err });
        showToast({ kind: "error", text: t("provider.toastTestFailed", { error: err }) });
      }
      setBaseline({
        kind,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        visionModel: normalizedVision,
        hasKey: !!apiKey
      });
      try {
        setCaps(await nuwa.characters.detectCapabilities());
      } catch {
        // ignore
      }
      try {
        setVision(await nuwa.characters.detectVisionCapability());
      } catch {
        // ignore
      }
      setProbe(null);
      setVisionProbe(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveImageConfig(): Promise<void> {
    setImageBusy("save");
    try {
      const payload: ImageGenerationConfigDTO = {
        ...imageConfig,
        apiKey: imageConfig.useLLMProvider ? undefined : imageApiKeyDraft || undefined
      };
      const r = await nuwa.imageGen.setConfig(payload);
      if (!r.ok) {
        const err = r.error ?? t("provider.toastSaveFailed");
        setImageStatus({ kind: "error", reason: err });
        showToast({ kind: "error", text: err });
        return;
      }
      const cap = await nuwa.imageGen.detectCapability();
      setImageStatus(cap.ok ? { kind: "ok", reason: cap.reason } : { kind: "error", reason: cap.reason });
      showToast({ kind: cap.ok ? "success" : "warn", text: cap.reason });
    } finally {
      setImageBusy(null);
    }
  }

  async function testImageTier(tier: ImageTierName): Promise<void> {
    setImageBusy(tier);
    try {
      const r = await nuwa.imageGen.test(tier);
      if (!r.ok) {
        const err = r.error ?? t("provider.toastImageTestFailed");
        setImageStatus({ kind: "error", reason: err });
        showToast({ kind: "error", text: err });
        return;
      }
      setImageStatus({
        kind: "test",
        tier,
        model: r.model,
        latencyMs: r.latencyMs,
        cost: r.estimatedCostUsd
      });
      showToast({
        kind: "success",
        text: t("provider.toastImageTierOk", {
          tier: t(TIER_KEYS[tier]),
          latency: r.latencyMs ?? "?"
        })
      });
    } finally {
      setImageBusy(null);
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
      setStatus({ kind: "idle" });
      setCaps(null);
      setVision(null);
      setProbe(null);
      setVisionProbe(null);
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
      setImageStatus(null);
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

  const TIER_KEYS: Record<ImageTierName, string> = {
    economy: "provider.tierEconomy",
    standard: "provider.tierStandard",
    premium: "provider.tierPremium"
  };

  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("provider.eyebrow")}</div>
        <div className="display display--page">{t("provider.title")}</div>
        <p className="apple-page-subtitle">{t("provider.subtitle")}</p>
      </div>

      <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 28 }}>
        <QuickStartSection
          selectedBundle={selectedBundle}
          apiKey={apiKey}
          showKey={showKey}
          busy={busy}
          oneClickProgress={oneClickProgress}
          readiness={readiness}
          onApiKeyChange={setApiKey}
          onToggleShowKey={() => setShowKey((v) => !v)}
          onConnect={() => void oneClickConnect()}
          onClear={() => void clear()}
        />

        <ProviderGuideSection />

        <CustomConfigSection
          deviatedFromBundle={deviatedFromBundle}
          dirty={dirty}
          busy={busy}
          apiKey={apiKey}
          keyMasked={keyMasked}
          kind={kind}
          baseUrl={baseUrl}
          model={model}
          visionModel={visionModel}
          status={status}
          caps={caps}
          probe={probe}
          vision={vision}
          visionProbe={visionProbe}
          isAnthropic={isAnthropic}
          readyForDeep={readyForDeep}
          imageConfig={imageConfig}
          imageApiKeyDraft={imageApiKeyDraft}
          imageBusy={imageBusy}
          imageStatus={imageStatus}
          onKindChange={setKind}
          onBaseUrlChange={setBaseUrl}
          onModelChange={setModel}
          onVisionModelChange={setVisionModel}
          onProbeWeb={() => void runProbe()}
          onProbeVision={() => void runVisionProbe()}
          onSaveAdvanced={() => void saveAdvanced()}
          onImageConfigChange={setImageConfig}
          onImageApiKeyDraftChange={setImageApiKeyDraft}
          onUpdateImageTier={updateImageTier}
          onTestImageTier={(tier) => void testImageTier(tier)}
          onSaveImageConfig={() => void saveImageConfig()}
          onClearImageKey={() => void clearImageKey()}
        />
      </div>
    </div>
  );
}
