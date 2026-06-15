import { useEffect, useState } from "react";
import { STARTER_BUNDLES } from "@nuwa-pet/starter-library";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { useNuwa } from "../../shared/use-nuwa.js";
import { PetRenderer } from "../../shared/pet-renderer.js";
import { Spinner, StatusDot, useToast } from "../../shared/feedback.js";
import { PROVIDER_PRESETS, type ProviderPreset } from "../provider/presets.js";

interface SetupWizardProps {
  onDone(): void | Promise<void>;
}

type Step = "welcome" | "disclaimer" | "provider" | "starter";
const STEP_ORDER: Step[] = ["welcome", "disclaimer", "provider", "starter"];
const STEP_TITLE: Record<Step, string> = {
  welcome: "开始之前",
  disclaimer: "数据如何处理",
  provider: "接入你的 LLM",
  starter: "挑一只先上桌"
};

export function SetupWizard({ onDone }: SetupWizardProps): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");
  const stepIndex = STEP_ORDER.indexOf(step);

  function next() {
    const i = STEP_ORDER.indexOf(step);
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]!);
  }
  function back() {
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) setStep(STEP_ORDER[i - 1]!);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        background: "var(--paper)"
      }}
    >
      <section
        style={{
          padding: "56px 56px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 22
        }}
      >
        <div className="eyebrow">百灵 Bailin · Setup</div>
        <h1 className="display display--hero">
          把一个有立场的视角，<br />请到你的桌面上。
        </h1>
        <p className="body-md" style={{ maxWidth: 420 }}>
          四步搞定：免责声明 → 数据说明 → 连上你自己的 LLM → 选一只示例角色。所有数据留在这台机器，密钥用系统 DPAPI 加密。
        </p>
        <div className="row gap-1 body-sm">
          <span className="kbd">Ctrl</span>
          <span className="kbd">Shift</span>
          <span className="kbd">P</span>
          <span style={{ marginLeft: 6 }}>= 任意时刻唤起当前角色</span>
        </div>

        <div style={{ marginTop: "auto" }}>
          <div
            className="row row--between"
            style={{ marginBottom: 8, fontSize: 12, color: "var(--ink-faint)" }}
          >
            <span className="mono">第 {stepIndex + 1} / 4 步</span>
            <span>{STEP_TITLE[step]}</span>
          </div>
          <div className="steps">
            {STEP_ORDER.map((s, i) => (
              <div
                key={s}
                className={`steps__dot ${
                  i < stepIndex
                    ? "steps__dot--done"
                    : i === stepIndex
                      ? "steps__dot--active"
                      : ""
                }`}
              />
            ))}
          </div>
        </div>
      </section>
      <section
        style={{
          padding: "56px 48px",
          background: "var(--paper-deep)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          borderLeft: "1px solid var(--grid-strong)"
        }}
      >
        {step === "welcome" ? (
          <SimpleStep
            title={STEP_TITLE.welcome}
            body={`百灵 Bailin 不会替代真实的咨询、医疗或法律意见。它给你的是一位「受公开资料启发的视角助手」，不是本人，也不是官方授权。`}
            cta="同意，开始"
            onNext={next}
          />
        ) : null}
        {step === "disclaimer" ? (
          <SimpleStep
            title={STEP_TITLE.disclaimer}
            body="角色卡、像素桌宠、用户画像都默认存在本机；完整对话默认不保存；可一键清空所有数据。"
            cta="明白，下一步"
            onNext={next}
            onBack={back}
          />
        ) : null}
        {step === "provider" ? <ProviderStep onNext={next} onBack={back} /> : null}
        {step === "starter" ? <StarterStep onDone={onDone} onBack={back} /> : null}
      </section>
    </div>
  );
}

function SimpleStep({
  title,
  body,
  cta,
  onNext,
  onBack
}: {
  title: string;
  body: string;
  cta: string;
  onNext: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="card fade-in-up" style={{ padding: 26 }}>
      <div className="display display--section" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <p className="body-md" style={{ marginBottom: 6 }}>
        {body}
      </p>
      <div className="row row--between gap-2" style={{ marginTop: 22 }}>
        <div>
          {onBack ? (
            <button className="btn btn--ghost btn--sm" onClick={onBack}>
              ← 上一步
            </button>
          ) : null}
        </div>
        <button className="btn btn--magenta" onClick={onNext}>
          {cta}
        </button>
      </div>
    </div>
  );
}

function ProviderStep({
  onNext,
  onBack
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const nuwa = useNuwa();
  const { showToast } = useToast();
  const [kind, setKind] = useState<"openai-compatible" | "anthropic-compatible">(
    "openai-compatible"
  );
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; latency?: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function applyPreset(p: ProviderPreset) {
    setKind(p.kind);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setStatus({ kind: "idle" });
  }

  async function save(): Promise<void> {
    setBusy(true);
    setStatus({ kind: "running" });
    const r = await nuwa.llm.setProvider({ kind, baseUrl, model, apiKey });
    if (!r.ok) {
      setBusy(false);
      setStatus({ kind: "error", message: r.error ?? "保存失败" });
      return;
    }
    const test = await nuwa.llm.testConnection();
    setBusy(false);
    if (!test.ok) {
      setStatus({ kind: "error", message: test.error ?? "测试失败" });
      return;
    }
    setStatus({ kind: "ok", latency: test.latencyMs });
    showToast({ kind: "success", text: `连通成功（${test.latencyMs ?? "?"} ms）` });
    setTimeout(onNext, 500);
  }

  return (
    <div
      className="card fade-in-up"
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="display display--section">{STEP_TITLE.provider}</div>
      <p className="body-md" style={{ marginTop: -4 }}>
        我们不托管模型。把你自己的 Key 贴进来，所有调用都直接从这台电脑发出。
      </p>

      <div>
        <label className="eyebrow">常用提供商</label>
        <div
          className="row gap-2 row--wrap"
          style={{ marginTop: 6 }}
        >
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn btn--ghost btn--sm ${
                baseUrl === p.baseUrl && model === p.model ? "btn--magenta" : ""
              }`}
              onClick={() => applyPreset(p)}
              data-hint={p.note ?? ""}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="eyebrow">协议</label>
        <select
          className="select"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="openai-compatible">
            OpenAI 兼容（含 DeepSeek / Moonshot / SiliconFlow ...）
          </option>
          <option value="anthropic-compatible">Anthropic 兼容（Claude 系列）</option>
        </select>
      </div>
      <div>
        <label className="eyebrow">Base URL</label>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div>
        <label className="eyebrow">模型</label>
        <input
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
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
      </div>

      {status.kind !== "idle" ? (
        <div className="row gap-2" style={{ minHeight: 22 }}>
          {status.kind === "running" ? (
            <>
              <Spinner magenta />
              <span className="body-sm">正在 ping {baseUrl}...</span>
            </>
          ) : null}
          {status.kind === "ok" ? (
            <StatusDot kind="ok" label={`连通成功 · ${status.latency ?? "?"} ms`} />
          ) : null}
          {status.kind === "error" ? (
            <StatusDot kind="error" label={status.message} />
          ) : null}
        </div>
      ) : null}

      <div className="row row--between gap-2" style={{ marginTop: 6 }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          ← 上一步
        </button>
        <button
          className="btn btn--magenta"
          onClick={() => void save()}
          disabled={busy || !apiKey}
          data-hint={!apiKey ? "先填 API Key" : ""}
        >
          {busy ? "测试中…" : "保存并测试连通"}
        </button>
      </div>
    </div>
  );
}

function StarterStep({
  onDone,
  onBack
}: {
  onDone(): void | Promise<void>;
  onBack: () => void;
}) {
  const nuwa = useNuwa();
  const { showToast } = useToast();
  const [importing, setImporting] = useState<string | null>(null);

  async function pick(id: string) {
    setImporting(id);
    const r = await nuwa.characters.importStarter(id);
    if (r.ok) {
      showToast({ kind: "success", text: "角色已上桌" });
      await onDone();
    } else {
      showToast({ kind: "error", text: r.error ?? "导入失败" });
    }
    setImporting(null);
  }

  return (
    <div className="card fade-in-up" style={{ padding: 24 }}>
      <div className="display display--section" style={{ marginBottom: 4 }}>
        {STEP_TITLE.starter}
      </div>
      <p className="body-md">如果你不知道先造谁，下面是我们内置的 6 只。</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 14
        }}
      >
        {STARTER_BUNDLES.map((bundle: CharacterBundle, i) => (
          <button
            key={bundle.card.id}
            className="card card--interactive fade-in-up"
            style={{
              textAlign: "left",
              padding: 12,
              cursor: "pointer",
              background: "var(--paper)",
              animationDelay: `${i * 50}ms`,
              display: "flex",
              gap: 12,
              alignItems: "center"
            }}
            onClick={() => void pick(bundle.card.id)}
            disabled={importing != null}
            aria-busy={importing === bundle.card.id}
          >
            <div
              style={{
                width: 48,
                height: 48,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <PetRenderer program={bundle.sprite} width={48} height={48} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row row--between gap-2" style={{ marginBottom: 4 }}>
                <span
                  className="display display--section"
                  style={{ fontSize: 14, lineHeight: 1.15 }}
                >
                  {bundle.card.meta.name.replace(/ · 视角助手| · 灵感陪伴/, "")}
                </span>
                <span className={`badge badge--${bundle.card.meta.track}`}>
                  {bundle.card.meta.track === "utility" ? "实用" : "陪伴"}
                </span>
              </div>
              <p
                className="body-sm"
                style={{
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical"
                }}
              >
                {bundle.card.meta.quoteOneLiner ?? bundle.card.identity.selfIntro}
              </p>
              {importing === bundle.card.id ? (
                <span className="body-sm" style={{ color: "var(--magenta)" }}>
                  导入中…
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
      <div className="row row--between gap-2" style={{ marginTop: 16 }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          ← 上一步
        </button>
        <button className="btn btn--ghost" onClick={() => void onDone()}>
          跳过，自己造 →
        </button>
      </div>
    </div>
  );
}
