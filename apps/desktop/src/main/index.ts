import { app, globalShortcut, Tray, Menu, nativeImage, BrowserWindow, dialog } from "electron";
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
    dialog.showErrorBox("百灵 Bailin · 主进程异常", err.stack || err.message || String(err));
  } catch {
    // ignore
  }
});
process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection", reason);
});

import { LocalVault } from "./store/local-vault.js";
import { applyDevSetup } from "./dev-setup.js";
import { LLMAdapter } from "./adapters/llm-adapter.js";
import { ImageGenerationAdapter } from "./adapters/image-generation-adapter.js";
import { SafetyPolicy } from "./safety/safety-policy.js";
import { MemoryStore } from "./runtime/memory-store.js";
import { CharacterRuntime } from "./runtime/character-runtime.js";
import { NuwaOrchestrator } from "./orchestration/nuwa-orchestrator.js";
import {
  broadcastToAllWindows,
  readImageConfigForMain,
  registerIpc,
  SETTING_PET_POS
} from "./ipc/register.js";
import { createPetWindow } from "./windows/pet-window.js";
import { createChatWindow, positionChatNear } from "./windows/chat-window.js";
import { createSettingsWindow } from "./windows/settings-window.js";
import type { LLMProviderConfig } from "../shared/ipc-contract.js";

log.initialize();
log.info("[main] Bailin starting...");

let tray: Tray | null = null;
let petWin: BrowserWindow | null = null;
let chatWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let activeCharacterId: string | null = null;
let isQuitting = false;

const devUrl = process.env.VITE_DEV_SERVER || undefined;

function ensureSettingsWindow(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = createSettingsWindow(devUrl);
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

function ensurePetWindow(): BrowserWindow {
  if (petWin && !petWin.isDestroyed()) return petWin;
  petWin = createPetWindow(devUrl);
  petWin.on("closed", () => {
    petWin = null;
  });
  return petWin;
}

function ensureChatWindow(): BrowserWindow {
  if (chatWin && !chatWin.isDestroyed()) return chatWin;
  chatWin = createChatWindow(devUrl);
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
  return chatWin;
}

function showChatNearPet(): void {
  const pet = ensurePetWindow();
  const chat = ensureChatWindow();
  const bounds = pet.getBounds();
  positionChatNear(chat, {
    petX: bounds.x,
    petY: bounds.y,
    petW: bounds.width,
    petH: bounds.height
  });
  chat.show();
  chat.focus();
  broadcastToAllWindows("nuwa.event.petSummon", null);
}

function hideChat(): void {
  if (chatWin && !chatWin.isDestroyed()) chatWin.hide();
}

function hidePet(): void {
  if (petWin && !petWin.isDestroyed()) petWin.hide();
}

function movePet(x: number, y: number): void {
  if (petWin && !petWin.isDestroyed()) petWin.setPosition(x, y);
}

void app.whenReady().then(() => {
  const vault = new LocalVault();
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
  const orchestrator = new NuwaOrchestrator(llm, { imageGen, vault });

  activeCharacterId = vault.getSetting("active_character_id") || null;

  registerIpc({
    vault,
    memory,
    runtime,
    orchestrator,
    llm,
    imageGen,
    getActiveCharacterId: () => activeCharacterId,
    setActiveCharacterId: (id) => {
      activeCharacterId = id;
    },
    broadcast: broadcastToAllWindows,
    getPetBounds: () => (petWin && !petWin.isDestroyed() ? petWin.getBounds() : null),
    showChatNearPet,
    hideChat,
    hidePet,
    movePet,
    ensureSettingsWindow
  });

  // 首启没完成 → 自动打开 Settings 走 Wizard；否则只确保桌宠在桌面，
  // Settings 由用户从托盘 / 桌宠右键菜单显式打开。
  const firstRunDone = vault.getSetting("first_run_done") === "1";
  if (!firstRunDone) {
    ensureSettingsWindow();
  }
  ensurePetWindow();

  // 恢复上次保存的桌宠位置
  try {
    const posJson = vault.getSetting(SETTING_PET_POS);
    if (posJson && petWin) {
      const pos = JSON.parse(posJson) as { x: number; y: number };
      if (typeof pos.x === "number" && typeof pos.y === "number") {
        petWin.setPosition(pos.x, pos.y);
      }
    }
  } catch {
    // ignore corrupted position
  }

  const ok = globalShortcut.register("CommandOrControl+Shift+P", () => {
    showChatNearPet();
  });
  if (!ok) {
    log.warn("[main] global shortcut Ctrl+Shift+P registration failed");
  }

  const trayIcon = nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip("百灵 Bailin");
  tray.on("click", () => showChatNearPet());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "唤起对话",
        click: () => showChatNearPet()
      },
      {
        label: "显示桌宠",
        click: () => {
          const pet = ensurePetWindow();
          pet.show();
        }
      },
      {
        label: "打开设置 / 角色仓库",
        click: () => ensureSettingsWindow()
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.exit(0);
        }
      }
    ])
  );

  app.on("window-all-closed", () => {
    // 不退出：保留托盘，由用户从托盘菜单显式退出。
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
