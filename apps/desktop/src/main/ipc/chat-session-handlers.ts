import { ipcMain } from "electron";
import {
  IPC,
  type DeleteChatSessionInput,
  type RenameChatSessionInput,
  type SwitchChatSessionInput
} from "../../shared/ipc-contract.js";
import type { CharacterRuntime } from "../runtime/character-runtime.js";
import type { LocalVault } from "../store/local-vault.js";

/**
 * 聊天会话列表 / 切换 / 重命名 / 删除 IPC。
 */
export function registerChatSessionHandlers(runtime: CharacterRuntime, vault: LocalVault): void {
  ipcMain.removeHandler(IPC.ChatGetActiveSession);
  ipcMain.removeHandler(IPC.ChatListSessions);
  ipcMain.removeHandler(IPC.ChatSwitchSession);
  ipcMain.removeHandler(IPC.ChatRenameSession);
  ipcMain.removeHandler(IPC.ChatDeleteSession);

  ipcMain.handle(IPC.ChatGetActiveSession, (_e, characterId: string) => ({
    sessionId: runtime.getOrCreateActiveSession(characterId)
  }));

  ipcMain.handle(IPC.ChatListSessions, (_e, characterId: string) =>
    runtime.listChatSessions(characterId)
  );

  ipcMain.handle(IPC.ChatSwitchSession, (_e, input: SwitchChatSessionInput) => ({
    ok: runtime.switchSession(input.characterId, input.sessionId)
  }));

  ipcMain.handle(IPC.ChatRenameSession, (_e, input: RenameChatSessionInput) => ({
    ok: runtime.renameChatSession(input.sessionId, input.title)
  }));

  ipcMain.handle(IPC.ChatDeleteSession, (_e, input: DeleteChatSessionInput) => {
    const active = vault.getActiveSessionId(input.characterId);
    const ok = runtime.deleteChatSession(input.characterId, input.sessionId);
    if (!ok) return { ok: false };

    if (active === input.sessionId) {
      const latest = vault.getLatestChatSession(input.characterId);
      if (latest) {
        vault.setActiveSessionId(input.characterId, latest.id);
      } else {
        runtime.newSession(input.characterId);
      }
    }
    return { ok: true };
  });
}
