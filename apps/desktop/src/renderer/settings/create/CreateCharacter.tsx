import { useCallback, useEffect, useRef, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { DistillationProgress } from "../progress/DistillationProgress.js";
import { StatusDot, useToast } from "../../shared/feedback.js";

type Mode = "deep" | "quick";

const MAX_NAME = 40;
const MAX_USER_HINT = 200;
const MAX_USER_MATERIAL = 2000;
const MAX_REFERENCE_IMAGES = 4;
/** 单图大小上限（base64 字符长度，对应约 3MB 原图）。 */
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;

interface ReferenceImage {
  id: string;
  url: string; // https:// 或 data URI
  source: "user-upload" | "web";
  role: "primary" | "reference";
  label: string;
}

export function CreateCharacter({ onDone }: { onDone: () => void }): JSX.Element {
  const nuwa = useNuwa();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [sourceType, setSourceType] =
    useState<"public-figure" | "fictional" | "original">("public-figure");
  const [track, setTrack] = useState<"utility" | "companion">("utility");
  const [userHint, setUserHint] = useState("");
  const [userMaterial, setUserMaterial] = useState("");
  const [userImageRef, setUserImageRef] = useState("");
  const [mode, setMode] = useState<Mode>("deep");
  const [concurrency, setConcurrency] = useState(2);
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [researchModel, setResearchModel] = useState("gpt-4o-mini-search-preview");
  const [caps, setCaps] = useState<{ webSearch: boolean; reason: string } | null>(null);
  const [vision, setVision] = useState<{ vision: boolean; reason: string } | null>(null);
  const [probe, setProbe] = useState<
    | null
    | { ok: boolean; realWebSearch: boolean; citations: number; reason?: string }
  >(null);
  const [visionProbe, setVisionProbe] = useState<
    | null
    | { ok: boolean; reason?: string }
  >(null);
  const [probing, setProbing] = useState(false);
  const [visionProbing, setVisionProbing] = useState(false);

  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skeletonNote, setSkeletonNote] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [c, v] = await Promise.all([
          nuwa.characters.detectCapabilities(),
          nuwa.characters.detectVisionCapability()
        ]);
        setCaps(c);
        setVision(v);
        if (!c.webSearch) {
          setEnableWebSearch(false);
          if (mode === "deep") setMode("quick");
        }
      } catch {
        // ignore
      }
    })();
  }, [nuwa]);

  async function runVisionProbe(): Promise<void> {
    setVisionProbing(true);
    try {
      const r = await nuwa.characters.probeVision();
      setVisionProbe({ ok: r.ok, reason: r.reason });
      if (r.ok) {
        showToast({ kind: "success", text: "视觉能力实测通过，可上传参考图" });
      } else {
        showToast({
          kind: "warn",
          text: r.reason ?? "当前模型/代理拒绝多模态请求；参考图将被忽略"
        });
      }
    } finally {
      setVisionProbing(false);
    }
  }

  const addReferenceImage = useCallback(
    (img: Omit<ReferenceImage, "id" | "role">) => {
      setReferenceImages((prev) => {
        if (prev.length >= MAX_REFERENCE_IMAGES) {
          showToast({
            kind: "warn",
            text: `最多上传 ${MAX_REFERENCE_IMAGES} 张参考图`
          });
          return prev;
        }
        const role: ReferenceImage["role"] = prev.length === 0 ? "primary" : "reference";
        return [
          ...prev,
          { ...img, id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role }
        ];
      });
    },
    [showToast]
  );

  const removeReferenceImage = useCallback((id: string) => {
    setReferenceImages((prev) => {
      const next = prev.filter((r) => r.id !== id);
      // 重新分配 primary
      if (next.length > 0 && !next.some((r) => r.role === "primary")) {
        next[0] = { ...next[0]!, role: "primary" };
      }
      return next;
    });
  }, []);

  const setPrimary = useCallback((id: string) => {
    setReferenceImages((prev) =>
      prev.map((r) => ({
        ...r,
        role: r.id === id ? "primary" : "reference"
      }))
    );
  }, []);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;
      if (!/^image\//.test(file.type)) {
        showToast({ kind: "warn", text: `${file.name} 不是图片，已跳过` });
        continue;
      }
      if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
        showToast({
          kind: "warn",
          text: `${file.name} 超过 ${Math.round(MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024)}MB，已跳过`
        });
        continue;
      }
      const dataUri = await readAsDataUri(file);
      addReferenceImage({
        url: dataUri,
        source: "user-upload",
        label: file.name
      });
    }
  }

  function handleAddUrl(): void {
    const url = urlDraft.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      showToast({ kind: "warn", text: "请填入 http(s):// 开头的图片 URL" });
      return;
    }
    addReferenceImage({ url, source: "web", label: shortLabelFromUrl(url) });
    setUrlDraft("");
  }

  async function runProbe(): Promise<void> {
    setProbing(true);
    try {
      const r = await nuwa.characters.probeWebSearch();
      setProbe({
        ok: r.ok,
        realWebSearch: r.realWebSearch,
        citations: r.citations,
        reason: r.reason
      });
      if (r.ok && !r.realWebSearch) {
        showToast({
          kind: "warn",
          text: "代理实际不返回 url_citation：可联网模型变成了 \"凭训练知识硬编\""
        });
      } else if (r.ok) {
        showToast({
          kind: "success",
          text: `真联网验证通过 · ${r.citations} 引用`
        });
      } else {
        showToast({ kind: "error", text: r.reason ?? "实测失败" });
      }
    } finally {
      setProbing(false);
    }
  }

  const trimmedName = name.trim();
  const deepDisabled = caps != null && !caps.webSearch;
  const submitDisabledHint =
    trimmedName.length === 0
      ? "先填角色名"
      : deepDisabled && mode === "deep"
        ? "当前 LLM 不支持联网"
        : "";

  async function submitQuick(): Promise<void> {
    setBusy(true);
    setWarnings([]);
    setSkeletonNote(null);
    const r = await nuwa.characters.create({
      characterName: trimmedName,
      sourceType,
      track,
      userHint: userHint.trim() || undefined,
      userMaterial: userMaterial.trim() || undefined,
      referenceImages: referenceImagesForIpc()
    });
    setBusy(false);
    if (!r.ok) {
      showToast({ kind: "error", text: r.error ?? "创建失败" });
      return;
    }
    const ws = r.warnings ?? [];
    if (r.isSkeleton) {
      setSkeletonNote(
        "3 步全部失败，已落地为骨架角色。请检查模型 / 网络后在角色仓库中点「重新生成形象」。"
      );
    }
    if (ws.length > 0) {
      setWarnings(ws);
      showToast({
        kind: "warn",
        text: `创建完成，但有 ${ws.length} 条警告`
      });
      return;
    }
    showToast({ kind: "success", text: "角色已上桌" });
    onDone();
  }

  async function submitDeep(): Promise<void> {
    setBusy(true);
    const r = await nuwa.characters.createDeep({
      characterName: trimmedName,
      sourceType,
      track,
      enableWebSearch,
      concurrency,
      agentTimeoutMs: 300000,
      researchModel,
      userHint: userHint.trim() || undefined,
      userMaterial: userMaterial.trim() || undefined,
      userImageRef: userImageRef.trim() || undefined,
      referenceImages: referenceImagesForIpc()
    });
    setBusy(false);
    if (!r.ok || !r.jobId) {
      showToast({ kind: "error", text: r.error ?? "深度蒸馏启动失败" });
      return;
    }
    setRunningJobId(r.jobId);
  }

  function submit(): void {
    if (trimmedName.length === 0) return;
    if (mode === "deep") void submitDeep();
    else void submitQuick();
  }

  function referenceImagesForIpc(): Array<{
    url: string;
    source: "user-upload" | "web";
    role: "primary" | "reference";
    notes: string;
  }> {
    return referenceImages.map((r) => ({
      url: r.url,
      source: r.source,
      role: r.role,
      notes: r.label
    }));
  }

  if (runningJobId) {
    return (
      <DistillationProgress
        jobId={runningJobId}
        characterName={trimmedName}
        onComplete={() => onDone()}
        onCancel={() => {
          void nuwa.characters.cancelDistillation(runningJobId);
          setRunningJobId(null);
        }}
      />
    );
  }

  return (
    <div>
      <div className="eyebrow">Forge</div>
      <div className="display display--page" style={{ marginBottom: 18 }}>
        造一个角色
      </div>

      <form
        className="card stack stack--lg"
        style={{ padding: 24 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* 模式 */}
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend className="eyebrow" style={{ marginBottom: 8 }}>
            蒸馏模式
          </legend>
          <div className="row gap-2">
            <ModeCard
              active={mode === "deep"}
              disabled={deepDisabled}
              onClick={() => !deepDisabled && setMode("deep")}
              title="深度"
              caption="5-15 分钟 · 对齐女娲完整流程 · 需联网"
            />
            <ModeCard
              active={mode === "quick"}
              onClick={() => setMode("quick")}
              title="快速"
              caption="60-120 秒 · 纯训练知识"
            />
          </div>
          {caps && !caps.webSearch ? (
            <div className="row gap-2" style={{ marginTop: 8 }}>
              <StatusDot kind="warn" />
              <span className="body-sm">当前 LLM 不支持联网：{caps.reason}</span>
            </div>
          ) : null}

          {mode === "deep" && caps?.webSearch ? (
            <div
              className="row gap-2 row--wrap"
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                background: probe?.ok && !probe.realWebSearch
                  ? "rgba(178, 24, 88, 0.08)"
                  : "rgba(31, 58, 58, 0.04)",
                border: `1px solid ${
                  probe?.ok && !probe.realWebSearch
                    ? "var(--magenta-soft)"
                    : "var(--grid-strong)"
                }`
              }}
            >
              {probe == null ? (
                <>
                  <span className="body-sm" style={{ flex: 1 }}>
                    深度版依赖联网搜索。OhMyGPT 等中转可能"声明支持但实际吞 annotations"，
                    建议先实测一次。
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void runProbe()}
                    disabled={probing}
                  >
                    {probing ? "测试中…" : "实测联网"}
                  </button>
                </>
              ) : probe.ok && probe.realWebSearch ? (
                <>
                  <StatusDot kind="ok" />
                  <span className="body-sm">
                    真联网验证通过 · 拿到 {probe.citations} 个 URL
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void runProbe()}
                    disabled={probing}
                    style={{ marginLeft: "auto" }}
                  >
                    重测
                  </button>
                </>
              ) : probe.ok && !probe.realWebSearch ? (
                <>
                  <StatusDot kind="warn" />
                  <span className="body-sm" style={{ flex: 1 }}>
                    <strong>当前 baseUrl 实际不联网</strong>：代理返回了内容但没有 url_citation。
                    深度蒸馏会回退到"模型训练知识"，结果可能不可信。
                    建议在 模型 / API Key 页换成 OpenAI / Anthropic 直连。
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void runProbe()}
                    disabled={probing}
                  >
                    重测
                  </button>
                </>
              ) : (
                <>
                  <StatusDot kind="error" />
                  <span className="body-sm">实测失败：{probe.reason ?? "未知"}</span>
                </>
              )}
            </div>
          ) : null}
        </fieldset>

        {/* 视觉能力状态条 */}
        {vision ? (
          <div
            className="row gap-2"
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: vision.vision
                ? "rgba(60, 130, 90, 0.06)"
                : "rgba(178, 24, 88, 0.06)",
              border: `1px solid ${
                vision.vision ? "rgba(60, 130, 90, 0.25)" : "var(--magenta-soft)"
              }`,
              alignItems: "center"
            }}
          >
            <StatusDot kind={vision.vision ? "ok" : "warn"} />
            <span className="body-sm" style={{ flex: 1 }}>
              视觉能力：{vision.vision ? "已识别为支持" : "未识别为支持"} · {vision.reason}
            </span>
            {visionProbe ? (
              <span
                className="body-sm"
                style={{
                  color: visionProbe.ok ? "var(--ink)" : "var(--magenta)",
                  fontWeight: 600
                }}
              >
                实测：{visionProbe.ok ? "通过" : visionProbe.reason ?? "失败"}
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void runVisionProbe()}
              disabled={visionProbing}
            >
              {visionProbing ? "实测中…" : visionProbe ? "重测" : "实测视觉"}
            </button>
          </div>
        ) : null}

        {/* 基本信息 */}
        <fieldset
          style={{
            border: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 12
          }}
        >
          <legend className="eyebrow" style={{ marginBottom: 8 }}>
            基本信息
          </legend>
          <CountedField
            label="角色名"
            hint="建议 中文 2-6 字 / 英文 ≤ 30 字"
            value={name}
            onChange={setName}
            max={MAX_NAME}
            placeholder="例如：芒格 / 张小龙 / 绫波丽"
            autoFocus
          />
          <div className="row gap-3">
            <div style={{ flex: 1 }}>
              <label className="eyebrow">来源类型</label>
              <select
                className="select"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
              >
                <option value="public-figure">公众人物（真人，受其启发）</option>
                <option value="fictional">虚构 / 二次元角色</option>
                <option value="original">原创角色</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="eyebrow">定位</label>
              <select
                className="select"
                value={track}
                onChange={(e) => setTrack(e.target.value as typeof track)}
              >
                <option value="utility">实用 · 思维顾问</option>
                <option value="companion">陪伴 · 情感角色</option>
              </select>
            </div>
          </div>
        </fieldset>

        {/* 参考图（vision pipeline 的关键输入） */}
        <fieldset
          style={{
            border: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 8
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleFiles(e.dataTransfer?.files ?? null);
          }}
        >
          <legend className="eyebrow" style={{ marginBottom: 4 }}>
            参考图 · 可选（上传 / 拖拽 / 粘贴 URL）
          </legend>
          <p className="body-sm" style={{ margin: 0, color: "var(--ink-soft)" }}>
            上传 1-{MAX_REFERENCE_IMAGES} 张角色图能让形象比文字描述准 10 倍。
            没上传时，若启用联网，会自动搜官方人设图。
            {vision && !vision.vision ? (
              <span style={{ color: "var(--magenta)" }}>
                {" "}视觉读图模型不可用，上传的图会被忽略（可在设置 → Provider 配置参考图读图模型）。
              </span>
            ) : null}
          </p>
          <div className="row gap-2 row--wrap">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={referenceImages.length >= MAX_REFERENCE_IMAGES}
            >
              选择图片文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <div className="row gap-2" style={{ flex: 1, minWidth: 240 }}>
              <input
                className="input"
                placeholder="或粘贴图片 URL（https://...）"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddUrl();
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleAddUrl}
                disabled={
                  urlDraft.trim().length === 0 ||
                  referenceImages.length >= MAX_REFERENCE_IMAGES
                }
              >
                添加 URL
              </button>
            </div>
          </div>
          {referenceImages.length > 0 ? (
            <div className="row gap-2 row--wrap" style={{ marginTop: 4 }}>
              {referenceImages.map((img) => (
                <ReferenceThumb
                  key={img.id}
                  img={img}
                  onRemove={() => removeReferenceImage(img.id)}
                  onSetPrimary={() => setPrimary(img.id)}
                />
              ))}
            </div>
          ) : null}
        </fieldset>

        {/* 深度版参数（默认折叠） */}
        {mode === "deep" ? (
          <details
            className="card fade-in"
            style={{
              padding: 14,
              background: "rgba(178,24,88,0.04)",
              border: "1px solid var(--magenta-soft)"
            }}
          >
            <summary
              className="eyebrow"
              style={{ cursor: "pointer", userSelect: "none", marginBottom: 8 }}
            >
              深度版参数（高级，可不动）
            </summary>
            <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
              <label className="row gap-2" style={{ alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={enableWebSearch}
                  onChange={(e) => setEnableWebSearch(e.target.checked)}
                  disabled={deepDisabled}
                />
                <span>启用联网搜索（用模型原生 web_search）</span>
              </label>
              <div>
                <label className="eyebrow">并发数（1-6）</label>
                <div className="row gap-2" style={{ marginTop: 6 }}>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={1}
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                    style={{ flex: 1 }}
                  />
                  <span className="mono" style={{ minWidth: 22, textAlign: "right" }}>
                    {concurrency}
                  </span>
                </div>
              </div>
              <div>
                <label className="eyebrow">调研模型</label>
                <select
                  className="select"
                  value={researchModel}
                  onChange={(e) => setResearchModel(e.target.value)}
                  disabled={!enableWebSearch || deepDisabled}
                >
                  <option value="gpt-4o-mini-search-preview">
                    gpt-4o-mini-search-preview · 推荐（最便宜）
                  </option>
                  <option value="gpt-4o-search-preview">
                    gpt-4o-search-preview · 质量更高
                  </option>
                  <option value="gpt-5-search-api">
                    gpt-5-search-api · 实验性
                  </option>
                  <option value="claude-haiku-4-5">
                    claude-haiku-4-5 · Anthropic 路线
                  </option>
                </select>
                <p className="body-sm" style={{ margin: "4px 0 0" }}>
                  只影响 6 路调研 + 外貌联网搜图；其他阶段沿用主模型。
                </p>
              </div>
              <CountedField
                label="参考图 URL（可选）"
                hint="深度外貌阶段会优先采用"
                value={userImageRef}
                onChange={setUserImageRef}
                max={500}
                placeholder="例如：https://example.com/portrait.jpg"
              />
            </div>
          </details>
        ) : null}

        {/* 补充信息（折叠） */}
        <details>
          <summary
            className="eyebrow"
            style={{ cursor: "pointer", userSelect: "none", marginBottom: 8 }}
          >
            可选：补充外貌 / 文本素材
          </summary>
          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
            <CountedField
              label="外貌补充"
              hint="一句话即可，权威性高于训练知识"
              value={userHint}
              onChange={setUserHint}
              max={MAX_USER_HINT}
              placeholder="例如：短发 / 黑色高领毛衣 / 红色领带 / 戴眼镜"
            />
            <CountedTextarea
              label="文本素材"
              hint="一段访谈、博客、设定集摘录都可以。素材会留在本机，仅用于这次造人。"
              value={userMaterial}
              onChange={setUserMaterial}
              max={MAX_USER_MATERIAL}
              placeholder="粘贴 ≤ 2000 字的补充素材..."
            />
          </div>
        </details>

        {/* 失败回退提示 */}
        {skeletonNote ? (
          <div
            className="fade-in"
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(178, 24, 88, 0.08)",
              border: "1px solid var(--magenta-soft)"
            }}
          >
            <strong style={{ color: "var(--magenta)" }}>骨架角色</strong>
            <p className="body-sm" style={{ margin: "4px 0 0", color: "var(--ink-soft)" }}>
              {skeletonNote}
            </p>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <details
            open
            className="fade-in"
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(31,58,58,0.04)",
              border: "1px solid var(--grid-strong)"
            }}
          >
            <summary className="eyebrow" style={{ cursor: "pointer" }}>
              蒸馏过程的 {warnings.length} 条警告
            </summary>
            <ul className="body-sm" style={{ margin: "8px 0 0 16px", padding: 0 }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <code style={{ fontFamily: "var(--font-mono)" }}>{w}</code>
                </li>
              ))}
            </ul>
            <div className="row row--end gap-2" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onDone()}
              >
                知道了，进角色仓库
              </button>
            </div>
          </details>
        ) : null}

        {/* 行动栏 */}
        <div className="row row--between" style={{ marginTop: 4 }}>
          <p className="body-sm" style={{ margin: 0, maxWidth: 420 }}>
            {mode === "deep"
              ? "深度版会跑 6 路并行调研 + 2 个用户确认点 + 外貌三步法 + 自检。"
              : "快速版仅 1-3 次 LLM 调用；约 30~120 秒；纯靠模型训练知识。"}
          </p>
          <button
            type="submit"
            className="btn btn--magenta"
            disabled={busy || trimmedName.length === 0 || (mode === "deep" && deepDisabled)}
            data-hint={submitDisabledHint}
          >
            {busy ? "启动中…" : mode === "deep" ? "开始深度蒸馏" : "开始造人"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeCard({
  active,
  disabled,
  onClick,
  title,
  caption
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  caption: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${active ? "var(--magenta)" : "var(--grid-strong)"}`,
        background: active ? "rgba(178,24,88,0.06)" : "var(--paper)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition:
          "border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)"
      }}
    >
      <div
        className="display display--section"
        style={{
          fontSize: 16,
          color: active ? "var(--magenta)" : "var(--ink)",
          marginBottom: 2
        }}
      >
        {title}
      </div>
      <div className="body-sm" style={{ margin: 0 }}>
        {caption}
      </div>
    </button>
  );
}

function CountedField({
  label,
  hint,
  value,
  onChange,
  max,
  placeholder,
  autoFocus
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const overflow = value.length > max;
  const warn = !overflow && value.length > max * 0.9;
  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 4 }}>
        <label className="eyebrow">{label}</label>
        <span
          className={`char-count ${warn ? "char-count--warn" : ""} ${
            overflow ? "char-count--danger" : ""
          }`}
        >
          {value.length} / {max}
        </span>
      </div>
      <input
        className={`input ${overflow ? "input--invalid" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={max + 80}
      />
      {hint ? (
        <p className="body-sm" style={{ margin: "4px 0 0" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ReferenceThumb({
  img,
  onRemove,
  onSetPrimary
}: {
  img: ReferenceImage;
  onRemove: () => void;
  onSetPrimary: () => void;
}) {
  const isPrimary = img.role === "primary";
  return (
    <div
      style={{
        position: "relative",
        width: 96,
        height: 96,
        borderRadius: 10,
        overflow: "hidden",
        border: `2px solid ${isPrimary ? "var(--magenta)" : "var(--grid-strong)"}`,
        background: "var(--paper)"
      }}
      title={img.label}
    >
      <img
        src={img.url}
        alt={img.label}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block"
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "2px 4px",
          background: "rgba(0,0,0,0.55)",
          color: "white",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          gap: 4
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isPrimary ? "主图" : img.source === "user-upload" ? "本地" : "URL"}
        </span>
        {!isPrimary ? (
          <button
            type="button"
            onClick={onSetPrimary}
            style={{
              background: "none",
              border: "none",
              color: "white",
              padding: 0,
              cursor: "pointer",
              fontSize: 10
            }}
            title="设为主图"
          >
            ★
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: "none",
            border: "none",
            color: "white",
            padding: 0,
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1
          }}
          title="移除"
        >
          ×
        </button>
      </div>
    </div>
  );
}

async function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function shortLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
    return last.slice(0, 32);
  } catch {
    return url.slice(0, 32);
  }
}

function CountedTextarea({
  label,
  hint,
  value,
  onChange,
  max,
  placeholder
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
}) {
  const overflow = value.length > max;
  const warn = !overflow && value.length > max * 0.9;
  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 4 }}>
        <label className="eyebrow">{label}</label>
        <span
          className={`char-count ${warn ? "char-count--warn" : ""} ${
            overflow ? "char-count--danger" : ""
          }`}
        >
          {value.length} / {max}
        </span>
      </div>
      <textarea
        className={`textarea ${overflow ? "textarea--invalid" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={max + 200}
      />
      {hint ? (
        <p className="body-sm" style={{ margin: "4px 0 0" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
