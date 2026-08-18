/**
 * 用户画像记忆仓库：把 LocalVault 中的画像、自动学习开关与变更日志封装成主进程 API。
 *
 * 对话抽取得到的 diff 经 `applyExtraction` 落盘，并保留可在 10 分钟窗口内撤销的 changelog。
 * 设置页与 IPC 通过本类读写全局画像、抽取频率，以及按角色隔离的便签。
 * 本文件不直接调 LLM；抽取与合并规则见 `profile-diff.ts`。
 */
import { ulid } from "ulid";
import type {
  MemorySettings,
  ProfileChange,
  ProfileChangeRecord,
  ProfileExtractionDiff,
  UserProfile
} from "../../shared/ipc-contract.js";
import type { LocalVault } from "../store/local-vault.js";
import {
  applyExtractionDiff,
  sanitizeManualProfile,
  type ApplyExtractionContext
} from "./profile-diff.js";

/** LocalVault 键：是否在对话中自动抽取并写入用户画像。 */
const SETTING_AUTO_LEARN = "memory.autoLearnEnabled";
/** LocalVault 键：每隔多少轮对话触发一次画像抽取。 */
const SETTING_EXTRACT_EVERY = "memory.extractEveryNTurns";
/** 最近一次抽取变更允许撤销的时间窗口（10 分钟）。超时后 `undoLastChange` 返回 expired。 */
const UNDO_WINDOW_MS = 10 * 60 * 1000;

const DEFAULT_SETTINGS: MemorySettings = {
  autoLearnEnabled: true,
  extractEveryNTurns: 2
};

/**
 * 面向主进程的画像读写门面。
 * 所有持久化都委托 `LocalVault`；调用方拿到的是规范化后的对象，而不是 vault 原始字符串。
 */
export class MemoryStore {
  constructor(private vault: LocalVault) {}

  /** 读取当前全局用户画像（称呼 + 事实列表）。无副作用。 */
  getProfile(): UserProfile {
    return this.vault.getProfile();
  }

  /**
   * 用手动补丁覆盖画像并落盘。
   * `preferredName` 显式传入（含空串）才覆盖；`facts` 缺省则保留原列表。
   * 写入前经 `sanitizeManualProfile` 清洗，避免脏文本进入提示词。
   * @returns 清洗后实际保存的画像。
   */
  updateProfile(patch: Partial<UserProfile>): UserProfile {
    const cur = this.vault.getProfile();
    const merged: Partial<UserProfile> = {
      preferredName: patch.preferredName !== undefined ? patch.preferredName : cur.preferredName,
      facts: patch.facts ?? cur.facts
    };
    const next = sanitizeManualProfile(merged);
    this.vault.setProfile(next);
    return next;
  }

  /** 清空全局画像。不影响按角色便签与抽取 changelog。 */
  clearProfile(): void {
    this.vault.clearProfile();
  }

  /**
   * 读取自动学习开关与抽取间隔。
   * vault 中开关以 `"1"` / `"0"` 存储；键缺失时回退 `DEFAULT_SETTINGS`。
   * 间隔必须解析为正整数，否则同样回退默认（每 2 轮抽一次）。
   */
  getSettings(): MemorySettings {
    const autoRaw = this.vault.getSetting(SETTING_AUTO_LEARN);
    const everyRaw = this.vault.getSetting(SETTING_EXTRACT_EVERY);
    return {
      autoLearnEnabled: autoRaw === null ? DEFAULT_SETTINGS.autoLearnEnabled : autoRaw === "1",
      extractEveryNTurns:
        everyRaw !== null && Number.parseInt(everyRaw, 10) > 0
          ? Number.parseInt(everyRaw, 10)
          : DEFAULT_SETTINGS.extractEveryNTurns
    };
  }

  /**
   * 部分更新记忆设置并写回 vault。
   * 未出现在 patch 中的字段保持现状；布尔开关序列化为 `"1"` / `"0"`。
   * @returns 合并后的完整设置，供 IPC 回传设置页。
   */
  setSettings(patch: Partial<MemorySettings>): MemorySettings {
    const cur = this.getSettings();
    const next: MemorySettings = {
      autoLearnEnabled: patch.autoLearnEnabled ?? cur.autoLearnEnabled,
      extractEveryNTurns: patch.extractEveryNTurns ?? cur.extractEveryNTurns
    };
    this.vault.setSetting(SETTING_AUTO_LEARN, next.autoLearnEnabled ? "1" : "0");
    this.vault.setSetting(SETTING_EXTRACT_EVERY, String(next.extractEveryNTurns));
    return next;
  }

  /**
   * 最近若干条画像变更记录（新到旧），给设置页「刚才学到了什么」列表用。
   * @param limit 条数上限，默认 5。
   */
  getRecentChanges(limit = 5): ProfileChangeRecord[] {
    return this.vault.getRecentProfileChangelog(limit);
  }

  /**
   * 把一次 LLM 抽取 diff 应用到当前画像。
   * `applyExtractionDiff` 判定无有效变更时不写盘，返回 `applied: false` 与抽取前画像。
   * 成功时写入新画像，并把「变更条目 + 抽取前快照」追加进 changelog，供限时撤销。
   * @param diff 抽取器产出的增删改建议
   * @param ctx 角色 / 会话上下文；`now` 缺省为当前时间
   */
  applyExtraction(
    diff: ProfileExtractionDiff,
    ctx: ApplyExtractionContext
  ): { profile: UserProfile; changes: ProfileChange[]; applied: boolean } {
    const before = this.vault.getProfile();
    const result = applyExtractionDiff(before, diff, ctx);
    if (!result.applied) {
      return { profile: before, changes: [], applied: false };
    }
    this.vault.setProfile(result.profile);
    const record: ProfileChangeRecord = {
      id: ulid(),
      appliedAt: ctx.now ?? Date.now(),
      changes: result.changes
    };
    this.vault.appendProfileChangelog(record, before);
    return result;
  }

  /**
   * 撤销最近一次抽取写入：用 changelog 里的抽取前快照覆盖当前画像并删除该条目。
   * 无记录时 `reason: "no_change"`；超过 `UNDO_WINDOW_MS` 则 `reason: "expired"` 且不改盘。
   */
  undoLastChange(): { ok: boolean; profile?: UserProfile; reason?: string } {
    const latest = this.vault.getLatestProfileChangelogSnapshot();
    if (!latest) return { ok: false, reason: "no_change" };
    const age = Date.now() - latest.entry.appliedAt;
    if (age > UNDO_WINDOW_MS) return { ok: false, reason: "expired" };
    this.vault.setProfile(latest.snapshot);
    this.vault.deleteProfileChangelogEntry(latest.entry.id);
    return { ok: true, profile: latest.snapshot };
  }

  /**
   * 读取某角色专属便签（与全局画像分离，不进跨角色提示词）。
   * @param characterId 角色 ID
   */
  getPerCharacter(characterId: string): string[] {
    return this.vault.getPerCharacterNotes(characterId);
  }

  /**
   * 覆盖写入某角色的便签列表。
   * @param characterId 角色 ID
   * @param notes 便签全文，调用方负责截断与去空。
   */
  setPerCharacter(characterId: string, notes: string[]): void {
    this.vault.setPerCharacterNotes(characterId, notes);
  }

  /** 删除某角色的全部便签。 */
  clearPerCharacter(characterId: string): void {
    this.vault.clearPerCharacterNotes(characterId);
  }
}

/** 再导出抽取上下文类型，避免调用方再从 `profile-diff` 间接引用。 */
export type { ApplyExtractionContext };
