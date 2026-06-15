import { useEffect, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import {
  Spinner,
  StatusDot,
  useConfirm,
  useToast
} from "../../shared/feedback.js";
import type {
  ImageGenerationConfigDTO,
  ImageTierConfigDTO,
  ImageTierName
} from "../../../shared/ipc-contract.js";

const DEFAULT_VISION_MODEL = "bytedance/doubao-seed-2.0-lite-260428";

type Kind = "openai-compatible" | "anthropic-compatible";
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
  const [imageConfig, setImageConfig] =
    useState<ImageGenerationConfigDTO>(DEFAULT_IMAGE_CONFIG);
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState("");
  const [imageBusy, setImageBusy] = useState<ImageTierName | "save" | null>(null);
  const [imageStatus, setImageStatus] = useState<
    | null
    | { kind: "ok"; reason: string }
    | { kind: "error"; reason: string }
    | { kind: "test"; tier: ImageTierName; model?: string; latencyMs?: number; cost?: number }
  >(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; latency?: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [caps, setCaps] = useState<{ webSearch: boolean; reason: string } | null>(null);
  const [probe, setProbe] = useState<
    | null
    | { state: "running" }
    | {
        state: "done";
        ok: boolean;
        realWebSearch: boolean;
        citations: number;
        latencyMs?: number;
        reason?: string;
      }
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
        setKind(p.kind as Kind);
        setBaseUrl(p.baseUrl);
        setModel(p.model);
        setVisionModel(p.visionModel?.trim() || DEFAULT_VISION_MODEL);
        setApiKey(p.apiKey);
      }
      try {
        setCaps(await nuwa.characters.detectCapabilities());
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

  async function runProbe(): Promise<void> {
    setProbe({ state: "running" });
    const r = await nuwa.characters.probeWebSearch();
    setProbe({
      state: "done",
      ok: r.ok,
      realWebSearch: r.realWebSearch,
      citations: r.citations,
      latencyMs: r.latencyMs,
      reason: r.reason
    });
    if (r.ok && !r.realWebSearch) {
      showToast({
        kind: "warn",
        text: "代理返回了内容但没有 url_citation —— 当前 baseUrl 实际不支持真联网，深度造人结果可能基于训练知识"
      });
    } else if (r.ok && r.realWebSearch) {
      showToast({
        kind: "success",
        text: `真联网验证通过：拿到 ${r.citations} 个 URL`
      });
    } else {
      showToast({ kind: "error", text: r.reason ?? "实测失败" });
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setStatus({ kind: "running" });
    const r = await nuwa.llm.setProvider({
      kind,
      baseUrl,
      model,
      visionModel: visionModel.trim() || DEFAULT_VISION_MODEL,
      apiKey
    });
    if (!r.ok) {
      setBusy(false);
      setStatus({ kind: "error", message: r.error ?? "保存失败" });
      showToast({ kind: "error", text: r.error ?? "保存失败" });
      return;
    }
    const t = await nuwa.llm.testConnection();
    setBusy(false);
    if (t.ok) {
      setStatus({ kind: "ok", latency: t.latencyMs });
      showToast({ kind: "success", text: `连通成功（${t.latencyMs ?? "?"} ms）` });
    } else {
      setStatus({ kind: "error", message: t.error ?? "测试失败" });
      showToast({ kind: "error", text: `测试失败：${t.error ?? ""}` });
    }
    // 重新检测能力
    try {
      setCaps(await nuwa.characters.detectCapabilities());
    } catch {
      // ignore
    }
  }

  async function saveImageConfig(): Promise<void> {
    setImageBusy("save");
    const payload: ImageGenerationConfigDTO = {
      ...imageConfig,
      apiKey: imageConfig.useLLMProvider ? undefined : imageApiKeyDraft || undefined
    };
    const r = await nuwa.imageGen.setConfig(payload);
    if (!r.ok) {
      setImageStatus({ kind: "error", reason: r.error ?? "保存失败" });
      showToast({ kind: "error", text: r.error ?? "保存失败" });
      setImageBusy(null);
      return;
    }
    const cap = await nuwa.imageGen.detectCapability();
    setImageStatus(cap.ok ? { kind: "ok", reason: cap.reason } : { kind: "error", reason: cap.reason });
    setImageBusy(null);
    showToast({ kind: cap.ok ? "success" : "warn", text: cap.reason });
  }

  async function testImageTier(tier: ImageTierName): Promise<void> {
    setImageBusy(tier);
    const r = await nuwa.imageGen.test(tier);
    setImageBusy(null);
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
    await nuwa.llm.clearKey();
    setApiKey("");
    setStatus({ kind: "idle" });
    setCaps(null);
    showToast({ kind: "info", text: "Key 已清除" });
  }

  const keyMasked = apiKey.length > 6 ? `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}` : "";

  return (
    <div>
      <div className="eyebrow">Provider</div>
      <div className="display display--page" style={{ marginBottom: 18 }}>
        模型与 API Key
      </div>
      <div
        className="card"
        style={{
          padding: 26,
          display: "grid",
          gap: 14,
          maxWidth: 720
        }}
      >
        <p className="body-md" style={{ margin: 0 }}>
          所有调用从这台电脑直接发出；Key 用 DPAPI 加密落盘。
        </p>

        {/* 当前状态摘要 */}
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "var(--paper-deep)",
            border: "1px solid var(--grid)"
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            当前状态
          </div>
          <div className="stack stack--sm">
            <StatusRow label="模型 / 连接">
              {status.kind === "running" ? (
                <span className="row gap-2">
                  <Spinner magenta />
                  <span className="body-sm">正在 ping…</span>
                </span>
              ) : status.kind === "ok" ? (
                <StatusDot kind="ok" label={`连通成功 · ${status.latency ?? "?"} ms`} />
              ) : status.kind === "error" ? (
                <StatusDot kind="error" label={status.message} />
              ) : apiKey ? (
                <StatusDot kind="idle" label={`已配置 · ${keyMasked}`} />
              ) : (
                <StatusDot kind="warn" label="未配置" />
              )}
            </StatusRow>
            <StatusRow label="联网能力（静态）">
              {caps ? (
                <StatusDot
                  kind={caps.webSearch ? "ok" : "warn"}
                  label={caps.webSearch ? "声明支持" : caps.reason}
                />
              ) : (
                <span className="body-sm">点"保存并测试"后探测</span>
              )}
            </StatusRow>
            <StatusRow label="联网真实性（实测）">
              {probe?.state === "running" ? (
                <span className="row gap-2">
                  <Spinner magenta />
                  <span className="body-sm">正在 ping…</span>
                </span>
              ) : probe?.state === "done" ? (
                probe.ok && probe.realWebSearch ? (
                  <StatusDot
                    kind="ok"
                    label={`真联网 · ${probe.citations} 引用 · ${probe.latencyMs ?? "?"} ms`}
                  />
                ) : probe.ok && !probe.realWebSearch ? (
                  <StatusDot
                    kind="warn"
                    label="代理吞 annotations · 实际不联网"
                  />
                ) : (
                  <StatusDot kind="error" label={probe.reason ?? "失败"} />
                )
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void runProbe()}
                  disabled={!apiKey}
                  data-hint={
                    !apiKey
                      ? "先填 API Key"
                      : "发一个最小 search ping 测试代理是否真返回 url_citation"
                  }
                >
                  实测联网
                </button>
              )}
            </StatusRow>
          </div>
        </div>

        <div>
          <label className="eyebrow">协议</label>
          <select
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="openai-compatible">OpenAI 兼容</option>
            <option value="anthropic-compatible">Anthropic 兼容</option>
          </select>
        </div>
        <div>
          <label className="eyebrow">Base URL</label>
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com"
          />
        </div>
        <div>
          <label className="eyebrow">模型</label>
          <input
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-v4-flash / gpt-4o-mini / claude-3-5-sonnet ..."
          />
        </div>
        <div>
          <label className="eyebrow">参考图读图模型</label>
          <input
            className="input"
            value={visionModel}
            onChange={(e) => setVisionModel(e.target.value)}
            placeholder={DEFAULT_VISION_MODEL}
          />
          <p className="body-sm" style={{ margin: "4px 0 0" }}>
            上传参考图时用于 vision 读图 / 外貌自检，与主模型分离。OhMyGPT 推荐豆包 Seed 2.0 Lite。
          </p>
        </div>
        <div>
          <label className="eyebrow">API Key</label>
          <div className="input-group">
            <input
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
                data-hint={showKey ? "隐藏" : "显示"}
                aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </div>
          <p className="body-sm" style={{ margin: "4px 0 0" }}>
            Key 仅在保存时通过系统 DPAPI 加密落盘，渲染层不持有明文（除手动"显示"外）。
          </p>
        </div>

        <section className="settings-section" style={{ marginTop: 8 }}>
          <div className="section-heading">
            <div>
              <div className="eyebrow">Image Generation</div>
              <h2>桌宠生图档位</h2>
            </div>
            <span className="body-sm">
              hatch-pet 使用这里的配置生成 1 张 base + 9 行动作。
            </span>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__title">Provider</div>
              <div className="settings-row__desc">
                推荐复用 LLM Provider。标准 / 精品档默认 gpt-image-2（图像 token 更便宜）；经济档仍用 gpt-image-1-mini。若测试报「不支持透明背景」，请改回 gpt-image-1 或联系中转商。
              </div>
            </div>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={imageConfig.useLLMProvider}
                onChange={(e) =>
                  setImageConfig((prev) => ({ ...prev, useLLMProvider: e.target.checked }))
                }
              />
              复用 LLM Provider
            </label>
          </div>

          {!imageConfig.useLLMProvider ? (
            <>
              <div className="settings-row">
                <label className="settings-row__title" htmlFor="image-base-url">
                  Image Base URL
                </label>
                <input
                  id="image-base-url"
                  className="input input--inline"
                  value={imageConfig.baseUrl ?? ""}
                  onChange={(e) =>
                    setImageConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
                  }
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="settings-row">
                <label className="settings-row__title" htmlFor="image-api-key">
                  Image API Key
                </label>
                <input
                  id="image-api-key"
                  className="input input--inline"
                  type="password"
                  value={imageApiKeyDraft}
                  onChange={(e) => setImageApiKeyDraft(e.target.value)}
                  placeholder="留空则沿用已保存 key"
                  autoComplete="off"
                />
              </div>
            </>
          ) : null}

          <div className="settings-row">
            <div>
              <div className="settings-row__title">默认档位</div>
              <div className="settings-row__desc">新角色默认使用此档位生成桌宠。</div>
            </div>
            <div className="segmented">
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
            <div className="settings-note">
              {imageStatus.kind === "test"
                ? `${TIER_LABEL[imageStatus.tier]}档测试成功：${imageStatus.model ?? "unknown"} · ${imageStatus.latencyMs ?? "?"} ms · $${(imageStatus.cost ?? 0).toFixed(3)}`
                : imageStatus.reason}
            </div>
          ) : null}

          <div className="row row--end gap-2">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void nuwa.imageGen.clearKey()}
              disabled={imageConfig.useLLMProvider || imageBusy != null}
            >
              清除 Image Key
            </button>
            <button
              type="button"
              className="btn btn--magenta"
              onClick={() => void saveImageConfig()}
              disabled={imageBusy != null}
            >
              {imageBusy === "save" ? "保存中…" : "保存生图配置"}
            </button>
          </div>
        </section>

        <div className="row row--end gap-2">
          <button
            className="btn btn--danger btn--sm"
            onClick={() => void clear()}
            disabled={busy || !apiKey}
          >
            清除配置
          </button>
          <button
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
  );
}

function StatusRow({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="row row--between gap-2">
      <span className="body-sm" style={{ color: "var(--ink-faint)", minWidth: 84 }}>
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
