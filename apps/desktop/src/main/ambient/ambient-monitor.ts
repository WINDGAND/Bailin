import { powerMonitor } from "electron";
import type { AmbientSignal } from "../../shared/ipc-contract.js";
import { ActiveSessionTracker } from "./active-session-tracker.js";

export type AmbientSignalHandler = (signal: AmbientSignal) => void;

export class AmbientMonitor {
  private timer: NodeJS.Timeout | null = null;
  private wasIdle = false;
  private readonly handlers = new Set<AmbientSignalHandler>();
  private readonly activeTracker = new ActiveSessionTracker();

  constructor(private readonly idleThresholdSeconds = 10 * 60) {}

  onSignal(handler: AmbientSignalHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  setLongActiveThresholdMinutes(minutes: number): void {
    this.activeTracker.setThresholdMinutes(minutes);
  }

  getActiveMinutes(): number {
    return this.activeTracker.getActiveMinutes();
  }

  getMinutesUntilLongActive(): number | null {
    return this.activeTracker.getMinutesUntilThreshold();
  }

  resetActiveSessionAfterWhisper(): void {
    this.activeTracker.resetAfterWhisper();
  }

  start(): void {
    if (this.timer) return;
    powerMonitor.on("lock-screen", this.handleLock);
    powerMonitor.on("unlock-screen", this.handleUnlock);
    powerMonitor.on("resume", this.handleResume);
    this.timer = setInterval(() => this.checkIdle(), 60_000);
    this.checkIdle();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    powerMonitor.removeListener("lock-screen", this.handleLock);
    powerMonitor.removeListener("unlock-screen", this.handleUnlock);
    powerMonitor.removeListener("resume", this.handleResume);
  }

  emitManual(): void {
    this.emit({ kind: "manual", at: Date.now() });
  }

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
