import { useEffect, useMemo, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { useDirtyTracker } from "../app/dirty-context.js";

interface Profile {
  preferredName?: string;
  currentGoals: string[];
  ongoingConcerns: string[];
  tabooTopics: string[];
}

const EMPTY: Profile = {
  currentGoals: [],
  ongoingConcerns: [],
  tabooTopics: []
};

const MAX_NAME = 24;

function profileKey(p: Profile): string {
  return JSON.stringify({
    preferredName: p.preferredName ?? "",
    currentGoals: p.currentGoals,
    ongoingConcerns: p.ongoingConcerns,
    tabooTopics: p.tabooTopics
  });
}

export function MemoryPanel(): JSX.Element {
  const nuwa = useNuwa();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [initial, setInitial] = useState<Profile>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function reload(): Promise<void> {
    try {
      const p = (await nuwa.memory.getProfile()) as Profile;
      setProfile(p);
      setInitial(p);
    } catch (e) {
      showToast({
        kind: "error",
        text: `读取画像失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void reload();
  }, [nuwa]);

  const dirty = useMemo(
    () => loaded && profileKey(profile) !== profileKey(initial),
    [profile, initial, loaded]
  );

  useDirtyTracker(dirty);

  async function save(): Promise<void> {
    setSaving(true);
    const clean: Profile = {
      preferredName: profile.preferredName?.trim() || undefined,
      currentGoals: profile.currentGoals.map((s) => s.trim()).filter(Boolean),
      ongoingConcerns: profile.ongoingConcerns.map((s) => s.trim()).filter(Boolean),
      tabooTopics: profile.tabooTopics.map((s) => s.trim()).filter(Boolean)
    };
    try {
      await nuwa.memory.updateProfile(clean);
      setProfile(clean);
      setInitial(clean);
      showToast({ kind: "success", text: "画像已保存，下次对话立刻生效" });
    } catch (e) {
      showToast({
        kind: "error",
        text: `保存失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    } finally {
      setSaving(false);
    }
  }

  function discard(): void {
    setProfile(initial);
  }

  async function clearProfile(): Promise<void> {
    const ok = await confirm({
      title: "清空用户画像？",
      body: (
        <span>
          清空后，角色对你的称呼、知道的目标 / 烦恼 / 禁忌都会消失。
          <p style={{ marginTop: 8, color: "var(--ink-soft)" }}>
            角色仓库与对话历史不受影响。
          </p>
        </span>
      ),
      confirmLabel: "清空画像",
      cancelLabel: "再想想",
      danger: true
    });
    if (!ok) return;
    setClearing(true);
    try {
      await nuwa.memory.clearProfile();
      setProfile(EMPTY);
      setInitial(EMPTY);
      showToast({ kind: "info", text: "画像已清空" });
    } catch (e) {
      showToast({
        kind: "error",
        text: `清空失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    } finally {
      setClearing(false);
    }
  }

  async function clearAll(): Promise<void> {
    const ok = await confirm({
      title: "清空全部本地数据？",
      body: (
        <span>
          这会同时删除：
          <ul style={{ margin: "6px 0 0 18px", padding: 0, color: "var(--ink-soft)" }}>
            <li>所有角色 / 像素桌宠 / 调研档案</li>
            <li>用户画像 / 对话历史</li>
            <li>设置 / API Key 引用 / 蒸馏任务记录</li>
          </ul>
          <p style={{ marginTop: 8 }}>该操作不可恢复。</p>
        </span>
      ),
      confirmLabel: "清空全部",
      cancelLabel: "再想想",
      danger: true,
      requireText: "DELETE"
    });
    if (!ok) return;
    setClearing(true);
    try {
      await nuwa.memory.clearAll();
      setProfile(EMPTY);
      setInitial(EMPTY);
      showToast({ kind: "info", text: "已清空全部本地数据" });
    } catch (e) {
      showToast({
        kind: "error",
        text: `清空失败：${e instanceof Error ? e.message : "未知错误"}`
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">Memory</div>
        <div className="display display--page">用户画像</div>
        <p className="apple-page-subtitle">
          这些偏好会轻轻进入每次对话，让角色更像是在和“你”说话。
        </p>
      </div>

      <div style={{ maxWidth: 760 }}>
        <div className="row row--between gap-3" style={{ alignItems: "flex-start", marginBottom: 24 }}>
          <p className="body-md" style={{ margin: 0, maxWidth: 480 }}>
            建议至少填一下“称呼”。其余内容可以以后慢慢加，角色会在对话里自然参考。
          </p>
          <div className="row gap-2 row--wrap" style={{ justifyContent: "flex-end" }}>
            <span className="bl-tag">称呼</span>
            <span className="bl-tag">目标</span>
            <span className="bl-tag">避讳</span>
          </div>
        </div>

        {/* —————— 称呼（hero 字段） —————— */}
        <div style={{ marginBottom: 26 }}>
          <label htmlFor="memory-name" className="bl-field-label bl-field-label--with-hint">
            称呼
          </label>
          <p className="bl-field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
            角色每次对话都会这样叫你
          </p>
          <input
            id="memory-name"
            className="forge-field-name__input"
            value={profile.preferredName ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, preferredName: e.target.value })
            }
            placeholder="小明 / 老王 / 同学"
            maxLength={MAX_NAME + 10}
            style={{ fontSize: "clamp(22px, 2.4vw, 28px)" }}
          />
        </div>

        {/* —————— 三组列表字段 —————— */}
        <div className="apple-list-group">
          <ListField
            label="当前目标"
            hint="桌宠会在意你最近在做什么。对话 prompt 仅使用前 3 条。"
            emptyHint="还没记下任何目标"
            placeholder="例如：找下一份工作 / 跑半马"
            values={profile.currentGoals}
            onChange={(v) => setProfile({ ...profile, currentGoals: v })}
          />
          <ListField
            label="长期烦恼"
            hint="桌宠在你低落时会更柔软地回应。对话 prompt 仅使用前 3 条。"
            emptyHint="还没记下任何烦恼"
            placeholder="例如：跟父母关系紧张 / 失眠"
            values={profile.ongoingConcerns}
            onChange={(v) => setProfile({ ...profile, ongoingConcerns: v })}
          />
          <ListField
            label="禁忌话题"
            hint="角色会尽量避开这些话题（软约束，不保证 100% 遵守）。"
            emptyHint="还没标注禁忌话题"
            placeholder="例如：抑郁症 / 前任"
            values={profile.tabooTopics}
            onChange={(v) => setProfile({ ...profile, tabooTopics: v })}
            tone="caution"
          />
        </div>

        {/* —————— action bar —————— */}
        <div className="bl-action-bar">
          <div className="bl-action-bar__left">
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => void clearProfile()}
              disabled={clearing}
            >
              清空画像
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void clearAll()}
              disabled={clearing}
            >
              全部数据…
            </button>
          </div>
          <div className="bl-action-bar__right">
            {dirty ? <span className="bl-dirty-dot">未保存</span> : null}
            {dirty ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={discard}
                disabled={saving}
              >
                放弃
              </button>
            ) : null}
            {dirty ? (
              <button
                type="button"
                className="btn btn--magenta"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? "保存中…" : "保存修改"}
              </button>
            ) : (
              <span className="body-sm" style={{ color: "var(--ink-faint)" }}>
                已同步
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListField({
  label,
  hint,
  emptyHint,
  placeholder,
  values,
  onChange,
  tone
}: {
  label: string;
  hint?: string;
  emptyHint: string;
  placeholder?: string;
  values: string[];
  onChange(v: string[]): void;
  tone?: "default" | "caution";
}) {
  const isCaution = tone === "caution";
  return (
    <div className="apple-list-row">
      <label className="bl-field-label bl-field-label--with-hint">
        {label}
        {isCaution ? (
          <span
            className="bl-tag"
            style={{ marginLeft: 8, fontSize: 10.5, padding: "2px 7px" }}
          >
            软约束
          </span>
        ) : null}
      </label>
      {hint ? <p className="bl-field-hint">{hint}</p> : null}
      <div className="stack" style={{ marginTop: 8, gap: 6 }}>
        {values.length === 0 ? (
          <p
            className="body-sm"
            style={{ margin: 0, color: "var(--ink-faint)" }}
          >
            {emptyHint}
          </p>
        ) : (
          values.map((v, i) => (
            <ListRow
              key={i}
              value={v}
              placeholder={placeholder}
              onChange={(text) => {
                const next = [...values];
                next[i] = text;
                onChange(next);
              }}
              onRemove={() => {
                const next = values.filter((_, idx) => idx !== i);
                onChange(next);
              }}
            />
          ))
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ alignSelf: "flex-start", marginTop: 4 }}
          onClick={() => onChange([...values, ""])}
        >
          + 添加一条
        </button>
      </div>
    </div>
  );
}

function ListRow({
  value,
  onChange,
  onRemove,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  placeholder?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="row gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
    >
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "..."}
      />
      <button
        type="button"
        className="btn btn--icon"
        onClick={onRemove}
        aria-label="删除此条"
        data-hint="删除"
        style={{
          opacity: hover ? 1 : 0.45,
          transition: "opacity var(--motion-fast) var(--ease-out)"
        }}
      >
        ×
      </button>
    </div>
  );
}
