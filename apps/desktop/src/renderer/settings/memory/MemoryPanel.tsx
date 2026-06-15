import { useEffect, useMemo, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useConfirm, useToast } from "../../shared/feedback.js";

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

  async function reload(): Promise<void> {
    const p = (await nuwa.memory.getProfile()) as Profile;
    setProfile(p);
    setInitial(p);
    setLoaded(true);
  }

  useEffect(() => {
    void reload();
  }, [nuwa]);

  const dirty = useMemo(
    () => loaded && profileKey(profile) !== profileKey(initial),
    [profile, initial, loaded]
  );

  async function save(): Promise<void> {
    setSaving(true);
    // 提交前裁剪空白项
    const clean: Profile = {
      preferredName: profile.preferredName?.trim() || undefined,
      currentGoals: profile.currentGoals.map((s) => s.trim()).filter(Boolean),
      ongoingConcerns: profile.ongoingConcerns.map((s) => s.trim()).filter(Boolean),
      tabooTopics: profile.tabooTopics.map((s) => s.trim()).filter(Boolean)
    };
    await nuwa.memory.updateProfile(clean);
    setProfile(clean);
    setInitial(clean);
    setSaving(false);
    showToast({ kind: "success", text: "画像已保存" });
  }

  function discard(): void {
    setProfile(initial);
  }

  async function clearAll(): Promise<void> {
    const ok = await confirm({
      title: "清空全部数据？",
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
    await nuwa.memory.clearAll();
    setProfile(EMPTY);
    setInitial(EMPTY);
    showToast({ kind: "info", text: "已清空全部本地数据" });
  }

  return (
    <div>
      <div className="eyebrow">Memory</div>
      <div className="display display--page" style={{ marginBottom: 18 }}>
        用户画像
      </div>

      <div className="card" style={{ padding: 26, display: "grid", gap: 18 }}>
        <p className="body-md" style={{ margin: 0 }}>
          这些是角色们对你的"轻量画像"。它们决定了你的桌宠会怎么称呼你、会避开哪些话题、会在意你最近在做什么。
        </p>

        <div>
          <label className="eyebrow">称呼</label>
          <input
            className="input"
            value={profile.preferredName ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, preferredName: e.target.value })
            }
            placeholder="想被怎么称呼"
          />
        </div>

        <ListField
          label="当前目标"
          emptyHint="还没记下任何目标"
          values={profile.currentGoals}
          onChange={(v) => setProfile({ ...profile, currentGoals: v })}
        />
        <ListField
          label="长期烦恼"
          emptyHint="还没记下任何烦恼"
          values={profile.ongoingConcerns}
          onChange={(v) => setProfile({ ...profile, ongoingConcerns: v })}
        />
        <ListField
          label="禁忌话题"
          emptyHint="还没标注禁忌话题"
          values={profile.tabooTopics}
          onChange={(v) => setProfile({ ...profile, tabooTopics: v })}
        />

        <div className="row row--between gap-2" style={{ marginTop: 4 }}>
          <button
            className="btn btn--danger btn--sm"
            onClick={() => void clearAll()}
          >
            清空全部数据
          </button>
          <div className="row gap-2">
            {dirty ? (
              <button
                className="btn btn--ghost btn--sm"
                onClick={discard}
                disabled={saving}
              >
                放弃修改
              </button>
            ) : null}
            <button
              className="btn btn--magenta"
              onClick={() => void save()}
              disabled={saving || !dirty}
              data-hint={!dirty && loaded ? "没有要保存的修改" : ""}
            >
              {saving ? "保存中…" : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListField({
  label,
  emptyHint,
  values,
  onChange
}: {
  label: string;
  emptyHint: string;
  values: string[];
  onChange(v: string[]): void;
}) {
  return (
    <div>
      <label className="eyebrow">{label}</label>
      <div className="stack" style={{ marginTop: 6 }}>
        {values.length === 0 ? (
          <p
            className="body-sm"
            style={{ margin: 0, color: "var(--ink-faint)", fontStyle: "italic" }}
          >
            {emptyHint}
          </p>
        ) : (
          values.map((v, i) => (
            <ListRow
              key={i}
              value={v}
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
          style={{ alignSelf: "flex-start" }}
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
  onRemove
}: {
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
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
        placeholder="..."
      />
      <button
        type="button"
        className="btn btn--icon"
        onClick={onRemove}
        aria-label="删除此条"
        data-hint="删除"
        style={{
          opacity: hover ? 1 : 0.35,
          transition: "opacity var(--motion-fast) var(--ease-out)"
        }}
      >
        ×
      </button>
    </div>
  );
}
