/**
 * 角色对话运行时：会话 CRUD、安全闸门、系统提示组装，以及把 LLM 流式输出写入 vault。
 *
 * 主进程 IPC 通过本类发消息；桌宠气泡与完整聊天窗共用 `sendMessage`，靠 `responseMode` 区分长度与排版。
 * 安全硬拒不走模型；软拒仍交给角色口吻（见 `SafetyPolicy`）。本文件不直接碰 SQLite schema。
 */
import { ulid } from "ulid";
import type { CharacterBundle } from "@bailin/character-protocol";
import { buildSystemPrompt } from "@bailin/prompts";
import { profileForPrompt } from "../../shared/profile.js";
import type { LLMAdapter, ChatChunk } from "../adapters/llm-adapter.js";
import type { LocalVault } from "../store/local-vault.js";
import type { MemoryStore } from "./memory-store.js";
import { GLOBAL_REFUSAL_LIST, SafetyPolicy } from "../safety/safety-policy.js";

/**
 * 面向主进程的对话调度器。
 * 持久化委托 `LocalVault`；画像只读 `MemoryStore`；真正的 HTTP 流在 `LLMAdapter`。
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

  /** 中止当前进行中的流式回复；无进行中请求时为空操作。 */
  cancelActive(): void {
    this.active?.abort();
    this.active = null;
  }

  /**
   * 新建会话并设为当前会话。同时清掉该角色的 firstActivation，让下一轮再走开场介绍。
   * @returns 新 sessionId
   */
  newSession(characterId: string): string {
    this.firstActivation.delete(characterId);
    const sessionId = ulid();
    this.vault.createChatSession(characterId, sessionId);
    this.vault.setActiveSessionId(characterId, sessionId);
    return sessionId;
  }

  /**
   * 返回该角色当前会话；vault 里没有有效 active 时回退到最近一条，再没有则新建。
   * 副作用：可能写入 `activeSessionId` 或创建新会话。
   */
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

  /** 列出该角色的会话摘要，默认最多 50 条。无副作用。 */
  listChatSessions(characterId: string, limit = 50) {
    return this.vault.listChatSessions(characterId, limit);
  }

  /**
   * 切换当前会话。会话不存在时返回 false，不改 active。
   * @returns 是否切换成功
   */
  switchSession(characterId: string, sessionId: string): boolean {
    if (!this.vault.chatSessionExists(sessionId)) return false;
    this.vault.setActiveSessionId(characterId, sessionId);
    return true;
  }

  /** 重命名会话标题；会话不存在时返回 false。 */
  renameChatSession(sessionId: string, title: string): boolean {
    return this.vault.renameChatSession(sessionId, title);
  }

  /** 删除会话及其全部 turn；会话不存在时返回 false。 */
  deleteChatSession(characterId: string, sessionId: string): boolean {
    return this.vault.deleteChatSession(characterId, sessionId);
  }

  /**
   * 有有效 sessionId 则原样返回，否则新建会话。
   * 给 IPC 入口兜底：渲染进程漏传 session 时仍能落盘。
   */
  ensureSession(characterId: string, sessionId: string | undefined): string {
    if (sessionId && sessionId.length > 0) return sessionId;
    return this.newSession(characterId);
  }

  /** 读取该会话最近若干 turn，供 UI 与 LLM history 共用。无副作用。 */
  getRecentTurns(characterId: string, sessionId: string, limit: number) {
    return this.vault.getRecentTurns(characterId, sessionId, limit);
  }

  /** 删除单条 turn；不存在时返回 false。 */
  deleteTurn(turnId: string): boolean {
    return this.vault.deleteTurn(turnId);
  }

  /** 删除该会话中自 `turnId` 起的后续 turn（含自身），用于「从这里重新生成」。 */
  deleteTurnsFrom(characterId: string, sessionId: string, turnId: string): boolean {
    return this.vault.deleteTurnsFrom(characterId, sessionId, turnId);
  }

  /**
   * 发送一轮用户消息并流式产出 assistant chunk。
   *
   * 副作用：把 user/assistant turn 写入 vault、替换 `this.active` 供 `cancelActive` 中止本轮、标记 firstActivation。
   * `skipUserAppend` 用于重新生成：history 里已有本轮 user，不再追加。
   * 硬拒直接 yield 拒答文案并以 `finishReason=safety` 结束，不调用 LLM。
   */
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
    // 硬拒（如未成年色情）不走模型，避免把越界请求送进供应商日志。
    if (verdict.kind === "hard-refuse") {
      yield { kind: "delta", text: verdict.defaultRefusal ?? this.safety.defaultRefusal() };
      yield { kind: "done", finishReason: "safety" };
      return;
    }

    // 进程内首次激活：用来在 system prompt 里触发角色自我介绍；重启主进程会重置。
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

    // ChatRequest 只接受 user|assistant；旧 system turn 并入 user，避免被适配器丢掉。
    const historyMessages = history.map((t) => ({
      role: t.role === "system" ? "user" : (t.role as "user" | "assistant"),
      content: t.content
    }));
    // 重新生成时 history 已含本轮 user，再 append 会重复提问。
    const messages = skipUserAppend
      ? historyMessages
      : [...historyMessages, { role: "user" as const, content: userContent }];

    let assistantBuf = "";
    try {
      const stream = this.llm.chatStream({
        systemPrompt,
        messages,
        temperature: bundle.runtime.llm.temperature,
        // 气泡模式硬截断 token，避免短气泡被长文撑破。
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
      // 流中途 abort / 报错也要把已产出的 assistant 落盘，避免界面有字、库里没有。
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
