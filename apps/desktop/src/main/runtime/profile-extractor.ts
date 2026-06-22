import { buildProfileExtractionPrompt } from "@bailin/prompts";
import log from "electron-log/main";
import type { LLMAdapter } from "../adapters/llm-adapter.js";
import type { LocalVault } from "../store/local-vault.js";
import { profileForPrompt } from "../../shared/profile.js";
import type { MemoryStore } from "./memory-store.js";
import {
  isEmptyExtractionDiff,
  parseExtractionDiff
} from "./profile-diff.js";

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  let candidate = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence?.[1]) candidate = fence[1];
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return null;
}

export interface ProfileExtractInput {
  characterId: string;
  sessionId: string;
  characterName: string;
}

export class ProfileExtractor {
  private inflight = new Set<string>();

  constructor(
    private vault: LocalVault,
    private memory: MemoryStore,
    private llm: LLMAdapter
  ) {}

  async maybeExtract(input: ProfileExtractInput): Promise<void> {
    const settings = this.memory.getSettings();
    if (!settings.autoLearnEnabled) return;

    const key = `${input.characterId}:${input.sessionId}`;
    if (this.inflight.has(key)) return;

    const turns = this.vault
      .getRecentTurns(input.characterId, input.sessionId, 24)
      .filter((t) => t.role === "user" || t.role === "assistant");
    const userTurnCount = turns.filter((t) => t.role === "user").length;
    if (userTurnCount === 0) return;
    if (userTurnCount % settings.extractEveryNTurns !== 0) return;

    this.inflight.add(key);
    try {
      await this.runExtraction(input, turns);
    } catch (e) {
      log.warn("[profile-extractor] failed", e);
    } finally {
      this.inflight.delete(key);
    }
  }

  private async runExtraction(
    input: ProfileExtractInput,
    turns: Array<{ role: string; content: string }>
  ): Promise<void> {
    const profile = this.memory.getProfile();
    const flat = profileForPrompt(profile);
    const { system, user } = buildProfileExtractionPrompt({
      characterName: input.characterName,
      currentProfile: {
        preferredName: flat.preferredName,
        facts: flat.facts
      },
      recentTurns: turns.slice(-10).map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content
      }))
    });

    const result = await this.llm.chatOnce({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      temperature: 0.2,
      maxTokens: 400,
      stream: false
    });

    if (result.kind !== "done") return;

    const jsonText = extractJson(result.text);
    if (!jsonText) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return;
    }

    const diff = parseExtractionDiff(parsed);
    if (!diff || isEmptyExtractionDiff(diff)) return;

    const applied = this.memory.applyExtraction(diff, {
      characterId: input.characterId,
      sessionId: input.sessionId
    });

    if (applied.applied && this.onApplied) {
      this.onApplied({
        changes: applied.changes,
        profile: applied.profile
      });
    }
  }

  /** 由 register.ts 注入，用于广播 EventProfileUpdated。 */
  onApplied?: (payload: {
    changes: import("../../shared/ipc-contract.js").ProfileChange[];
    profile: import("../../shared/ipc-contract.js").UserProfile;
  }) => void;
}
