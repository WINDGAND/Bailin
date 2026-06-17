import { ulid } from "ulid";
import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { buildSystemPrompt } from "@nuwa-pet/nuwa-prompts";
import { profileForPrompt } from "../../shared/profile.js";
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
    const sessionId = ulid();
    this.vault.createChatSession(characterId, sessionId);
    this.vault.setActiveSessionId(characterId, sessionId);
    return sessionId;
  }

  getOrCreateActiveSession(characterId: string): string {
    const active = this.vault.getActiveSessionId(characterId);
    if (active && this.vault.chatSessionExists(active)) {
      return active;
    }
    const latest = this.vault.getLatestChatSession(characterId);
    if (latest) {
      this.vault.setActiveSessionId(characterId, latest.id);
      return latest.id;
    }
    return this.newSession(characterId);
  }

  listChatSessions(characterId: string, limit = 50) {
    return this.vault.listChatSessions(characterId, limit);
  }

  switchSession(characterId: string, sessionId: string): boolean {
    if (!this.vault.chatSessionExists(sessionId)) return false;
    this.vault.setActiveSessionId(characterId, sessionId);
    return true;
  }

  renameChatSession(sessionId: string, title: string): boolean {
    return this.vault.renameChatSession(sessionId, title);
  }

  deleteChatSession(characterId: string, sessionId: string): boolean {
    return this.vault.deleteChatSession(characterId, sessionId);
  }

  ensureSession(characterId: string, sessionId: string | undefined): string {
    if (sessionId && sessionId.length > 0) return sessionId;
    return this.newSession(characterId);
  }

  getRecentTurns(characterId: string, sessionId: string, limit: number) {
    return this.vault.getRecentTurns(characterId, sessionId, limit);
  }

  deleteTurn(turnId: string): boolean {
    return this.vault.deleteTurn(turnId);
  }

  deleteTurnsFrom(characterId: string, sessionId: string, turnId: string): boolean {
    return this.vault.deleteTurnsFrom(characterId, sessionId, turnId);
  }

  async *sendMessage(input: {
    bundle: CharacterBundle;
    sessionId: string;
    userContent: string;
    responseMode?: "bubble" | "full";
    userTurnId?: string;
    assistantTurnId?: string;
    /** 重新生成：不再写入 user turn，直接基于已有 history 请求 assistant。 */
    skipUserAppend?: boolean;
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
    const flat = profileForPrompt(profile);
    const systemPromptBase = buildSystemPrompt({
      card: bundle.card,
      userProfile: {
        preferredName: flat.preferredName,
        factsByCategory: flat.factsByCategory
      },
      safety: { globalRefusalList: GLOBAL_REFUSAL_LIST },
      isFirstActivation: isFirst
    });
    const systemPrompt =
      responseMode === "bubble"
        ? `${systemPromptBase}

【桌宠气泡模式】
你现在是在桌面宠物旁边的短气泡里说话。最多回复 1-3 句中文短句，优先 12-40 个汉字。
不要长篇分析，不要列很多点，不要像客服或通用大模型。像一个有性格、在主人桌边轻声回应的伙伴。`
        : `${systemPromptBase}

【完整聊天窗 · 排版】
你的回复会渲染为 Markdown，请主动用它提升可读性：
- 先用 1-2 句给出结论或态度，再展开；避免整段不分段的长墙文字
- 并列要点、步骤、建议用有序列表（1. 2. 3.）或无序列表（- ）
- 用 **加粗** 标出关键词、结论、行动项（每段 1-3 处即可，勿整段加粗）
- 单条列表项尽量控制在 1-2 行；需要强调的子句可单独加粗
- 不要输出 \`\`\` 代码块围栏，除非用户明确问代码`;

    const history = this.vault.getRecentTurns(
      bundle.card.id,
      sessionId,
      bundle.runtime.context.historyTurnsKept
    );

    const skipUserAppend = input.skipUserAppend === true;
    const userTurnId = input.userTurnId ?? ulid();
    const assistantTurnId = input.assistantTurnId ?? ulid();
    const now = Date.now();
    if (!skipUserAppend) {
      this.vault.appendTurn({
        id: userTurnId,
        characterId: bundle.card.id,
        sessionId,
        role: "user",
        content: userContent,
        createdAt: now
      });
    }

    const ac = new AbortController();
    this.active = ac;

    const historyMessages = history.map((t) => ({
      role: t.role === "system" ? "user" : (t.role as "user" | "assistant"),
      content: t.content
    }));
    const messages = skipUserAppend
      ? historyMessages
      : [...historyMessages, { role: "user" as const, content: userContent }];

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
          id: assistantTurnId,
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
