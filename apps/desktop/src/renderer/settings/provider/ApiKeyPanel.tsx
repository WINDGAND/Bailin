import { useEffect, useMemo, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { Spinner, useConfirm, useToast } from "../../shared/feedback.js";
import type {
  ImageGenerationConfigDTO,
  ImageTierConfigDTO,
  ImageTierName
} from "../../../shared/ipc-contract.js";
import { useDirtyTracker } from "../app/dirty-context.js";
import { BlSelect } from "../../shared/BlSelect.js";
import {
  PROVIDER_PRESETS,
  VISION_MODEL_PRESETS,
  type ProviderPreset
} from "./presets.js";
import { useT } from "../../shared/i18n/index.js";

const DEFAULT_VISION_MODEL = "bytedance/doubao-seed-2.0-lite-260428";

type Kind = "openai-compatible" | "anthropic-compatible";
type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; latency?: number }
  | { kind: "error"; message: string };
type WebProbe =
  | null
  | { state: "running" }
  | {
      state: "done";
      ok: boolean;
      realWebSearch: boolean;
      citations: number;
      latencyMs?: number;
      reason?: string;
    };
type VisionProbe =
  | null
  | { state: "running" }
  | { state: "done"; ok: boolean; latencyMs?: number; reason?: string };

const IMAGE_TIERS: ImageTierName[] = ["economy", "standard", "premium"];

const TIER_KEYS: Record<ImageTierName, string> = {
  economy: "provider.tierEconomy",
  standard: "provider.tierStandard",
  premium: "provider.tierPremium"
};

const DEFAULT_IMAGE_CONFIG: ImageGenerationConfigDTO = {
  useLLMProvider: true,
  defaultTier: "standard",
  tiers: {
    economy: {
      model: "gpt-image-1-mini",
      size: "1024x1024",
      quality: "low",
      estimatedCostUsd: 0.005
    },
    standard: {
      model: "gpt-image-2",
      size: "1024x1024",
      quality: "medium",
      estimatedCostUsd: 0.032
    },
    premium: {
      model: "gpt-image-2",
      size: "1024x1536",
      quality: "high",
      estimatedCostUsd: 0.18
    }
  }
};

function tierLabel(tier: ImageTierName, t: (key: string) => string): string {
  return t(TIER_KEYS[tier]);
}

function visionPresetLabel(id: string, fallback: string, t: (key: string) => string): string {
  const key = `provider.visionLabels.${id}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function ApiKeyPanel(): JSX.Element {
  const t = useT();
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [kind, setKind] = useState<Kind>("openai-compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [visionModel, setVisionModel] = useState(DEFAULT_VISION_MODEL);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [baseline, setBaseline] = useState<{
    kind: Kind;
    baseUrl: string;
    model: string;
    visionModel: string;
    hasKey: boolean;
  } | null>(null);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [caps, setCaps] = useState<{ webSearch: boolean; reason: string } | null>(null);
  const [vision, setVision] = useState<{ vision: boolean; reason: string } | null>(null);
  const [probe, setProbe] = useState<WebProbe>(null);
  const [visionProbe, setVisionProbe] = useState<VisionProbe>(null);

  const [imageConfig, setImageConfig] = useState<ImageGenerationConfigDTO>(DEFAULT_IMAGE_CONFIG);
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState("");
  const [imageBusy, setImageBusy] = useState<ImageTierName | "save" | null>(null);
  const [imageStatus, setImageStatus] = useState<
    | null
    | { kind: "ok"; reason: string }
    | { kind: "error"; reason: string }
    | { kind: "test"; tier: ImageTierName; model?: string; latencyMs?: number; cost?: number }
  >(null);

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
        const nextVision = p.visionModel?.trim() || DEFAULT_VISION_MODEL;
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
      try {
        const img = await nuwa.imageGen.getConfig();
        if (img) setImageConfig(img);
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

  const activePresetId = useMemo(
    () =>
      PROVIDER_PRESETS.find(
        (p) => p.kind === kind && p.baseUrl === baseUrl && p.model === model
      )?.id,
    [kind, baseUrl, model]
  );
  const keyMasked = apiKey.length > 6 ? `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}` : "";
  const isAnthropic = kind === "anthropic-compatible";
  const readyForDeep =
    probe?.state === "done" &&
    probe.ok &&
    probe.realWebSearch &&
    visionProbe?.state === "done" &&
    visionProbe.ok;

  function applyPreset(p: ProviderPreset): void {
    setKind(p.kind);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    if (p.visionModel) setVisionModel(p.visionModel);
    setStatus({ kind: "idle" });
    setProbe(null);
    setVisionProbe(null);
  }

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
      if (r.ok && r.realWebSearch) {
        showToast({
          kind: "success",
          text: t("provider.toastWebSearchOk", { count: r.citations })
        });
      } else if (r.ok) {
        showToast({ kind: "warn", text: t("provider.toastWebSearchPartial") });
      } else {
        showToast({ kind: "error", text: r.reason ?? t("provider.toastProbeFailed") });
      }
    } catch (e) {
      setProbe({
        state: "done",
        ok: false,
        realWebSearch: false,
        citations: 0,
        reason: e instanceof Error ? e.message : t("common.unknownError")
      });
      showToast({
        kind: "error",
        text: t("provider.toastProbeFailedDetail", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
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
      if (r.ok) {
        showToast({
          kind: "success",
          text: t("provider.toastVisionOk", { latency: r.latencyMs ?? "?" })
        });
      } else {
        showToast({
          kind: "warn",
          text: r.reason ?? t("provider.toastVisionRejected")
        });
      }
    } catch (e) {
      setVisionProbe({
        state: "done",
        ok: false,
        reason: e instanceof Error ? e.message : t("common.unknownError")
      });
      showToast({
        kind: "error",
        text: t("provider.toastProbeFailedDetail", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setStatus({ kind: "running" });
    try {
      const normalizedVision = visionModel.trim() || DEFAULT_VISION_MODEL;
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
          tier: tierLabel(tier, t),
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

  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("provider.eyebrow")}</div>
        <div className="display display--page">{t("provider.title")}</div>
        <p className="apple-page-subtitle">{t("provider.subtitle")}</p>
      </div>

      <div style={{ maxWidth: 760 }}>
        <div className="bl-card__head">
          <div>
            <div className="bl-card__title">{t("provider.chatModelTitle")}</div>
            <p className="bl-card__lede">{t("provider.chatModelLede")}</p>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <span className="bl-field-label bl-field-label--with-hint">{t("provider.presetsLabel")}</span>
          <p className="bl-field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
            {t("provider.presetsHint")}
          </p>
          <div className="segmented" style={{ width: "100%", overflowX: "auto" }}>
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={activePresetId === p.id ? "segmented__item is-active" : "segmented__item"}
                onClick={() => applyPreset(p)}
                data-hint={t(`provider.presetNotes.${p.id}`)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="bl-field-label" htmlFor="provider-kind">
              {t("provider.protocolLabel")}
            </label>
            <BlSelect
              id="provider-kind"
              value={kind}
              onChange={setKind}
              triggerClassName="select"
              options={[
                { value: "openai-compatible", label: t("provider.protocolOpenAI") },
                { value: "anthropic-compatible", label: t("provider.protocolAnthropic") }
              ]}
            />
          </div>
          <div>
            <label className="bl-field-label" htmlFor="provider-base">
              {t("provider.baseUrlLabel")}
            </label>
            <input
              id="provider-base"
              className="input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com"
            />
          </div>
          <div>
            <label className="bl-field-label" htmlFor="provider-model">
              {t("provider.mainModelLabel")}
            </label>
            <input
              id="provider-model"
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t("provider.mainModelPlaceholder")}
            />
          </div>
          <div>
            <label className="bl-field-label bl-field-label--with-hint" htmlFor="provider-vision">
              {t("provider.visionModelLabel")}
            </label>
            <p className="bl-field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              {t("provider.visionModelHint")}
            </p>
            <input
              id="provider-vision"
              className="input"
              value={visionModel}
              onChange={(e) => setVisionModel(e.target.value)}
              placeholder={DEFAULT_VISION_MODEL}
              style={{ marginBottom: 8 }}
            />
            <div className="bl-chip-group">
              {VISION_MODEL_PRESETS.map((vp) => (
                <button
                  key={vp.id}
                  type="button"
                  className={visionModel.trim() === vp.model ? "bl-chip is-active" : "bl-chip"}
                  onClick={() => setVisionModel(vp.model)}
                  data-hint={t(`provider.visionHints.${vp.id}`)}
                >
                  {visionPresetLabel(vp.id, vp.label, t)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="bl-field-label" htmlFor="provider-key">
              {t("provider.apiKeyLabel")}
            </label>
            <div className="input-group">
              <input
                id="provider-key"
                className="input"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
              />
              <div className="input-group__suffix">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t("provider.hideKeyAria") : t("provider.showKeyAria")}
                >
                  {showKey ? t("provider.hideKey") : t("provider.showKey")}
                </button>
              </div>
            </div>
            <p className="bl-field-hint">{t("provider.apiKeyHint")}</p>
          </div>
        </div>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="bl-field-label">{t("provider.connStatusLabel")}</span>
          <ConnStrip status={status} apiKey={apiKey} keyMasked={keyMasked} />
          <NetStrip
            caps={caps}
            probe={probe}
            disabled={!apiKey || isAnthropic}
            disabledHint={
              isAnthropic ? t("provider.anthropicNetHint") : t("provider.fillKeyFirst")
            }
            onProbe={() => void runProbe()}
          />
          <VisionStrip
            vision={vision}
            visionProbe={visionProbe}
            visionModel={visionModel}
            disabled={!apiKey}
            onProbe={() => void runVisionProbe()}
          />
          {readyForDeep ? (
            <div className="bl-status-strip is-ok">
              <div className="bl-status-strip__body">
                <div className="bl-status-strip__title">{t("provider.readyForDeepTitle")}</div>
                <div className="bl-status-strip__detail">{t("provider.readyForDeepDetail")}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bl-action-bar">
          <div className="bl-action-bar__left">
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => void clear()}
              disabled={busy || !apiKey}
            >
              {t("provider.clearConfig")}
            </button>
          </div>
          <div className="bl-action-bar__right">
            {dirty ? <span className="bl-dirty-dot">{t("provider.unsaved")}</span> : null}
            <button
              type="button"
              className="btn btn--magenta"
              onClick={() => void save()}
              disabled={busy || !apiKey}
              data-hint={!apiKey ? t("provider.fillKeyFirst") : ""}
            >
              {busy ? t("provider.saveTesting") : t("provider.saveAndTest")}
            </button>
          </div>
        </div>
      </div>

      <details style={{ maxWidth: 760, borderTop: "1px solid var(--grid-strong)", marginTop: 8, padding: 0 }}>
        <summary
          style={{
            cursor: "pointer",
            userSelect: "none",
            padding: "20px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            listStyle: "none"
          }}
        >
          <div>
            <div className="bl-card__title">{t("provider.imageGenTitle")}</div>
            <p className="bl-card__lede" style={{ marginTop: 4 }}>
              {imageConfig.useLLMProvider
                ? t("provider.imageGenLedeReuse")
                : t("provider.imageGenLedeIndependent")}
            </p>
          </div>
          <span className="body-sm" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
            {t("provider.expand")}
          </span>
        </summary>
        <div style={{ padding: "0 24px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="row gap-2" style={{ alignItems: "center", padding: "8px 0" }}>
            <input
              type="checkbox"
              checked={imageConfig.useLLMProvider}
              onChange={(e) =>
                setImageConfig((prev) => ({ ...prev, useLLMProvider: e.target.checked }))
              }
            />
            <span className="bl-field-label" style={{ marginBottom: 0 }}>
              {t("provider.reuseLLMProvider")}
            </span>
            <span className="body-sm" style={{ color: "var(--ink-faint)" }}>
              {t("provider.reuseLLMHint")}
            </span>
          </label>

          {!imageConfig.useLLMProvider ? (
            <>
              <div>
                <label className="bl-field-label" htmlFor="image-base-url">
                  {t("provider.imageBaseUrlLabel")}
                </label>
                <input
                  id="image-base-url"
                  className="input"
                  value={imageConfig.baseUrl ?? ""}
                  onChange={(e) => setImageConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div>
                <label className="bl-field-label" htmlFor="image-api-key">
                  {t("provider.imageApiKeyLabel")}
                </label>
                <input
                  id="image-api-key"
                  className="input"
                  type="password"
                  value={imageApiKeyDraft}
                  onChange={(e) => setImageApiKeyDraft(e.target.value)}
                  placeholder={t("provider.imageApiKeyPlaceholder")}
                  autoComplete="off"
                />
              </div>
            </>
          ) : null}

          <div>
            <span className="bl-field-label">{t("provider.defaultTierLabel")}</span>
            <div className="segmented" style={{ marginTop: 6 }}>
              {IMAGE_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={imageConfig.defaultTier === tier ? "segmented__item is-active" : "segmented__item"}
                  onClick={() => setImageConfig((prev) => ({ ...prev, defaultTier: tier }))}
                >
                  {tierLabel(tier, t)}
                </button>
              ))}
            </div>
          </div>

          <div className="tier-list">
            {IMAGE_TIERS.map((tier) => {
              const cfg = imageConfig.tiers[tier];
              return (
                <div className="tier-row" key={tier}>
                  <div className="tier-row__label">
                    <strong>{tierLabel(tier, t)}</strong>
                    <span>
                      ${(cfg.estimatedCostUsd ?? 0).toFixed(3)} {t("provider.perImage")}
                    </span>
                  </div>
                  <input
                    className="input input--inline"
                    value={cfg.model}
                    onChange={(e) => updateImageTier(tier, { model: e.target.value })}
                    placeholder={t("provider.modelNamePlaceholder")}
                  />
                  <BlSelect
                    className="bl-select--inline"
                    triggerClassName="select select--inline"
                    value={cfg.quality ?? "medium"}
                    onChange={(quality) =>
                      updateImageTier(tier, {
                        quality: quality as ImageTierConfigDTO["quality"]
                      })
                    }
                    options={[
                      { value: "low", label: "low" },
                      { value: "medium", label: "medium" },
                      { value: "high", label: "high" },
                      { value: "standard", label: "standard" },
                      { value: "hd", label: "hd" }
                    ]}
                  />
                  <BlSelect
                    className="bl-select--inline"
                    triggerClassName="select select--inline"
                    value={cfg.size ?? "1024x1024"}
                    onChange={(size) =>
                      updateImageTier(tier, {
                        size: size as ImageTierConfigDTO["size"]
                      })
                    }
                    options={[
                      { value: "1024x1024", label: "1024x1024" },
                      { value: "1024x1536", label: "1024x1536" },
                      { value: "1536x1024", label: "1536x1024" }
                    ]}
                  />
                  <input
                    className="input input--inline input--price"
                    type="number"
                    min={0}
                    step={0.001}
                    value={cfg.estimatedCostUsd ?? 0}
                    onChange={(e) =>
                      updateImageTier(tier, {
                        estimatedCostUsd: Number(e.target.value)
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void testImageTier(tier)}
                    disabled={imageBusy != null}
                  >
                    {imageBusy === tier ? t("provider.testing") : t("provider.test")}
                  </button>
                </div>
              );
            })}
          </div>

          {imageStatus ? (
            <div className={imageStatus.kind === "error" ? "bl-status-strip is-error" : "bl-status-strip is-ok"}>
              <div className="bl-status-strip__body">
                <div className="bl-status-strip__detail">
                  {imageStatus.kind === "test"
                    ? t("provider.imageTestSuccess", {
                        tier: tierLabel(imageStatus.tier, t),
                        model: imageStatus.model ?? "unknown",
                        latency: imageStatus.latencyMs ?? "?",
                        cost: (imageStatus.cost ?? 0).toFixed(3)
                      })
                    : imageStatus.reason}
                </div>
              </div>
            </div>
          ) : null}

          <div className="bl-action-bar">
            <div className="bl-action-bar__left">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void clearImageKey()}
                disabled={imageConfig.useLLMProvider || imageBusy != null}
              >
                {t("provider.clearImageKey")}
              </button>
            </div>
            <div className="bl-action-bar__right">
              <button
                type="button"
                className="btn btn--magenta"
                onClick={() => void saveImageConfig()}
                disabled={imageBusy != null}
              >
                {imageBusy === "save" ? t("provider.savingImageConfig") : t("provider.saveImageConfig")}
              </button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function ConnStrip({
  status,
  apiKey,
  keyMasked
}: {
  status: Status;
  apiKey: string;
  keyMasked: string;
}): JSX.Element {
  const t = useT();
  if (status.kind === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.connTesting")}</div>
        </div>
        <div className="bl-status-strip__action"><Spinner magenta /></div>
      </div>
    );
  }
  if (status.kind === "ok") {
    return (
      <div className="bl-status-strip is-ok">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.connOk")}</div>
          <div className="bl-status-strip__detail"><strong>{status.latency ?? "?"} ms</strong></div>
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="bl-status-strip is-error">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.connFailed")}</div>
          <div className="bl-status-strip__detail">{status.message}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={apiKey ? "bl-status-strip" : "bl-status-strip is-warn"}>
      <div className="bl-status-strip__body">
        <div className="bl-status-strip__title">
          {apiKey ? t("provider.connConfigured") : t("provider.connNotConfigured")}
        </div>
        <div className="bl-status-strip__detail">
          {apiKey
            ? t("provider.connConfiguredDetail", { masked: keyMasked })
            : t("provider.connNotConfiguredDetail")}
        </div>
      </div>
    </div>
  );
}

function NetStrip({
  caps,
  probe,
  disabled,
  disabledHint,
  onProbe
}: {
  caps: { webSearch: boolean; reason: string } | null;
  probe: WebProbe;
  disabled: boolean;
  disabledHint: string;
  onProbe: () => void;
}): JSX.Element {
  const t = useT();
  if (probe?.state === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.netTestingTitle")}</div>
          <div className="bl-status-strip__detail">{t("provider.netTestingDetail")}</div>
        </div>
        <div className="bl-status-strip__action"><Spinner magenta /></div>
      </div>
    );
  }
  if (probe?.state === "done") {
    const ok = probe.ok && probe.realWebSearch;
    return (
      <div className={ok ? "bl-status-strip is-ok" : probe.ok ? "bl-status-strip is-warn" : "bl-status-strip is-error"}>
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">
            {ok
              ? t("provider.netOkTitle")
              : probe.ok
                ? t("provider.netPartialTitle")
                : t("provider.netFailedTitle")}
          </div>
          <div className="bl-status-strip__detail">
            {ok
              ? t("provider.netOkDetail", {
                  count: probe.citations,
                  latency: probe.latencyMs ?? "?"
                })
              : probe.ok
                ? t("provider.netPartialDetail")
                : probe.reason ?? t("common.unknownError")}
          </div>
        </div>
        <div className="bl-status-strip__action">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onProbe} disabled={disabled}>
            {t("provider.retest")}
          </button>
        </div>
      </div>
    );
  }
  const isOk = caps?.webSearch === true;
  return (
    <div className={isOk ? "bl-status-strip" : "bl-status-strip is-warn"}>
      <div className="bl-status-strip__body">
        <div className="bl-status-strip__title">
          {caps == null
            ? t("provider.netUnknownTitle")
            : isOk
              ? t("provider.netSupportedTitle")
              : t("provider.netUnsupportedTitle")}
        </div>
        <div className="bl-status-strip__detail">
          {caps == null
            ? t("provider.netUnknownDetail")
            : isOk
              ? t("provider.netSupportedDetail")
              : caps.reason}
        </div>
      </div>
      <div className="bl-status-strip__action">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onProbe}
          disabled={disabled}
          data-hint={disabled ? disabledHint : ""}
        >
          {t("provider.probeWeb")}
        </button>
      </div>
    </div>
  );
}

function VisionStrip({
  vision,
  visionProbe,
  visionModel,
  disabled,
  onProbe
}: {
  vision: { vision: boolean; reason: string } | null;
  visionProbe: VisionProbe;
  visionModel: string;
  disabled: boolean;
  onProbe: () => void;
}): JSX.Element {
  const t = useT();
  const modelShort = visionModel.split("/").pop() ?? visionModel;
  if (visionProbe?.state === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.visionTestingTitle")}</div>
          <div className="bl-status-strip__detail">
            {t("provider.visionTestingDetail", { model: visionModel })}
          </div>
        </div>
        <div className="bl-status-strip__action"><Spinner magenta /></div>
      </div>
    );
  }
  if (visionProbe?.state === "done") {
    return (
      <div className={visionProbe.ok ? "bl-status-strip is-ok" : "bl-status-strip is-warn"}>
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">
            {visionProbe.ok ? t("provider.visionOkTitle") : t("provider.visionRejectedTitle")}
          </div>
          <div className="bl-status-strip__detail">
            {visionProbe.ok
              ? t("provider.visionOkDetail", { latency: visionProbe.latencyMs ?? "?" })
              : visionProbe.reason ?? t("provider.visionRejectedDetail")}
          </div>
        </div>
        <div className="bl-status-strip__action">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onProbe} disabled={disabled}>
            {t("provider.retest")}
          </button>
        </div>
      </div>
    );
  }
  const isOk = vision?.vision === true;
  return (
    <div className={isOk ? "bl-status-strip" : "bl-status-strip is-warn"}>
      <div className="bl-status-strip__body">
        <div className="bl-status-strip__title">
          {vision == null
            ? t("provider.visionUnknownTitle")
            : isOk
              ? t("provider.visionSupportedTitle")
              : t("provider.visionUnsupportedTitle")}
        </div>
        <div className="bl-status-strip__detail">
          {vision == null
            ? t("provider.visionUnknownDetail")
            : isOk
              ? t("provider.visionSupportedDetail", { model: modelShort })
              : vision.reason}
        </div>
      </div>
      <div className="bl-status-strip__action">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onProbe}
          disabled={disabled}
          data-hint={disabled ? t("provider.fillKeyFirst") : ""}
        >
          {t("provider.probeVision")}
        </button>
      </div>
    </div>
  );
}
