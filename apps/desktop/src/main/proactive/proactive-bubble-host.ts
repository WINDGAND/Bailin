import { BrowserWindow, screen } from "electron";
import { IPC, type ProactiveBubblePlacement, type ProactiveWhisperEvent } from "../../shared/ipc-contract.js";
import {
  computeProactiveBubbleWindowBounds,
  resolveProactiveBubblePlacementFromPetRect
} from "../../shared/proactive-bubble-layout.js";
import { clampRectToDisplayBounds } from "../windows/window-bounds.js";
import { createProactiveBubbleWindow } from "../windows/proactive-bubble-window.js";

export interface ProactiveBubbleHostDeps {
  getPetWindow: () => BrowserWindow | null;
  getActiveCharacterId: () => string | null;
  devUrl: string | undefined;
}

export class ProactiveBubbleHost {
  private bubbleWin: BrowserWindow | null = null;
  private placement: ProactiveBubblePlacement | null = null;

  constructor(private readonly deps: ProactiveBubbleHostDeps) {}

  handleWhisper(evt: ProactiveWhisperEvent): void {
    if (evt.characterId !== this.deps.getActiveCharacterId()) return;
    const pet = this.deps.getPetWindow();
    if (!pet || pet.isDestroyed()) return;

    const bubble = this.ensureWindow();
    const petRect = pet.getContentBounds();
    const display = screen.getDisplayMatching(petRect);

    this.placement = resolveProactiveBubblePlacementFromPetRect(
      petRect,
      display.bounds.height,
      bubble.isVisible() ? this.placement : null
    );

    this.applyPosition();
    this.deliverToBubble(bubble, () => {
      bubble.webContents.send(IPC.EventProactiveBubblePlacement, { placement: this.placement });
      bubble.webContents.send(IPC.EventProactiveWhisper, evt);
    });

    if (!bubble.isVisible()) bubble.show();
    bubble.moveTop();
  }

  hide(): void {
    if (this.bubbleWin && !this.bubbleWin.isDestroyed()) {
      this.bubbleWin.hide();
    }
    this.placement = null;
  }

  syncNearPet(): void {
    if (!this.bubbleWin || this.bubbleWin.isDestroyed() || !this.bubbleWin.isVisible()) return;
    const pet = this.deps.getPetWindow();
    if (!pet || pet.isDestroyed()) return;

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
    });
    return this.bubbleWin;
  }

  private applyPosition(): void {
    const pet = this.deps.getPetWindow();
    const bubble = this.bubbleWin;
    if (!pet || pet.isDestroyed() || !bubble || bubble.isDestroyed() || !this.placement) return;

    const petRect = pet.getContentBounds();
    const raw = computeProactiveBubbleWindowBounds(petRect, this.placement);
    const clamped = clampRectToDisplayBounds(raw, 0);
    bubble.setContentBounds({
      x: clamped.x,
      y: clamped.y,
      width: raw.width,
      height: raw.height
    });
  }
}
