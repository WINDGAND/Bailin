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

const SETTING_AUTO_LEARN = "memory.autoLearnEnabled";
const SETTING_EXTRACT_EVERY = "memory.extractEveryNTurns";
const UNDO_WINDOW_MS = 10 * 60 * 1000;

const DEFAULT_SETTINGS: MemorySettings = {
  autoLearnEnabled: true,
  extractEveryNTurns: 2
};

export class MemoryStore {
  constructor(private vault: LocalVault) {}

  getProfile(): UserProfile {
    return this.vault.getProfile();
  }

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

  clearProfile(): void {
    this.vault.clearProfile();
  }

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

  getRecentChanges(limit = 5): ProfileChangeRecord[] {
    return this.vault.getRecentProfileChangelog(limit);
  }

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

  undoLastChange(): { ok: boolean; profile?: UserProfile; reason?: string } {
    const latest = this.vault.getLatestProfileChangelogSnapshot();
    if (!latest) return { ok: false, reason: "no_change" };
    const age = Date.now() - latest.entry.appliedAt;
    if (age > UNDO_WINDOW_MS) return { ok: false, reason: "expired" };
    this.vault.setProfile(latest.snapshot);
    this.vault.deleteProfileChangelogEntry(latest.entry.id);
    return { ok: true, profile: latest.snapshot };
  }

  getPerCharacter(characterId: string): string[] {
    return this.vault.getPerCharacterNotes(characterId);
  }

  setPerCharacter(characterId: string, notes: string[]): void {
    this.vault.setPerCharacterNotes(characterId, notes);
  }

  clearPerCharacter(characterId: string): void {
    this.vault.clearPerCharacterNotes(characterId);
  }
}

export type { ApplyExtractionContext };
