/**
 * 环境信号监视器：把系统空闲、锁屏与久坐转成 `AmbientSignal`。
 *
 * 运行在 Electron 主进程，订阅 `powerMonitor` 的锁屏 / 解锁 / 从睡眠恢复，
 * 并每分钟轮询一次系统空闲秒数。上升沿才发 `idle` / `active`，避免每分钟刷屏。
 * 连续前台时长委托 `ActiveSessionTracker`，达到阈值时发出 `long_active`。
 * 本类不决定是否开口；编排器订阅 `onSignal` 后再做配额与场景开关。
 */
import { powerMonitor } from "electron";
import type { AmbientSignal } from "../../shared/ipc-contract.js";
import { ActiveSessionTracker } from "./active-session-tracker.js";

/** 环境信号回调；返回值被忽略。取消订阅请用 `onSignal` 的返回函数。 */
export type AmbientSignalHandler = (signal: AmbientSignal) => void;

/**
 * 系统级环境监视器。
 * `start` / `stop` 成对管理监听与定时器；未 `start` 时不会发信号。
 */
export class AmbientMonitor {
  private timer: NodeJS.Timeout | null = null;
  private wasIdle = false;
  private readonly handlers = new Set<AmbientSignalHandler>();
  private readonly activeTracker = new ActiveSessionTracker();

  /**
   * @param idleThresholdSeconds 判定「进入闲置」的系统空闲秒数，默认 10 分钟。
   *   「离开闲置」另用硬编码的 30 秒滞回，避免在阈值附近抖动。
   */
  constructor(private readonly idleThresholdSeconds = 10 * 60) {}

  /**
   * 注册信号监听。
   * @returns 取消订阅函数；重复调用无副作用。
   */
  onSignal(handler: AmbientSignalHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * 同步久坐阈值到内部 tracker。
   * 陪伴频率变化时由编排器调用；阈值变大且尚未达标时会清掉已触发标记。
   */
  setLongActiveThresholdMinutes(minutes: number): void {
    this.activeTracker.setThresholdMinutes(minutes);
  }

  /** 当前连续前台分钟数（系统空闲达到 30 秒时 tracker 会清零）。无副作用。 */
  getActiveMinutes(): number {
    return this.activeTracker.getActiveMinutes();
  }

  /**
   * 距下一次久坐触发还剩几分钟。
   * @returns 已触发过则 `null`；否则为非负整数。
   */
  getMinutesUntilLongActive(): number | null {
    return this.activeTracker.getMinutesUntilThreshold();
  }

  /** 久坐耳语发出后清零连续活跃计数，避免同一段前台重复触发。 */
  resetActiveSessionAfterWhisper(): void {
    this.activeTracker.resetAfterWhisper();
  }

  /**
   * 开始监听。已启动则直接返回（幂等）。
   * 副作用：挂上 powerMonitor 监听，并立刻跑一轮 `checkIdle`。
   */
  start(): void {
    if (this.timer) return;
    powerMonitor.on("lock-screen", this.handleLock);
    powerMonitor.on("unlock-screen", this.handleUnlock);
    powerMonitor.on("resume", this.handleResume);
    this.timer = setInterval(() => this.checkIdle(), 60_000);
    this.checkIdle();
  }

  /** 停止定时器并卸掉 powerMonitor 监听。可再次 `start`。 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    powerMonitor.removeListener("lock-screen", this.handleLock);
    powerMonitor.removeListener("unlock-screen", this.handleUnlock);
    powerMonitor.removeListener("resume", this.handleResume);
  }

  /** 由设置页「现在试一次」等入口手动合成一条 `manual` 信号。 */
  emitManual(): void {
    this.emit({ kind: "manual", at: Date.now() });
  }

  /**
   * 每分钟：先让 tracker 可能发出 `long_active`，再做闲置上升/下降沿。
   * 刚进入闲置时提前 return，同一轮不再发 `active`。
   */
  private checkIdle(): void {
    const longActive = this.activeTracker.tick();
    if (longActive) {
      this.emit(longActive);
    }

    const idleSeconds = powerMonitor.getSystemIdleTime();
    if (idleSeconds >= this.idleThresholdSeconds && !this.wasIdle) {
      this.wasIdle = true;
      this.emit({ kind: "idle", idleSeconds, at: Date.now() });
      return;
    }
    // 必须回到接近「正在用」才算离开闲置，阈值远低于进入闲置的 10 分钟。
    if (idleSeconds < 30 && this.wasIdle) {
      this.wasIdle = false;
      this.emit({ kind: "active", idleSeconds, at: Date.now() });
    }
  }

  private handleLock = (): void => {
    this.emit({ kind: "lock", at: Date.now() });
  };

  private handleUnlock = (): void => {
    this.emit({ kind: "unlock", at: Date.now() });
  };

  private handleResume = (): void => {
    this.emit({ kind: "resume", at: Date.now() });
  };

  private emit(signal: AmbientSignal): void {
    for (const handler of this.handlers) handler(signal);
  }
}
