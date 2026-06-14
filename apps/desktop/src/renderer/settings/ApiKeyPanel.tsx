import { useEffect, useState } from "react";
import { useNuwa } from "../shared/use-nuwa.js";
import {
  Spinner,
  StatusDot,
  useConfirm,
  useToast
} from "../shared/feedback.js";

type Kind = "openai-compatible" | "anthropic-compatible";

export function ApiKeyPanel(): JSX.Element {
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [kind, setKind] = useState<Kind>("openai-compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
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
        | { kind: string; baseUrl: string; model: string; apiKey: string }
        | null;
      if (p) {
        setKind(p.kind as Kind);
        setBaseUrl(p.baseUrl);
        setModel(p.model);
        setApiKey(p.apiKey);
      }
      try {
        setCaps(await nuwa.characters.detectCapabilities());
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
    const r = await nuwa.llm.setProvider({ kind, baseUrl, model, apiKey });
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
            placeholder="gpt-4o-mini / deepseek-chat / claude-3-5-sonnet ..."
          />
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
