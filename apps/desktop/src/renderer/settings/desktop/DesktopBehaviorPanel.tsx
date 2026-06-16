import { useEffect, useState, type ReactNode } from "react";
import type { ProactiveSettings, ProactiveStatus } from "../../../shared/ipc-contract.js";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useToast } from "../../shared/feedback.js";

const DEFAULT_SETTINGS: ProactiveSettings = {
  enabled: true,
  intensity: "light",
  maxPerHour: 1,
  defaultHushMinutes: 30,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  screenAwareness: "off"
};

export function DesktopBehaviorPanel(): JSX.Element {
  const nuwa = useNuwa();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<ProactiveSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, st] = await Promise.all([
        nuwa.proactive.getSettings(),
        nuwa.proactive.getStatus()
      ]);
      setSettings(s);
      setStatus(st);
    })();
  }, [nuwa]);

  async function save(next: ProactiveSettings): Promise<void> {
    setSettings(next);
    setSaving(true);
    try {
      const saved = await nuwa.proactive.setSettings(next);
      setSettings(saved);
      setStatus(await nuwa.proactive.getStatus());
      showToast({ kind: "success", text: "桌宠陪伴设置已保存" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <div className="eyebrow">Desktop Companion</div>
        <h1 className="display display--page" style={{ margin: "6px 0 8px" }}>
          桌宠与陪伴
        </h1>
        <p className="body-md" style={{ maxWidth: 620 }}>
          控制桌宠是否主动说悄悄话、多久打扰一次，以及它能否读取低敏屏幕信号。截图观察默认关闭，开启前请确认你愿意把相关上下文交给你配置的模型服务。
        </p>
      </div>

      <section className="card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
              主动陪伴
            </h2>
            <p className="body-sm" style={{ margin: "6px 0 0" }}>
              轻度模式每小时最多一句，完整聊天窗打开或安静中不会主动说话。
            </p>
          </div>
          <label className="row gap-2" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                void save({
                  ...settings,
                  enabled: e.currentTarget.checked,
                  intensity: e.currentTarget.checked ? "light" : "off"
                })
              }
            />
            <span>{settings.enabled ? "已开启" : "已关闭"}</span>
          </label>
        </div>

        <div className="grid-2" style={{ marginTop: 18 }}>
          <Field label="强度">
            <select
              className="input"
              value={settings.intensity}
              onChange={(e) =>
                void save({
                  ...settings,
                  intensity: e.currentTarget.value as ProactiveSettings["intensity"],
                  enabled: e.currentTarget.value !== "off"
                })
              }
            >
              <option value="off">关闭</option>
              <option value="light">轻度</option>
              <option value="standard">标准</option>
            </select>
          </Field>
          <Field label="每小时上限">
            <select
              className="input"
              value={settings.maxPerHour}
              onChange={(e) =>
                void save({
                  ...settings,
                  maxPerHour: Number(e.currentTarget.value) as ProactiveSettings["maxPerHour"]
                })
              }
            >
              <option value={0}>0 次</option>
              <option value={1}>1 次</option>
              <option value={2}>2 次</option>
            </select>
          </Field>
          <Field label="默认安静时长">
            <select
              className="input"
              value={settings.defaultHushMinutes}
              onChange={(e) =>
                void save({
                  ...settings,
                  defaultHushMinutes: Number(
                    e.currentTarget.value
                  ) as ProactiveSettings["defaultHushMinutes"]
                })
              }
            >
              <option value={15}>15 分钟</option>
              <option value={30}>30 分钟</option>
              <option value={60}>60 分钟</option>
            </select>
          </Field>
          <Field label="屏幕感知等级">
            <select
              className="input"
              value={settings.screenAwareness}
              onChange={(e) =>
                void save({
                  ...settings,
                  screenAwareness: e.currentTarget.value as ProactiveSettings["screenAwareness"]
                })
              }
            >
              <option value="off">关闭：不观察屏幕</option>
              <option value="signals">低敏信号：只用空闲/锁屏等状态</option>
              <option value="screenshots">截图观察：后续能力，显式授权后启用</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
          勿扰时段
        </h2>
        <div className="row gap-2" style={{ marginTop: 12 }}>
          <label className="row gap-2">
            <input
              type="checkbox"
              checked={settings.quietHoursEnabled}
              onChange={(e) =>
                void save({ ...settings, quietHoursEnabled: e.currentTarget.checked })
              }
            />
            <span>启用</span>
          </label>
          <input
            className="input"
            type="time"
            value={settings.quietHoursStart}
            onChange={(e) => void save({ ...settings, quietHoursStart: e.currentTarget.value })}
            style={{ maxWidth: 140 }}
          />
          <span className="body-sm">到</span>
          <input
            className="input"
            type="time"
            value={settings.quietHoursEnd}
            onChange={(e) => void save({ ...settings, quietHoursEnd: e.currentTarget.value })}
            style={{ maxWidth: 140 }}
          />
        </div>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <h2 className="display display--section" style={{ fontSize: 20, margin: 0 }}>
          当前状态
        </h2>
        <div className="body-md" style={{ marginTop: 10 }}>
          {status?.hushUntil && status.hushUntil > Date.now()
            ? `已安静到 ${new Date(status.hushUntil).toLocaleTimeString()}`
            : "当前没有安静倒计时"}
          <br />
          本小时主动发言：{status?.utterancesThisHour ?? 0} 次
          <br />
          屏幕感知：{labelScreenAwareness(settings.screenAwareness)}
        </div>
        <div className="row gap-2" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void nuwa.pet.hush(settings.defaultHushMinutes * 60 * 1000)}
          >
            安静 {settings.defaultHushMinutes} 分钟
          </button>
          <button
            type="button"
            className="btn btn--magenta"
            disabled={saving}
            onClick={async () => {
              const r = await nuwa.proactive.triggerNow("manual");
              showToast({
                kind: r.ok ? "success" : "info",
                text: r.ok ? "已让桌宠说一句悄悄话" : `暂时没有触发：${r.reason ?? "未知原因"}`
              });
              setStatus(await nuwa.proactive.getStatus());
            }}
          >
            试说一句
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span className="body-sm">{label}</span>
      {children}
    </label>
  );
}

function labelScreenAwareness(value: ProactiveSettings["screenAwareness"]): string {
  if (value === "signals") return "低敏信号";
  if (value === "screenshots") return "截图观察";
  return "关闭";
}
