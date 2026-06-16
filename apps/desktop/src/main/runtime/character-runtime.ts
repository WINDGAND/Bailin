import { ulid } from "ulid";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { buildSystemPrompt } from "@nuwa-pet/nuwa-prompts";
import type { LLMAdapter, ChatChunk } from "../adapters/llm-adapter.js";
import type { LocalVault } from "../store/local-vault.js";
import type { MemoryStore } from "./memory-store.js";
import { GLOBAL_REFUSAL_LIST, SafetyPolicy } from "../safety/safety-policy.js";

/**
 * CharacterRuntime: 组装系统提示词、调度 LLM、把流式 chunk 投递给上层。
 */
export class CharacterRuntime {
  private firstActivation = new Set<string>();
  private active: AbortController | null = null;

  constructor(
    private vault: LocalVault,
    private memory: MemoryStore,
    private llm: LLMAdapter,
    private safety: SafetyPolicy
  ) {}

  cancelActive(): void {
    this.active?.abort();
    this.active = null;
  }

  newSession(characterId: string): string {
    this.firstActivation.delete(characterId);
    return ulid();
  }

  ensureSession(characterId: string, sessionId: string | undefined): string {
    if (sessionId && sessionId.length > 0) return sessionId;
    return this.newSession(characterId);
  }

  getRecentTurns(characterId: string, sessionId: string, limit: number) {
    return this.vault.getRecentTurns(characterId, sessionId, limit);
  }

  async *sendMessage(input: {
    bundle: CharacterBundle;
    sessionId: string;
    userContent: string;
    responseMode?: "bubble" | "full";
  }): AsyncGenerator<ChatChunk> {
    const { bundle, sessionId, userContent, responseMode = "full" } = input;
    const verdict = this.safety.check(userContent);
    if (verdict.kind === "hard-refuse") {
      yield { kind: "delta", text: verdict.defaultRefusal ?? this.safety.defaultRefusal() };
      yield { kind: "done", finishReason: "safety" };
      return;
    }

    const isFirst = !this.firstActivation.has(bundle.card.id);
    if (isFirst) this.firstActivation.add(bundle.card.id);

    const profile = this.memory.getProfile();
    const systemPromptBase = buildSystemPrompt({
      card: bundle.card,
      userProfile: profile,
      safety: { globalRefusalList: GLOBAL_REFUSAL_LIST },
      isFirstActivation: isFirst
    });
    const systemPrompt =
      responseMode === "bubble"
        ? `${systemPromptBase}

【桌宠气泡模式】
你现在是在桌面宠物旁边的短气泡里说话。最多回复 1-3 句中文短句，优先 12-40 个汉字。
不要长篇分析，不要列很多点，不要像客服或通用大模型。像一个有性格、在主人桌边轻声回应的伙伴。`
        : systemPromptBase;

    const history = this.vault.getRecentTurns(
      bundle.card.id,
      sessionId,
      bundle.runtime.context.historyTurnsKept
    );

    const userTurnId = ulid();
    const now = Date.now();
    this.vault.appendTurn({
      id: userTurnId,
      characterId: bundle.card.id,
      sessionId,
      role: "user",
      content: userContent,
      createdAt: now
    });

    const ac = new AbortController();
    this.active = ac;

    const messages = [
      ...history.map((t) => ({
        role: t.role === "system" ? "user" : (t.role as "user" | "assistant"),
        content: t.content
      })),
      { role: "user" as const, content: userContent }
    ];

    let assistantBuf = "";
    try {
      const stream = this.llm.chatStream({
        systemPrompt,
        messages,
        temperature: bundle.runtime.llm.temperature,
        maxTokens:
          responseMode === "bubble"
            ? Math.min(bundle.runtime.llm.maxTokens, 160)
            : bundle.runtime.llm.maxTokens,
        stream: true,
        signal: ac.signal
      });
      for await (const chunk of stream) {
        if (chunk.kind === "delta") {
          assistantBuf += chunk.text;
          yield chunk;
        } else {
          yield chunk;
        }
      }
    } finally {
      if (assistantBuf.length > 0) {
        this.vault.appendTurn({
          id: ulid(),
          characterId: bundle.card.id,
          sessionId,
          role: "assistant",
          content: assistantBuf,
          createdAt: Date.now()
        });
      }
      this.active = null;
    }
  }
}
