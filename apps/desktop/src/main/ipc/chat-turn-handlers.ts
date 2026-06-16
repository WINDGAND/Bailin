import { ipcMain } from "electron";
import { IPC, type DeleteChatTurnInput } from "../../shared/ipc-contract.js";
import type { CharacterRuntime } from "../runtime/character-runtime.js";

/**
 * 聊天消息删除 IPC（主进程入口显式注册，避免 dev 时 preload/main 版本不一致）。
 */
export function registerChatTurnHandlers(runtime: CharacterRuntime): void {
  ipcMain.removeHandler(IPC.ChatDeleteTurn);
  ipcMain.removeHandler(IPC.ChatDeleteTurnsFrom);

  ipcMain.handle(IPC.ChatDeleteTurn, (_e, input: DeleteChatTurnInput) => ({
    ok: runtime.deleteTurn(input.turnId)
  }));

  ipcMain.handle(IPC.ChatDeleteTurnsFrom, (_e, input: DeleteChatTurnInput) => ({
    ok: runtime.deleteTurnsFrom(input.characterId, input.sessionId, input.turnId)
  }));
}
