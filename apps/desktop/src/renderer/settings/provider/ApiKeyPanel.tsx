import { useEffect, useMemo, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { Spinner, useConfirm, useToast } from "../../shared/feedback.js";
import type {
  ImageGenerationConfigDTO,
  ImageTierConfigDTO,
  ImageTierName
} from "../../../shared/ipc-contract.js";
import { useDirtyTracker } from "../app/dirty-context.js";
import {
  PROVIDER_PRESETS,
  VISION_MODEL_PRESETS,
  type ProviderPreset
} from "./presets.js";

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
const TIER_LABEL: Record<ImageTierName, string> = {
  economy: "经济",
  standard: "标准",
  premium: "精品"
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

export function ApiKeyPanel(): JSX.Element {
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
        showToast({ kind: "success", text: `真联网验证通过 · ${r.citations} 个 URL` });
      } else if (r.ok) {
        showToast({
          kind: "warn",
          text: "联网请求有回复，但未拿到网页来源，深度调研可能不准"
        });
      } else {
        showToast({ kind: "error", text: r.reason ?? "实测失败" });
      }
    } catch (e) {
      setProbe({
        state: "done",
        ok: false,
        realWebSearch: false,
        citations: 0,
        reason: e instanceof Error ? e.message : "未知错误"
      });
      showToast({ kind: "error", text: `实测失败：${e instanceof Error ? e.message : "未知错误"}` });
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
        showToast({ kind: "success", text: `视觉验证通过 · ${r.latencyMs ?? "?"} ms` });
      } else {
        showToast({ kind: "warn", text: r.reason ?? "视觉模型拒绝多模态请求" });
      }
    } catch (e) {
      setVisionProbe({
        state: "done",
        ok: false,
        reason: e instanceof Error ? e.message : "未知错误"
      });
      showToast({ kind: "error", text: `实测失败：${e instanceof Error ? e.message : "未知错误"}` });
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
        setStatus({ kind: "error", message: r.error ?? "保存失败" });
        showToast({ kind: "error", text: r.error ?? "保存失败" });
        return;
      }
      const t = await nuwa.llm.testConnection();
      if (t.ok) {
        setStatus({ kind: "ok", latency: t.latencyMs });
        showToast({ kind: "success", text: `连通成功（${t.latencyMs ?? "?"} ms）` });
      } else {
        setStatus({ kind: "error", message: t.error ?? "测试失败" });
        showToast({ kind: "error", text: `测试失败：${t.error ?? ""}` });
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
        setImageStatus({ kind: "error", reason: r.error ?? "保存失败" });
        showToast({ kind: "error", text: r.error ?? "保存失败" });
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
        setImageStatus({ kind: "error", reason: r.error ?? "测试失败" });
        showToast({ kind: "error", text: r.error ?? "测试失败" });
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
        text: `${TIER_LABEL[tier]}档生图测试成功 · ${r.latencyMs ?? "?"} ms`
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
      title: "清除当前 API Key 配置？",
      body: "已有角色不会被删除；只是不再有可用的模型与 Key。",
      confirmLabel: "清除",
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
      showToast({ kind: "info", text: "Key 已清除" });
    } catch (e) {
      showToast({ kind: "error", text: `清除失败：${e instanceof Error ? e.message : "未知错误"}` });
    }
  }

  async function clearImageKey(): Promise<void> {
    const ok = await confirm({
      title: "清除独立的生图 Key？",
      body: "清除后会回退到使用 LLM Provider 自动生图。",
      confirmLabel: "清除",
      danger: true
    });
    if (!ok) return;
    try {
      await nuwa.imageGen.clearKey();
      setImageApiKeyDraft("");
      setImageStatus(null);
      showToast({ kind: "info", text: "独立生图 Key 已清除" });
    } catch (e) {
      showToast({ kind: "error", text: `清除失败：${e instanceof Error ? e.message : "未知错误"}` });
    }
  }

  return (
    <div>
      <div className="apple-page-header">
        <div className="eyebrow">Provider</div>
        <div className="display display--page">模型与 API Key</div>
        <p className="apple-page-subtitle">
          连接你的模型供应商，并确认联网与视觉能力。通过后就可以放心使用完整版造人。
        </p>
      </div>

      <div className="bl-card apple-panel">
        <div className="bl-card__head">
          <div>
            <div className="bl-card__title">对话模型</div>
            <p className="bl-card__lede">
              所有调用从这台电脑直接发出。Key 用 DPAPI 加密落盘。
            </p>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <span className="bl-field-label bl-field-label--with-hint">常用提供商</span>
          <p className="bl-field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
            点一下自动填充协议、Base URL、模型，再贴 Key 即可。
          </p>
          <div className="segmented" style={{ width: "100%", overflowX: "auto" }}>
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={activePresetId === p.id ? "segmented__item is-active" : "segmented__item"}
                onClick={() => applyPreset(p)}
                data-hint={p.note ?? ""}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="bl-field-label" htmlFor="provider-kind">协议</label>
            <select
              id="provider-kind"
              className="select"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="openai-compatible">OpenAI 兼容</option>
              <option value="anthropic-compatible">Anthropic 兼容</option>
            </select>
          </div>
          <div>
            <label className="bl-field-label" htmlFor="provider-base">Base URL</label>
            <input
              id="provider-base"
              className="input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com"
            />
          </div>
          <div>
            <label className="bl-field-label" htmlFor="provider-model">主模型</label>
            <input
              id="provider-model"
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini / deepseek-v4-flash / claude-3-5-sonnet ..."
            />
          </div>
          <div>
            <label className="bl-field-label bl-field-label--with-hint" htmlFor="provider-vision">
              参考图读图模型
            </label>
            <p className="bl-field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              上传参考图时使用，与主模型分离。
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
                  data-hint={vp.hint}
                >
                  {vp.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="bl-field-label" htmlFor="provider-key">API Key</label>
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
                  aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                >
                  {showKey ? "隐藏" : "显示"}
                </button>
              </div>
            </div>
            <p className="bl-field-hint">保存后只通过系统 DPAPI 解密读取一次，永远不会上传。</p>
          </div>
        </div>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="bl-field-label">连接状态</span>
          <ConnStrip status={status} apiKey={apiKey} keyMasked={keyMasked} />
          <NetStrip
            caps={caps}
            probe={probe}
            disabled={!apiKey || isAnthropic}
            disabledHint={
              isAnthropic
                ? "Anthropic 协议的联网由 server tool 隐式触发，无需实测"
                : "先填 API Key"
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
                <div className="bl-status-strip__title">已准备好进行完整版造人</div>
                <div className="bl-status-strip__detail">
                  联网调研和参考图读图都已实测通过。
                </div>
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
              清除配置
            </button>
          </div>
          <div className="bl-action-bar__right">
            {dirty ? <span className="bl-dirty-dot">未保存</span> : null}
            <button
              type="button"
              className="btn btn--magenta"
              onClick={() => void save()}
              disabled={busy || !apiKey}
              data-hint={!apiKey ? "先填 API Key" : ""}
            >
              {busy ? "测试中…" : "保存并测试"}
            </button>
          </div>
        </div>
      </div>

      <details className="bl-card apple-panel" style={{ padding: 0 }}>
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
            <div className="bl-card__title">桌宠生图（高级）</div>
            <p className="bl-card__lede" style={{ marginTop: 4 }}>
              {imageConfig.useLLMProvider
                ? "正在复用上面的对话模型生图。点开可独立配置三档质量。"
                : "正在使用独立 Image Provider。"}
            </p>
          </div>
          <span className="body-sm" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
            展开
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
              复用对话模型 Provider
            </span>
            <span className="body-sm" style={{ color: "var(--ink-faint)" }}>
              （推荐；标准/精品档默认 gpt-image-2）
            </span>
          </label>

          {!imageConfig.useLLMProvider ? (
            <>
              <div>
                <label className="bl-field-label" htmlFor="image-base-url">Image Base URL</label>
                <input
                  id="image-base-url"
                  className="input"
                  value={imageConfig.baseUrl ?? ""}
                  onChange={(e) => setImageConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div>
                <label className="bl-field-label" htmlFor="image-api-key">Image API Key</label>
                <input
                  id="image-api-key"
                  className="input"
                  type="password"
                  value={imageApiKeyDraft}
                  onChange={(e) => setImageApiKeyDraft(e.target.value)}
                  placeholder="留空则沿用已保存 key"
                  autoComplete="off"
                />
              </div>
            </>
          ) : null}

          <div>
            <span className="bl-field-label">默认档位</span>
            <div className="segmented" style={{ marginTop: 6 }}>
              {IMAGE_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={imageConfig.defaultTier === tier ? "segmented__item is-active" : "segmented__item"}
                  onClick={() => setImageConfig((prev) => ({ ...prev, defaultTier: tier }))}
                >
                  {TIER_LABEL[tier]}
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
                    <strong>{TIER_LABEL[tier]}</strong>
                    <span>${(cfg.estimatedCostUsd ?? 0).toFixed(3)} / 张</span>
                  </div>
                  <input
                    className="input input--inline"
                    value={cfg.model}
                    onChange={(e) => updateImageTier(tier, { model: e.target.value })}
                    placeholder="模型名"
                  />
                  <select
                    className="select select--inline"
                    value={cfg.quality ?? "medium"}
                    onChange={(e) =>
                      updateImageTier(tier, {
                        quality: e.target.value as ImageTierConfigDTO["quality"]
                      })
                    }
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="standard">standard</option>
                    <option value="hd">hd</option>
                  </select>
                  <select
                    className="select select--inline"
                    value={cfg.size ?? "1024x1024"}
                    onChange={(e) =>
                      updateImageTier(tier, {
                        size: e.target.value as ImageTierConfigDTO["size"]
                      })
                    }
                  >
                    <option value="1024x1024">1024x1024</option>
                    <option value="1024x1536">1024x1536</option>
                    <option value="1536x1024">1536x1024</option>
                  </select>
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
                    {imageBusy === tier ? "测试中…" : "测试"}
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
                    ? `${TIER_LABEL[imageStatus.tier]}档测试成功：${imageStatus.model ?? "unknown"} · ${imageStatus.latencyMs ?? "?"} ms · $${(imageStatus.cost ?? 0).toFixed(3)}`
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
                清除独立 Image Key
              </button>
            </div>
            <div className="bl-action-bar__right">
              <button
                type="button"
                className="btn btn--magenta"
                onClick={() => void saveImageConfig()}
                disabled={imageBusy != null}
              >
                {imageBusy === "save" ? "保存中…" : "保存生图配置"}
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
  if (status.kind === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">正在测试连通…</div>
        </div>
        <div className="bl-status-strip__action"><Spinner magenta /></div>
      </div>
    );
  }
  if (status.kind === "ok") {
    return (
      <div className="bl-status-strip is-ok">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">连通成功</div>
          <div className="bl-status-strip__detail"><strong>{status.latency ?? "?"} ms</strong></div>
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="bl-status-strip is-error">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">连接失败</div>
          <div className="bl-status-strip__detail">{status.message}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={apiKey ? "bl-status-strip" : "bl-status-strip is-warn"}>
      <div className="bl-status-strip__body">
        <div className="bl-status-strip__title">{apiKey ? "已配置" : "未配置"}</div>
        <div className="bl-status-strip__detail">
          {apiKey ? `Key: ${keyMasked} · 点「保存并测试」验证` : "在上方贴 Key 后点保存并测试"}
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
  if (probe?.state === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">正在测试联网真实性…</div>
          <div className="bl-status-strip__detail">发一个 search ping 检查代理</div>
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
            {ok ? "真联网 · 验证通过" : probe.ok ? "联网响应有，但拿不到网页来源" : "实测失败"}
          </div>
          <div className="bl-status-strip__detail">
            {ok
              ? `${probe.citations} 个 URL · ${probe.latencyMs ?? "?"} ms`
              : probe.ok
                ? "中转代理可能吞掉了联网。深度造人会回退到训练知识，结果可能不准。"
                : probe.reason ?? "未知错误"}
          </div>
        </div>
        <div className="bl-status-strip__action">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onProbe} disabled={disabled}>
            重测
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
          {caps == null ? "联网能力未知" : isOk ? "联网能力 · 声明支持" : "联网能力 · 不支持"}
        </div>
        <div className="bl-status-strip__detail">
          {caps == null
            ? "保存配置后会自动探测"
            : isOk
              ? "建议实测一次，确认能拿到网页来源"
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
          实测联网
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
  if (visionProbe?.state === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">正在测试视觉能力…</div>
          <div className="bl-status-strip__detail">发一张 1×1 PNG 给 <strong>{visionModel}</strong></div>
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
            {visionProbe.ok ? "视觉验证通过" : "视觉模型拒绝多模态请求"}
          </div>
          <div className="bl-status-strip__detail">
            {visionProbe.ok
              ? `模型可读图 · ${visionProbe.latencyMs ?? "?"} ms`
              : visionProbe.reason ?? "上传的参考图会被忽略；造人时只用文字描述。"}
          </div>
        </div>
        <div className="bl-status-strip__action">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onProbe} disabled={disabled}>
            重测
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
          {vision == null ? "视觉能力未知" : isOk ? "视觉能力 · 声明支持" : "视觉能力 · 不支持"}
        </div>
        <div className="bl-status-strip__detail">
          {vision == null
            ? "保存配置后会自动探测"
            : isOk
              ? `静态白名单已识别。建议实测一次，确认 ${visionModel.split("/").pop()} 真的可读图`
              : vision.reason}
        </div>
      </div>
      <div className="bl-status-strip__action">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onProbe}
          disabled={disabled}
          data-hint={disabled ? "先填 API Key" : ""}
        >
          实测视觉
        </button>
      </div>
    </div>
  );
}
