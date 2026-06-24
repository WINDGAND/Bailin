import { BrowserWindow, screen } from "electron";
import { IPC, type ProactiveBubblePlacement, type ProactiveWhisperEvent } from "../../shared/ipc-contract.js";
import {
  clampProactiveBubbleSize,
  computeProactiveBubbleWindowBounds,
  defaultProactiveBubbleWindowSize,
  type ProactiveBubbleWindowSize,
  resolveProactiveBubblePlacementFromPetRect
} from "../../shared/proactive-bubble-layout.js";
import { clampRectToDisplayBounds } from "../windows/window-bounds.js";
import { createProactiveBubbleWindow } from "../windows/proactive-bubble-window.js";

export interface ProactiveBubbleHostDeps {
  getPetWindow: () => BrowserWindow | null;
  getActiveCharacterId: () => string | null;
  devUrl: string | undefined;
}

const SHOW_FALLBACK_MS = 150;

export class ProactiveBubbleHost {
  private bubbleWin: BrowserWindow | null = null;
  private placement: ProactiveBubblePlacement | null = null;
  private bubbleSize: ProactiveBubbleWindowSize = defaultProactiveBubbleWindowSize();
  private pendingShow = false;
  private showFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ProactiveBubbleHostDeps) {}

  handleWhisper(evt: ProactiveWhisperEvent): void {
    if (evt.characterId !== this.deps.getActiveCharacterId()) return;
    const pet = this.deps.getPetWindow();
    if (!pet || pet.isDestroyed() || !pet.isVisible()) return;

    const bubble = this.ensureWindow();
    this.clearShowFallback();

    const wasVisible = bubble.isVisible();
    this.pendingShow = true;
    if (wasVisible) bubble.hide();

    if (!wasVisible) {
      this.bubbleSize = defaultProactiveBubbleWindowSize();
    }

    const petRect = pet.getContentBounds();
    const display = screen.getDisplayMatching(petRect);

    this.placement = resolveProactiveBubblePlacementFromPetRect(
      petRect,
      display.bounds.height,
      wasVisible ? this.placement : null
    );

    this.applyPosition();
    this.deliverToBubble(bubble, () => {
      bubble.webContents.send(IPC.EventProactiveBubblePlacement, { placement: this.placement });
      bubble.webContents.send(IPC.EventProactiveWhisper, evt);
    });

    this.showFallbackTimer = setTimeout(() => this.flushPendingShow(), SHOW_FALLBACK_MS);
  }

  hide(): void {
    this.pendingShow = false;
    this.clearShowFallback();
    if (this.bubbleWin && !this.bubbleWin.isDestroyed()) {
      this.bubbleWin.hide();
    }
    this.placement = null;
    this.bubbleSize = defaultProactiveBubbleWindowSize();
  }

  resize(size: { width: number; height: number }): void {
    this.bubbleSize = clampProactiveBubbleSize(size);
    this.applyPosition();
    if (this.pendingShow) this.flushPendingShow();
  }

  syncNearPet(): void {
    const pet = this.deps.getPetWindow();
    if (!pet || pet.isDestroyed() || !pet.isVisible()) {
      if (this.isVisible()) this.hide();
      return;
    }
    if (!this.bubbleWin || this.bubbleWin.isDestroyed() || !this.bubbleWin.isVisible()) return;

    const petRect = pet.getContentBounds();
    const display = screen.getDisplayMatching(petRect);
    const next = resolveProactiveBubblePlacementFromPetRect(
      petRect,
      display.bounds.height,
      this.placement
    );

    if (next !== this.placement) {
      this.placement = next;
      this.deliverToBubble(this.bubbleWin, () => {
        this.bubbleWin!.webContents.send(IPC.EventProactiveBubblePlacement, { placement: next });
      });
    }
    this.applyPosition();
  }

  isVisible(): boolean {
    return Boolean(this.bubbleWin && !this.bubbleWin.isDestroyed() && this.bubbleWin.isVisible());
  }

  private flushPendingShow(): void {
    this.clearShowFallback();
    if (!this.pendingShow) return;
    const pet = this.deps.getPetWindow();
    if (!pet || pet.isDestroyed() || !pet.isVisible()) {
      this.pendingShow = false;
      return;
    }
    const bubble = this.bubbleWin;
    if (!bubble || bubble.isDestroyed()) return;

    this.pendingShow = false;
    if (!bubble.isVisible()) bubble.showInactive();
    bubble.moveTop();
  }

  private clearShowFallback(): void {
    if (this.showFallbackTimer !== null) {
      clearTimeout(this.showFallbackTimer);
      this.showFallbackTimer = null;
    }
  }

  private deliverToBubble(bubble: BrowserWindow, send: () => void): void {
    if (bubble.webContents.isLoading()) {
      bubble.webContents.once("did-finish-load", send);
    } else {
      send();
    }
  }

  private ensureWindow(): BrowserWindow {
    if (this.bubbleWin && !this.bubbleWin.isDestroyed()) return this.bubbleWin;
    this.bubbleWin = createProactiveBubbleWindow(this.deps.devUrl);
    this.bubbleWin.on("closed", () => {
      this.bubbleWin = null;
      this.placement = null;
      this.pendingShow = false;
      this.clearShowFallback();
    });
    return this.bubbleWin;
  }

  private applyPosition(): void {
    const pet = this.deps.getPetWindow();
    const bubble = this.bubbleWin;
    if (!pet || pet.isDestroyed() || !bubble || bubble.isDestroyed() || !this.placement) return;

    const petRect = pet.getContentBounds();
    const raw = computeProactiveBubbleWindowBounds(petRect, this.placement, this.bubbleSize);
    const clamped = clampRectToDisplayBounds(raw, 0);
    bubble.setContentBounds({
      x: clamped.x,
      y: clamped.y,
      width: raw.width,
      height: raw.height
    });
  }
}
