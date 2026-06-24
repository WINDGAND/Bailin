import { app, globalShortcut, Tray, Menu, nativeImage, BrowserWindow, dialog, screen } from "electron";
Menu.setApplicationMenu(null);
import { join } from "node:path";
import log from "electron-log/main";

process.on("uncaughtException", (err) => {
  console.error("[main] uncaughtException", err);
  try {
    log.error("uncaughtException", err);
  } catch {
    // ignore
  }
  try {
    dialog.showErrorBox("Bailin · 主进程异常", err.stack || err.message || String(err));
  } catch {
    // ignore
  }
});
process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection", reason);
});

import { LocalVault } from "./store/local-vault.js";
import { applyDevSetup } from "./dev-setup.js";
import { purgeRetiredCharacters } from "./retired-characters.js";
import { LLMAdapter } from "./adapters/llm-adapter.js";
import { ImageGenerationAdapter } from "./adapters/image-generation-adapter.js";
import { SafetyPolicy } from "./safety/safety-policy.js";
import { MemoryStore } from "./runtime/memory-store.js";
import { ProfileExtractor } from "./runtime/profile-extractor.js";
import { CharacterRuntime } from "./runtime/character-runtime.js";
import { BailinOrchestrator } from "./orchestration/bailin-orchestrator.js";
import {
  broadcastToAllWindows,
  readImageConfigForMain,
  registerIpc,
  SETTING_LOCALE,
  SETTING_PET_POS
} from "./ipc/register.js";
import { getMainTrayLabels, parseUiLocale } from "../shared/ui-labels.js";
import { registerChatTurnHandlers } from "./ipc/chat-turn-handlers.js";
import { registerChatSessionHandlers } from "./ipc/chat-session-handlers.js";
import {
  computePetMenuWindowBounds,
  createPetWindow,
  resolvePetMenuSide,
  type PetMenuSide
} from "./windows/pet-window.js";
import { getPetWindowSize } from "../shared/pet-display-scale.js";
import { readProactiveSettings, getLongActiveThreshold } from "./proactive/proactive-settings.js";
import { clampPetWindow, clampRectToDisplayBounds } from "./windows/window-bounds.js";
import {
  CHAT_WINDOW_DEFAULT_SIZE,
  CHAT_WINDOW_MIN_SIZE,
  createChatWindow,
  positionChatNear,
  readChatContentSize,
  type ChatWindowSize
} from "./windows/chat-window.js";
import { createSettingsWindow } from "./windows/settings-window.js";
import { loadAppIcon } from "./app-icon.js";
import { AmbientMonitor } from "./ambient/ambient-monitor.js";
import { ProactiveOrchestrator } from "./proactive/proactive-orchestrator.js";
import { ProactiveBubbleHost } from "./proactive/proactive-bubble-host.js";
import { ScreenCaptureService } from "./capture/screen-capture.js";
import { IPC, type LLMProviderConfig, type ProactiveWhisperEvent, type SettingsTab } from "../shared/ipc-contract.js";

log.initialize();
log.info("[main] Bailin starting...");
// 启动横幅：如果用户重启后看到 web-search-v2 字样，就说明新代码已加载。
// v2 = 强制搜索 prompt + 短 query 重试 + sourceContext 消歧义 + 主进程埋点日志。
log.info(
  "[main] build-tag: web-search-v2 (forced-search prompt + short-reask retry + source-context disambiguation + LLM.search-preview logs)"
);

let tray: Tray | null = null;
let petWin: BrowserWindow | null = null;
let vaultRef: LocalVault | null = null;
let chatWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let activeCharacterId: string | null = null;
let isQuitting = false;
let ambientMonitor: AmbientMonitor | null = null;
let llmProactiveTimer: NodeJS.Timeout | null = null;

function syncProactiveAmbient(vault: LocalVault): void {
  if (!ambientMonitor) return;
  const settings = readProactiveSettings(vault);
  ambientMonitor.setLongActiveThresholdMinutes(getLongActiveThreshold(settings));
}

/** 拖动时光标相对窗口原点的偏移量（主进程坐标系，物理/逻辑像素与 screen API 一致）。 */
let dragCursorOffset: { dx: number; dy: number } | null = null;

/** 聊天窗内容区尺寸：跟随桌宠 reposition 时只写不读 getBounds，避免 DPI 漂移。 */
let chatWindowSize: ChatWindowSize = { ...CHAT_WINDOW_DEFAULT_SIZE };
/** 程序化 reposition / resize 期间忽略 resized 事件，防止把漂移值写回 chatWindowSize。 */
let chatRepositioning = false;
let petContextMenuOpen = false;
/** 打开右键菜单前的窗口 bounds，关闭时原样恢复。 */
let petBoundsBeforeMenu: { x: number; y: number; width: number; height: number } | null = null;
let proactiveBubbleHost: ProactiveBubbleHost | null = null;

const devUrl = process.env.VITE_DEV_SERVER || undefined;

function openLibraryAndPet(): void {
  const pet = ensurePetWindow();
  if (!pet.isDestroyed()) pet.show();
  ensureSettingsWindow("library");
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    openLibraryAndPet();
  });
}

/** 拦截悄悄话广播：由独立气泡窗承载，桌宠窗不再 resize。 */
function appBroadcast(channel: string, payload: unknown): void {
  if (channel === IPC.EventProactiveWhisper && proactiveBubbleHost) {
    proactiveBubbleHost.handleWhisper(payload as ProactiveWhisperEvent);
    return;
  }
  broadcastToAllWindows(channel, payload);
}

function ensureSettingsWindow(tab?: SettingsTab): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    if (tab) broadcastToAllWindows(IPC.EventNavigateSettings, { tab });
    return;
  }
  settingsWin = createSettingsWindow(devUrl);
  // 等 React 把首屏画完再 show，杜绝白闪 + 防止"创建即显示"时
  // 抢走桌宠拖动的焦点。
  settingsWin.once("ready-to-show", () => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.show();
      settingsWin.focus();
      if (tab) broadcastToAllWindows(IPC.EventNavigateSettings, { tab });
    }
  });
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

function ensurePetWindow(): BrowserWindow {
  if (petWin && !petWin.isDestroyed()) return petWin;
  petWin = createPetWindow(devUrl, getPetWindowSizeNow());
  petWin.on("closed", () => {
    petWin = null;
  });
  return petWin;
}

function getPetDisplayScale(): number {
  if (!vaultRef) return 1;
  return readProactiveSettings(vaultRef).petDisplayScale;
}

function getPetWindowSizeNow(): { width: number; height: number } {
  return getPetWindowSize(getPetDisplayScale());
}

function applyPetDisplayScale(nextScale?: number): void {
  const pet = petWin;
  if (!pet || pet.isDestroyed() || petContextMenuOpen) return;
  void nextScale;
  const base = getPetSavedPosition();
  applyPetWindowAtBase(base);
  syncChatNearPetIfVisible();
}

function ensureChatWindow(): BrowserWindow {
  if (chatWin && !chatWin.isDestroyed()) return chatWin;
  chatWin = createChatWindow(devUrl);
  chatWindowSize = { ...CHAT_WINDOW_DEFAULT_SIZE };
  chatWin.on("resized", () => {
    if (chatRepositioning || !chatWin || chatWin.isDestroyed()) return;
    chatWindowSize = readChatContentSize(chatWin);
  });
  // 关闭按钮按 hide 处理（避免重新加载 React 应用），真正销毁交给 quit
  chatWin.on("close", (e) => {
    if (!isQuitting && chatWin && !chatWin.isDestroyed()) {
      e.preventDefault();
      chatWin.hide();
    }
  });
  chatWin.on("closed", () => {
    chatWin = null;
  });
  chatWin.on("show", () => rebuildTrayMenu());
  chatWin.on("hide", () => rebuildTrayMenu());
  return chatWin;
}

/**
 * 桌宠当前在屏幕里的几何。
 * 永远用 getContentBounds 取位置 + 常量取尺寸，规避 electron#27651
 * 在 Windows 非整数 DPI 下 getBounds 返回的 width/height 会随 setPosition
 * 调用次数累积漂移的 bug。
 */
function getPetGeometry(pet: BrowserWindow): { x: number; y: number; width: number; height: number } {
  const { width, height } = getPetWindowSizeNow();
  if (petContextMenuOpen && petBoundsBeforeMenu) {
    return { x: petBoundsBeforeMenu.x, y: petBoundsBeforeMenu.y, width, height };
  }
  const content = pet.getContentBounds();
  return { x: content.x, y: content.y, width, height };
}

function applyPetWindowAtBase(base: { x: number; y: number }): { x: number; y: number } {
  const pet = petWin;
  if (!pet || pet.isDestroyed()) return base;
  const baseSize = getPetWindowSizeNow();
  const clamped = clampRectToDisplayBounds(
    { x: base.x, y: base.y, width: baseSize.width, height: baseSize.height },
    0
  );
  pet.setContentBounds({
    x: clamped.x,
    y: clamped.y,
    width: baseSize.width,
    height: baseSize.height
  });
  return { x: clamped.x, y: clamped.y };
}

function getPetSavedPosition(): { x: number; y: number } {
  const pet = petWin;
  if (!pet || pet.isDestroyed()) return { x: 0, y: 0 };
  const content = pet.getContentBounds();
  return { x: content.x, y: content.y };
}

/**
 * 打开（或保持显示）完整聊天窗。
 *
 * 这一版交互设计删除了独立的桌宠气泡窗 —— 所有"想跟桌宠说话"的入口都直接弹这个聊天窗。
 * 入口包括：单击桌宠、Ctrl+Shift+P、托盘「唤起对话 / 关闭对话」。
 */
function repositionChatNearPet(chat: BrowserWindow): void {
  const pet = petWin;
  if (!pet || pet.isDestroyed()) return;
  const geo = getPetGeometry(pet);
  chatRepositioning = true;
  positionChatNear(
    chat,
    { petX: geo.x, petY: geo.y, petW: geo.width, petH: geo.height },
    chatWindowSize
  );
  chatRepositioning = false;
}

function broadcastChatVisibility(visible: boolean): void {
  broadcastToAllWindows(IPC.EventChatVisibility, {
    visible,
    characterId: activeCharacterId ?? undefined
  });
}

function showChatNearPet(): void {
  const pet = ensurePetWindow();
  const chat = ensureChatWindow();
  repositionChatNearPet(chat);
  chat.show();
  chat.moveTop();
  chat.focus();
  broadcastChatVisibility(true);
  broadcastToAllWindows("bailin.event.petSummon", null);
}

/**
 * 单一"召唤桌宠"入口：
 * - 聊天窗已可见 → toggle，hide 之；
 * - 聊天窗不可见 → 显示并定位到桌宠旁。
 *
 * 用 toggle 而不是 always-show，是因为同一个手势（点桌宠 / Ctrl+Shift+P）
 * 在用户已经看到聊天窗时再次触发，最自然的预期是"收起"。
 */
function summonPetBubble(): void {
  const pet = ensurePetWindow();
  if (!pet.isVisible()) pet.show();
  pet.moveTop();
  broadcastToAllWindows("bailin.event.petSummon", null);

  if (isChatVisible()) {
    hideChat();
    return;
  }
  showChatNearPet();
}

function hideChat(): void {
  if (chatWin && !chatWin.isDestroyed()) chatWin.hide();
  broadcastChatVisibility(false);
}

function isChatVisible(): boolean {
  return Boolean(chatWin && !chatWin.isDestroyed() && chatWin.isVisible());
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  const chatOpen = isChatVisible();
  const labels = getMainTrayLabels(parseUiLocale(vaultRef?.getSetting(SETTING_LOCALE)));
  tray.setToolTip(labels.tooltip);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: chatOpen ? labels.summonClose : labels.summonOpen,
        click: () => summonPetBubble()
      },
      {
        label: labels.showPet,
        click: () => {
          const pet = ensurePetWindow();
          pet.show();
        }
      },
      {
        label: labels.openSettings,
        click: () => ensureSettingsWindow()
      },
      { type: "separator" },
      {
        label: labels.quit,
        click: () => {
          isQuitting = true;
          app.exit(0);
        }
      }
    ])
  );
}

/** 聊天窗可见时，将其重新定位到桌宠左右侧（随桌宠移动而跟随）。 */
function syncChatNearPetIfVisible(): void {
  if (!isChatVisible() || !chatWin || chatWin.isDestroyed()) return;
  repositionChatNearPet(chatWin);
}

function setPetContextMenuOpen(open: boolean): PetMenuSide | null {
  const pet = petWin;
  if (!pet || pet.isDestroyed()) return null;
  const baseSize = getPetWindowSizeNow();
  const baseW = baseSize.width;
  const baseH = baseSize.height;

  if (!open) {
    petContextMenuOpen = false;
    if (petBoundsBeforeMenu) {
      pet.setContentBounds({ ...petBoundsBeforeMenu });
      petBoundsBeforeMenu = null;
    } else {
      const geo = getPetGeometry(pet);
      pet.setContentBounds({ x: geo.x, y: geo.y, width: baseW, height: baseH });
    }
    clampPetWindow(pet, { width: baseW, height: baseH });
    return null;
  }

  const geo = getPetGeometry(pet);
  petBoundsBeforeMenu = { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
  petContextMenuOpen = true;

  const display = screen.getDisplayMatching({
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height
  });

  let chatRect: { x: number; y: number; width: number; height: number } | null = null;
  if (chatWin && !chatWin.isDestroyed() && chatWin.isVisible()) {
    const c = chatWin.getContentBounds();
    chatRect = { x: c.x, y: c.y, width: c.width, height: c.height };
  }

  const side = resolvePetMenuSide({
    petX: geo.x,
    petY: geo.y,
    petW: geo.width,
    petH: geo.height,
    chat: chatRect,
    workArea: display.workArea
  });

  const bounds = computePetMenuWindowBounds(geo.x, geo.y, side, display.workArea, baseSize);
  pet.setContentBounds(bounds);
  pet.setIgnoreMouseEvents(false);
  return side;
}

function getChatWindowSize(): ChatWindowSize {
  return { ...chatWindowSize };
}

function setChatWindowSize(width: number, height: number): ChatWindowSize {
  const next = {
    width: Math.max(CHAT_WINDOW_MIN_SIZE.width, Math.round(width)),
    height: Math.max(CHAT_WINDOW_MIN_SIZE.height, Math.round(height))
  };
  chatWindowSize = next;
  if (!chatWin || chatWin.isDestroyed()) {
    return getChatWindowSize();
  }
  const content = chatWin.getContentBounds();
  chatRepositioning = true;
  chatWin.setContentBounds({ x: content.x, y: content.y, width: next.width, height: next.height });
  chatRepositioning = false;
  return getChatWindowSize();
}

function hidePet(): void {
  proactiveBubbleHost?.hide();
  if (petWin && !petWin.isDestroyed()) petWin.hide();
}

/**
 * 把桌宠"内容区"原点放到 (x, y)，并 clamp 在所属显示器的物理 bounds 内。
 *
 * 关键：用 setContentBounds + 固定 PET_WINDOW_SIZE，规避 Electron 在 Windows
 * 非整数 DPI 下 setPosition / setBounds 反复调用导致 width/height 漂移的 bug
 * （electron#27651），那个 bug 的表现就是"桌宠活动范围越用越小，最后被卡在
 * 一条线上"。
 */
function setPetContentOrigin(pet: BrowserWindow, x: number, y: number): { x: number; y: number } {
  return applyPetWindowAtBase({ x, y });
}

function movePet(x: number, y: number): { x: number; y: number } {
  const pet = ensurePetWindow();
  const pos = setPetContentOrigin(pet, x, y);
  syncChatNearPetIfVisible();
  return pos;
}

function positionPetAtPrimaryBottomRight(margin = 24): void {
  const pet = ensurePetWindow();
  const work = screen.getPrimaryDisplay().workArea;
  const { width, height } = getPetWindowSizeNow();
  // 默认初始位置走 workArea + margin（避免一启动桌宠就压在任务栏上），
  // 但后续所有 clamp 都用 display.bounds，让用户能拖到物理边缘。
  const x = Math.max(work.x, work.x + work.width - width - margin);
  const y = Math.max(work.y, work.y + work.height - height - margin);
  setPetContentOrigin(pet, Math.round(x), Math.round(y));
}

function getPetWindowBoundsSize(): { width: number; height: number } {
  return getPetWindowSizeNow();
}

function ensurePetOnScreen(): void {
  const pet = ensurePetWindow();
  clampPetWindow(pet, getPetWindowBoundsSize());
  syncChatNearPetIfVisible();
  if (!pet.isVisible()) pet.show();
}

/**
 * 记录拖动开始时光标与窗口"内容原点"的偏移。
 * 全程使用主进程 screen API（getCursorScreenPoint / getContentBounds），
 * 无需接触渲染进程的 CSS 像素，彻底规避 HiDPI 坐标空间差异。
 *
 * 用 getContentBounds 而不是 getBounds：避开 electron#27651 那个累积漂移 bug，
 * 让 dx/dy 不会被错误的 width/height 误差污染。
 */
function petDragStart(): void {
  const pet = petWin;
  if (!pet || pet.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const content = pet.getContentBounds();
  dragCursorOffset = { dx: cursor.x - content.x, dy: cursor.y - content.y };
}

/**
 * 拖动过程中持续调用：以当前光标位置减去初始偏移得到新窗口位置，
 * clamp 后用 setContentBounds 写回（width/height 永远走常量 PET_WINDOW_SIZE，
 * 完全屏蔽尺寸漂移，保证可达边界稳定）。
 */
function petDragMove(): void {
  if (!dragCursorOffset) return;
  const pet = petWin;
  if (!pet || pet.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const { width, height } = getPetWindowSizeNow();
  const newX = cursor.x - dragCursorOffset.dx;
  const newY = cursor.y - dragCursorOffset.dy;
  const clamped = clampRectToDisplayBounds({ x: newX, y: newY, width, height });
  pet.setContentBounds({ x: clamped.x, y: clamped.y, width, height });

  if (clamped.x !== newX) {
    dragCursorOffset.dx = cursor.x - clamped.x;
  }
  if (clamped.y !== newY) {
    dragCursorOffset.dy = cursor.y - clamped.y;
  }

  proactiveBubbleHost?.syncNearPet();
  syncChatNearPetIfVisible();
}

function petDragEnd(): { x: number; y: number } | null {
  dragCursorOffset = null;
  if (!petWin || petWin.isDestroyed()) return null;
  return getPetSavedPosition();
}

void app.whenReady().then(() => {
  const vault = new LocalVault();
  vaultRef = vault;
  purgeRetiredCharacters(vault);
  applyDevSetup(vault);
  const llm = new LLMAdapter(() => {
    const json = vault.getSetting("llm_provider_json");
    const key = vault.getEncryptedString("llm_api_key_enc");
    if (!json || !key) return null;
    try {
      const rest = JSON.parse(json) as Omit<LLMProviderConfig, "apiKey">;
      return { ...rest, apiKey: key } as LLMProviderConfig;
    } catch {
      return null;
    }
  });
  const safety = new SafetyPolicy();
  const memory = new MemoryStore(vault);
  const profileExtractor = new ProfileExtractor(vault, memory, llm);
  profileExtractor.onApplied = (payload) => {
    broadcastToAllWindows(IPC.EventProfileUpdated, payload);
  };
  const runtime = new CharacterRuntime(vault, memory, llm, safety);
  const imageGen = new ImageGenerationAdapter(
    () => readImageConfigForMain(vault),
    () => {
      const json = vault.getSetting("llm_provider_json");
      const key = vault.getEncryptedString("llm_api_key_enc");
      if (!json || !key) return null;
      try {
        const rest = JSON.parse(json) as Omit<LLMProviderConfig, "apiKey">;
        return { ...rest, apiKey: key } as LLMProviderConfig;
      } catch {
        return null;
      }
    }
  );
  const orchestrator = new BailinOrchestrator(llm, { imageGen, vault });
  const screenCapture = new ScreenCaptureService();
  ambientMonitor = new AmbientMonitor();
  proactiveBubbleHost = new ProactiveBubbleHost({
    getPetWindow: () => petWin,
    getActiveCharacterId: () => activeCharacterId,
    devUrl
  });

  const proactive = new ProactiveOrchestrator({
    vault,
    getActiveCharacterId: () => activeCharacterId,
    isChatVisible,
    isPetVisible: () => Boolean(petWin && !petWin.isDestroyed() && petWin.isVisible()),
    broadcast: appBroadcast,
    getActiveMinutes: () => ambientMonitor?.getActiveMinutes() ?? 0,
    getMinutesUntilLongActive: () => ambientMonitor?.getMinutesUntilLongActive() ?? null,
    resetActiveSessionAfterWhisper: () => ambientMonitor?.resetActiveSessionAfterWhisper(),
    llm,
    memory,
    screenCapture
  });
  ambientMonitor.onSignal((signal) => {
    void proactive.handleSignal(signal);
  });
  ambientMonitor.start();
  syncProactiveAmbient(vault);
  llmProactiveTimer = setInterval(() => {
    void proactive.tickLlmWhisper();
  }, 5 * 60_000);

  activeCharacterId = vault.getSetting("active_character_id") || null;

  registerIpc({
    vault,
    memory,
    profileExtractor,
    runtime,
    orchestrator,
    llm,
    imageGen,
    proactive,
    getActiveCharacterId: () => activeCharacterId,
    setActiveCharacterId: (id) => {
      activeCharacterId = id;
      proactiveBubbleHost?.hide();
    },
    broadcast: appBroadcast,
    getPetBounds: () => {
      if (!petWin || petWin.isDestroyed()) return null;
      // 用 contentBounds 取位置（不受 electron#27651 size 漂移污染），
      // width/height 永远走常量，让气泡定位 / chat 跟随等下游消费者拿到稳定的几何。
      const content = petWin.getContentBounds();
      const { width, height } = getPetWindowSizeNow();
      return { x: content.x, y: content.y, width, height };
    },
    applyPetDisplayScale,
    syncProactiveAmbient: () => syncProactiveAmbient(vault),
    summonPetBubble,
    showChatNearPet,
    hideChat,
    isChatVisible,
    hidePet,
    setPetContextMenuOpen,
    dismissProactiveBubble: () => proactiveBubbleHost?.hide(),
    resizeProactiveBubble: (size) => proactiveBubbleHost?.resize(size),
    movePet,
    ensurePetOnScreen,
    ensureSettingsWindow,
    petDragStart,
    petDragMove,
    petDragEnd,
    getChatWindowSize,
    setChatWindowSize,
    onLocaleChanged: rebuildTrayMenu
  });

  registerChatTurnHandlers(runtime);
  registerChatSessionHandlers(runtime, vault);
  log.info("[main] chat turn IPC registered (deleteTurn, deleteTurnsFrom)");

  // 启动时同步打开角色仓库 + 桌宠；首启未完成则 Settings 走 Wizard（不传 tab）。
  const firstRunDone = vault.getSetting("first_run_done") === "1";
  if (firstRunDone) {
    openLibraryAndPet();
  } else {
    ensurePetWindow().show();
    ensureSettingsWindow();
  }

  // 恢复上次保存的桌宠位置（越界则拉回完整屏幕内）
  // 注意：这里用 display.bounds + margin 0，跟拖动 clamp 一致；
  // 之前用 workArea + margin 8 会把保存位置每次启动都"收缩"一截，
  // 多次后用户能感觉到桌宠的活动范围越用越小。
  // 同时统一走 setContentBounds + 常量 PET_WINDOW_SIZE，避开 electron#27651
  // 在 Windows 非整数 DPI 上 setPosition 累积漂移的 bug。
  try {
    const posJson = vault.getSetting(SETTING_PET_POS);
    if (posJson && petWin) {
      const pos = JSON.parse(posJson) as { x: number; y: number };
      if (typeof pos.x === "number" && typeof pos.y === "number") {
        const clamped = setPetContentOrigin(petWin, pos.x, pos.y);
        if (clamped.x !== pos.x || clamped.y !== pos.y) {
          vault.setSetting(SETTING_PET_POS, JSON.stringify(clamped));
        }
      }
    } else {
      positionPetAtPrimaryBottomRight();
    }
  } catch {
    // ignore corrupted position
    positionPetAtPrimaryBottomRight();
  }

  const ok = globalShortcut.register("CommandOrControl+Shift+P", () => {
    summonPetBubble();
  });
  if (!ok) {
    log.warn("[main] global shortcut Ctrl+Shift+P registration failed");
  }

  const trayIcon = loadAppIcon(16);
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.on("click", () => ensureSettingsWindow("library"));
  rebuildTrayMenu();

  app.on("window-all-closed", () => {
    // 不退出：保留托盘，由用户从托盘菜单显式退出。
  });
});

app.on("will-quit", () => {
  if (llmProactiveTimer) {
    clearInterval(llmProactiveTimer);
    llmProactiveTimer = null;
  }
  ambientMonitor?.stop();
  globalShortcut.unregisterAll();
});
