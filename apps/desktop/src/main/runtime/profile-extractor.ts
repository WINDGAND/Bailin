/**
 * 用户画像自动抽取：按「每 N 轮用户发言」把近期对话交给 LLM，抽出差分写入 MemoryStore。
 *
 * 受设置项 `autoLearnEnabled` / `extractEveryNTurns` 控制；同一角色+会话同时只跑一次。
 * 解析失败或空差分直接返回，只打日志，不影响主聊天路径。
 */
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
  // 模型常把 JSON 包在 markdown 围栏里，先剥再找对象
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence?.[1]) candidate = fence[1];
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  // 取首个 `{` 到末个 `}`，容忍前后废话
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return null;
}

/** 一次抽取所需的角色与会话定位；`characterName` 只用于写入抽取 prompt。 */
export interface ProfileExtractInput {
  characterId: string;
  sessionId: string;
  characterName: string;
}

/** 进程内抽取器：构造后由 `register.ts` 注入 `onApplied` 以广播画像更新。 */
export class ProfileExtractor {
  private inflight = new Set<string>();

  constructor(
    private vault: LocalVault,
    private memory: MemoryStore,
    private llm: LLMAdapter
  ) {}

  /**
   * 按设置节流触发画像抽取。
   *
   * 关闭自动学习、抽取进行中、尚无用户发言、或用户轮次不是 `extractEveryNTurns` 的倍数时直接返回。
   *
   * @param input 角色 / 会话 / 角色名
   * @returns 无返回值；成功时通过 `onApplied` 广播，失败只记 warn
   */
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
    // 只在用户轮次落到 N 的倍数时抽，避免每轮都打 LLM
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
      // 模型偶尔吐出半截 JSON；不当成抽取失败抛给聊天路径
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
