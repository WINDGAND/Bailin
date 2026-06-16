import log from "electron-log/main";
import type { LocalVault } from "./store/local-vault.js";

/**
 * 已从产品中移除的角色。按 sourceName / 显示名 / 英文名做不区分大小写的部分匹配。
 * 启动时从 LocalVault 删除，并清理 active_character_id。
 */
const RETIRED_SOURCE_NAMES = [
  "elon musk",
  "donald trump",
  "donald j. trump",
  "xuefeng zhang",
  "mrbeast",
  "jimmy donaldson",
  "eren yeager",
  "kobe bryant",
  "jay chou",
  "jielun zhou",
  "zhou jielun"
] as const;

const RETIRED_DISPLAY_NAMES = [
  "埃隆·马斯克",
  "马斯克",
  "唐纳德·特朗普",
  "特朗普",
  "张雪峰",
  "吉米·唐纳森",
  "艾伦·耶格尔",
  "科比·布莱恩特",
  "科比",
  "周杰伦"
] as const;

function matchesRetired(name: string, sourceName: string | undefined): boolean {
  const n = name.toLowerCase();
  const s = (sourceName ?? "").toLowerCase();
  for (const key of RETIRED_SOURCE_NAMES) {
    if (n.includes(key) || s.includes(key)) return true;
  }
  for (const key of RETIRED_DISPLAY_NAMES) {
    if (name.includes(key) || (sourceName ?? "").includes(key)) return true;
  }
  return false;
}

export function purgeRetiredCharacters(vault: LocalVault): void {
  const activeId = vault.getSetting("active_character_id");
  let removed = 0;

  for (const row of vault.listCharacters()) {
    if (!matchesRetired(row.name, row.sourceName)) continue;
    vault.deleteCharacter(row.id);
    removed += 1;
    log.info(`[retired-characters] 已删除角色：${row.name} (${row.id})`);
    if (activeId === row.id) {
      vault.setSetting("active_character_id", "");
    }
  }

  if (removed > 0) {
    log.info(`[retired-characters] 共清理 ${removed} 个已下架角色`);
  }
}
