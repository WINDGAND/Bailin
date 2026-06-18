import { powerMonitor } from "electron";
import type { AmbientSignal } from "../../shared/ipc-contract.js";

/** 连续活跃（非空闲）时长追踪；达到阈值时发出 long_active 信号。 */
export class ActiveSessionTracker {
  private activeMinutes = 0;
  private longActiveFired = false;
  private thresholdMinutes = 60;

  setThresholdMinutes(minutes: number): void {
    this.thresholdMinutes = Math.max(1, minutes);
    if (this.activeMinutes < this.thresholdMinutes) {
      this.longActiveFired = false;
    }
  }

  getActiveMinutes(): number {
    return this.activeMinutes;
  }

  getMinutesUntilThreshold(): number | null {
    if (this.longActiveFired) return null;
    return Math.max(0, this.thresholdMinutes - this.activeMinutes);
  }

  /** 每分钟调用一次，返回可能的新信号。 */
  tick(): AmbientSignal | null {
    const idleSeconds = powerMonitor.getSystemIdleTime();
    if (idleSeconds >= 30) {
      this.activeMinutes = 0;
      this.longActiveFired = false;
      return null;
    }
    this.activeMinutes += 1;
    if (!this.longActiveFired && this.activeMinutes >= this.thresholdMinutes) {
      this.longActiveFired = true;
      return {
        kind: "long_active",
        activeMinutes: this.activeMinutes,
        at: Date.now()
      };
    }
    return null;
  }

  resetAfterWhisper(): void {
    this.activeMinutes = 0;
    this.longActiveFired = false;
  }
}
