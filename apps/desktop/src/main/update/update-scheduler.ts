import type { UpdateCheckResult } from "../../shared/ipc-contract.js";
import { isVersionDismissed } from "../../shared/version-compare.js";

export interface UpdateSchedulerDeps {
  getCurrentVersion: () => string;
  /** 用户上次点「忽略此版本」记住的版本号；没忽略过则返回 null。 */
  getDismissedTag: () => string | null;
  /** 检查函数用依赖注入而不是直接 import checkForUpdates——方便测试时替换成假实现，不用 mock 全局 fetch。 */
  checkFn: (currentVersion: string) => Promise<UpdateCheckResult>;
  onUpdateAvailable: (result: UpdateCheckResult) => void;
  /** 首次检查延迟（默认 8s，避开启动关键路径）。 */
  initialDelayMs?: number;
  /** 自动检查间隔（默认 24 小时）。 */
  intervalMs?: number;
}

const DEFAULT_INITIAL_DELAY_MS = 8_000;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * 后台定时检查 GitHub 新版本，模式参照 AmbientMonitor：start()/stop()，
 * 内部自己管定时器，will-quit 时清理。
 *
 * 「已忽略」判断只发生在这里（自动检查路径）；手动触发的检查请直接调用
 * checkForUpdates()，不经过这个类，那样才能保证手动检查永远给用户真实结果。
 */
export class UpdateScheduler {
  private initialTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: UpdateSchedulerDeps) {}

  start(): void {
    if (this.initialTimer || this.intervalTimer) return;
    const initialDelay = this.deps.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const interval = this.deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.initialTimer = setTimeout(() => {
      // 注意：这个回调必须全程同步执行到 setInterval 那一行——中间不能插入
      // 任何 await。`initialTimer` 置 null 和 `intervalTimer` 赋值之间如果
      // 出现异步让出点，理论上另一次 start() 调用就可能在这个窗口期插进来，
      // 导致重复开出两个 intervalTimer。`void this.runScheduledCheck()` 只是
      // 发起不等待，正是为了避免这个窗口存在。
      this.initialTimer = null;
      void this.runScheduledCheck();
      this.intervalTimer = setInterval(() => void this.runScheduledCheck(), interval);
    }, initialDelay);
  }

  stop(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /** 供测试直接调用一次检查+去重逻辑，不用等定时器。 */
  async runScheduledCheck(): Promise<UpdateCheckResult> {
    const result = await this.deps.checkFn(this.deps.getCurrentVersion());
    if (result.error) {
      // 后台定时检查失败是"沉默"的（不打扰用户），但完全不落地就没法排查
      // "线上长期查不到更新是不是被限流/网络挡住了"这种问题。
      getElectronLog()?.warn(`[UpdateScheduler] 检查失败：${result.error}`);
    }
    if (result.hasUpdate && !isVersionDismissed(result.latestVersion, this.deps.getDismissedTag())) {
      this.deps.onUpdateAvailable(result);
    }
    return result;
  }
}

/**
 * electron-log 必须 lazy import：这个模块也会被独立的 verify 脚本 require
 * （不在 Electron 环境里跑），那种情境下没有 app 实例，顶层 import 会报错。
 * 参考 llm-adapter.ts 里同名函数的写法。
 */
let cachedLogger: { warn: (s: string) => void } | null = null;
function getElectronLog(): { warn: (s: string) => void } | null {
  if (cachedLogger) return cachedLogger;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require("electron-log/main") as { warn: (s: string) => void };
    cachedLogger = mod;
    return cachedLogger;
  } catch {
    return null;
  }
}
