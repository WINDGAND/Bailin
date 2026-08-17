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

/**
 * 主动陪伴气泡的主进程宿主。
 *
 * 百灵桌宠把耳语做成独立透明窗（与桌宠窗分离），由本类负责：
 * 创建/复用窗口、按桌宠矩形决定上/下方位、等渲染进程量完尺寸后再显示。
 * 编排器产出 `ProactiveWhisperEvent` 后调用 `handleWhisper`；设置/拖动桌宠时调用 `syncNearPet`。
 */

/** 创建/定位气泡窗所需的桌宠窗口、当前角色与开发态 URL。 */
export interface ProactiveBubbleHostDeps {
  getPetWindow: () => BrowserWindow | null;
  getActiveCharacterId: () => string | null;
  /** 开发态 Vite URL；生产态传 `undefined`，窗口改为 loadFile。 */
  devUrl: string | undefined;
}

/** 渲染进程若未在该时限内回报尺寸，仍强制显示，避免气泡一直藏着。 */
const SHOW_FALLBACK_MS = 150;

/**
 * 独立耳语气泡窗的生命周期与屏幕几何。
 * 不抢焦点（`showInactive`），位置钳制在当前显示器内。
 */
export class ProactiveBubbleHost {
  private bubbleWin: BrowserWindow | null = null;
  private placement: ProactiveBubblePlacement | null = null;
  private bubbleSize: ProactiveBubbleWindowSize = defaultProactiveBubbleWindowSize();
  /** 已投递耳语、正等渲染进程 `resize`（或超时回退）后再 `showInactive`。 */
  private pendingShow = false;
  private showFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ProactiveBubbleHostDeps) {}

  /**
   * 展示一条新耳语。非当前角色、或桌宠窗不可见时直接忽略。
   *
   * 若窗口已在显示，先 hide 再投递，避免旧文案/旧高度闪一帧；
   * 首次出现则重置为默认尺寸，等渲染进程量完真实高度后再撑开。
   */
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

  /**
   * 立刻藏起气泡并清掉待显示状态。
   * 用户点关闭、打开聊天、或桌宠离开屏幕时由主进程调用。
   */
  hide(): void {
    this.pendingShow = false;
    this.clearShowFallback();
    if (this.bubbleWin && !this.bubbleWin.isDestroyed()) {
      this.bubbleWin.hide();
    }
    this.placement = null;
    this.bubbleSize = defaultProactiveBubbleWindowSize();
  }

  /**
   * 渲染进程量完气泡 DOM 后回写内容区尺寸。
   * 若正处在 `pendingShow`，尺寸到位后立即显示，不必再等 150ms 回退。
   */
  resize(size: { width: number; height: number }): void {
    this.bubbleSize = clampProactiveBubbleSize(size);
    this.applyPosition();
    if (this.pendingShow) this.flushPendingShow();
  }

  /**
   * 桌宠移动/缩放后把气泡重新贴到精灵附近。
   * 桌宠不可见则连气泡一起藏；方位变化时才向渲染进程发 placement，减少无谓重排。
   */
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
    // showInactive：不抢输入焦点，避免打断用户正在做的事
    if (!bubble.isVisible()) bubble.showInactive();
    bubble.moveTop();
  }

  private clearShowFallback(): void {
    if (this.showFallbackTimer !== null) {
      clearTimeout(this.showFallbackTimer);
      this.showFallbackTimer = null;
    }
  }

  /** 页面仍在加载时把 IPC 推迟到 `did-finish-load`，避免首条耳语丢失。 */
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
    // 只钳制左上角，宽高保持渲染进程量出的尺寸，避免贴边时被压扁
    bubble.setContentBounds({
      x: clamped.x,
      y: clamped.y,
      width: raw.width,
      height: raw.height
    });
  }
}
