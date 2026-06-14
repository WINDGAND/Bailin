import type { UserProfile } from "../../shared/ipc-contract.js";
import type { LocalVault } from "../store/local-vault.js";

export class MemoryStore {
  constructor(private vault: LocalVault) {}

  getProfile(): UserProfile {
    return this.vault.getProfile();
  }

  updateProfile(patch: Partial<UserProfile>): UserProfile {
    const cur = this.vault.getProfile();
    const next: UserProfile = {
      preferredName: patch.preferredName !== undefined ? patch.preferredName : cur.preferredName,
      currentGoals: patch.currentGoals ?? cur.currentGoals,
      ongoingConcerns: patch.ongoingConcerns ?? cur.ongoingConcerns,
      tabooTopics: patch.tabooTopics ?? cur.tabooTopics
    };
    this.vault.setProfile(next);
    return next;
  }

  clearProfile(): void {
    this.vault.clearProfile();
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
