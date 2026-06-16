import type {
  CharacterBundle,
  DistillationJob,
  DistillationJobConfig,
  QualityReport,
  ResearchAgentId,
  ResearchDoc
} from "@nuwa-pet/character-protocol";

/**
 * 渲染进程与主进程之间的 IPC 契约。
 * Preload 暴露给渲染进程一个 `window.nuwa` 对象，下方所有方法都通过 ipcRenderer.invoke。
 */

export interface BailinApi {
  // ===== 系统 / 首启 =====
  app: {
    isFirstRun(): Promise<boolean>;
    completeFirstRun(): Promise<void>;
    quit(): Promise<void>;
  };

  // ===== LLM 提供商 =====
  llm: {
    setProvider(input: LLMProviderConfig): Promise<{ ok: boolean; error?: string }>;
    getProvider(): Promise<LLMProviderConfig | null>;
    testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
    clearKey(): Promise<void>;
  };

  // ===== 生图提供商（hatch-pet 主路径专用） =====
  imageGen: {
    /** 当前生图配置（不含 apiKey；apiKey 由 vault DPAPI 加密单独存）。 */
    getConfig(): Promise<ImageGenerationConfigDTO | null>;
    /** 写入生图配置；apiKey 单独走加密存储。 */
    setConfig(input: ImageGenerationConfigDTO): Promise<{ ok: boolean; error?: string }>;
    /** 静态检测：当前 provider 是否就绪。 */
    detectCapability(): Promise<{ ok: boolean; reason: string }>;
    /**
     * 实测：用 economy tier 生成一张小图，验证 baseUrl / apiKey / model 是否真能通。
     * 不返回图片本体，只返回耗时和成本估算。
     */
    test(tier?: ImageTierName): Promise<{
      ok: boolean;
      latencyMs?: number;
      tier?: ImageTierName;
      model?: string;
      estimatedCostUsd?: number;
      error?: string;
    }>;
    /** 清空 image 单独的 apiKey；不影响 useLLMProvider=true 时的 LLM Key。 */
    clearKey(): Promise<void>;
  };

  // ===== 角色仓库 =====
  characters: {
    list(): Promise<CharacterListItem[]>;
    get(characterId: string): Promise<CharacterBundle | null>;
    importStarter(starterId: string): Promise<{ ok: boolean; characterId?: string; error?: string }>;
    create(input: CreateCharacterInput): Promise<{ ok: boolean; characterId?: string; isSkeleton?: boolean; warnings?: string[]; error?: string }>;
    /** 深度蒸馏：发起后立即返回 jobId，进度通过 EventDistillationProgress 推送。 */
    createDeep(
      input: DistillationJobConfig
    ): Promise<{ ok: boolean; jobId?: string; error?: string }>;
    /** Checkpoint 用户「同意」继续。 */
    approveDistillation(input: { jobId: string; phase: "research" | "synthesis" }): Promise<{ ok: boolean }>;
    /** Checkpoint 用户「取消 / 退回快速版」。 */
    cancelDistillation(jobId: string): Promise<{ ok: boolean }>;
    /** 取回某 job 已落盘的调研文档（用于 UI 在 Checkpoint 1 展示）。 */
    getResearchDocs(jobId: string): Promise<ResearchDoc[]>;
    /** 取回某角色的调研档案 + 质量报告（用于 CharacterLibrary 详情）。 */
    getResearchByCharacter(characterId: string): Promise<{
      docs: ResearchDoc[];
      qualityReport?: QualityReport;
    }>;
    regenerateSprite(characterId: string): Promise<{ ok: boolean; warnings?: string[]; error?: string }>;
    /**
     * v0.2：用新一批 referenceImages（或复用旧的）重新跑「外貌调研 + sprite」管道，
     * 不动人格 / 调研档案。
     */
    regenerateAppearance(input: {
      characterId: string;
      referenceImages?: ReferenceImageInput[];
      userHint?: string;
    }): Promise<{ ok: boolean; warnings?: string[]; error?: string }>;
    delete(characterId: string): Promise<{ ok: boolean }>;
    activate(characterId: string): Promise<{ ok: boolean }>;
    getActive(): Promise<CharacterBundle | null>;
    listStarters(): Promise<StarterMetaDto[]>;
    /** 探测当前 provider 是否支持 web_search（用于 UI 决定是否显示深度版）。 */
    detectCapabilities(): Promise<{ webSearch: boolean; reason: string }>;
    /** 静态检查：读图模型（visionModel）是否声明支持 vision，与主模型分离。 */
    detectVisionCapability(): Promise<{
      vision: boolean;
      reason: string;
      visionModel: string;
      mainModel: string;
    }>;
    /** 实测：发一张 1x1 透明 PNG，验证代理 / 模型是否真能吃图。 */
    probeVision(): Promise<{ ok: boolean; latencyMs?: number; reason?: string }>;
    /** 实测：发一个最小 search ping，看代理是否真返回 annotations。 */
    probeWebSearch(): Promise<{
      ok: boolean;
      realWebSearch: boolean;
      latencyMs?: number;
      citations: number;
      reason?: string;
    }>;
  };

  // ===== 对话 =====
  chat: {
    send(input: SendMessageInput): Promise<{ requestId: string; userTurnId: string; assistantTurnId: string }>;
    cancel(requestId: string): Promise<void>;
    newSession(characterId: string): Promise<{ sessionId: string }>;
    getActiveSession(characterId: string): Promise<{ sessionId: string }>;
    getRecent(characterId: string, sessionId?: string): Promise<ChatTurn[]>;
    listSessions(characterId: string): Promise<ChatSessionSummary[]>;
    switchSession(input: SwitchChatSessionInput): Promise<{ ok: boolean }>;
    renameSession(input: RenameChatSessionInput): Promise<{ ok: boolean }>;
    deleteSession(input: DeleteChatSessionInput): Promise<{ ok: boolean }>;
    hide(): Promise<void>;
    getSize(): Promise<{ width: number; height: number }>;
    resize(input: { width: number; height: number }): Promise<{ width: number; height: number }>;
    deleteTurn(input: DeleteChatTurnInput): Promise<{ ok: boolean }>;
    deleteTurnsFrom(input: DeleteChatTurnInput): Promise<{ ok: boolean }>;
  };

  // ===== 记忆 =====
  memory: {
    getProfile(): Promise<UserProfile>;
    updateProfile(input: Partial<UserProfile>): Promise<UserProfile>;
    clearProfile(): Promise<void>;
    getPerCharacter(characterId: string): Promise<string[]>;
    clearPerCharacter(characterId: string): Promise<void>;
    clearAll(): Promise<void>;
  };

  // ===== 桌宠窗口控制 =====
  pet: {
    summon(): Promise<void>;
    hush(durationMs: number): Promise<void>;
    setPosition(x: number, y: number): Promise<void>;
    setMouseIgnore(ignore: boolean): Promise<void>;
    openChat(): Promise<void>;
    openSettings(): Promise<void>;
    hide(): Promise<void>;
    /** 拖动开始：主进程记录光标相对窗口的偏移（全在主进程物理坐标系内）。*/
    dragStart(): Promise<void>;
    /** 拖动移动：主进程用 getCursorScreenPoint() 算出新位置并 clamp。*/
    dragMove(): Promise<void>;
    /** 拖动结束：清理拖动状态并保存最终位置。*/
    dragEnd(): Promise<void>;
  };

  // ===== 主动陪伴 / 屏幕感知 =====
  proactive: {
    getSettings(): Promise<ProactiveSettings>;
    setSettings(input: ProactiveSettings): Promise<ProactiveSettings>;
    getStatus(): Promise<ProactiveStatus>;
    triggerNow(reason?: AmbientSignal["kind"]): Promise<{ ok: boolean; reason?: string }>;
  };

  // ===== 事件订阅（主→渲染）=====
  on: {
    chatStream(handler: (chunk: ChatStreamChunk) => void): () => void;
    activeCharacterChanged(handler: (bundle: CharacterBundle | null) => void): () => void;
    petSummon(handler: () => void): () => void;
    proactiveWhisper(handler: (evt: ProactiveWhisperEvent) => void): () => void;
    ambientSignal(handler: (evt: AmbientSignal) => void): () => void;
    /** 深度蒸馏的实时进度（包含 6 个 Agent 各自的开始 / 结束）。 */
    distillationProgress(handler: (evt: DistillationProgressEvent) => void): () => void;
  };
}

/** 渲染进程接收到的深度蒸馏事件（与 NuwaOrchestrator.DeepProgressEvent 对齐，但去掉了 bundle 类型）。 */
export type DistillationProgressEvent =
  | { kind: "started"; jobId: string }
  | { kind: "phase"; jobId: string; phase: DistillationJob["status"]; progress: number; message: string }
  | { kind: "agent_start"; jobId: string; agentId: ResearchAgentId; agentName: string }
  | { kind: "agent_done"; jobId: string; doc: ResearchDoc }
  | { kind: "research_complete"; jobId: string; summary: ResearchSummaryPayload }
  | { kind: "synthesis_summary"; jobId: string; summary: SynthesisSummaryPayload }
  | { kind: "appearance_ready"; jobId: string; appearance: unknown }
  | { kind: "quality_report"; jobId: string; report: QualityReport }
  | { kind: "warning"; jobId: string; message: string }
  | { kind: "hatch_progress"; jobId: string; event: HatchProgressEventDTO }
  | {
      kind: "done";
      jobId: string;
      characterId: string;
      isSkeleton: boolean;
      warnings: string[];
    }
  | { kind: "failed"; jobId: string; reason: string; warnings: string[] }
  | { kind: "cancelled"; jobId: string };

/**
 * Hatch-pet 进度 DTO（主进程到渲染层）。
 * 与 HatchPetPipeline 的内部事件一致，但用扁平字段避免共享类型循环依赖。
 */
export type HatchProgressEventDTO =
  | {
      kind: "start";
      runId: string;
      jobsCount: number;
      estimatedCostUsd: number;
    }
  | { kind: "job_start"; jobId: string; rowState: string }
  | {
      kind: "job_done";
      jobId: string;
      rowState: string;
      durationMs: number;
      costUsd?: number;
    }
  | {
      kind: "job_failed";
      jobId: string;
      rowState: string;
      reason: string;
    }
  | { kind: "job_mirrored"; jobId: string; from: string }
  | {
      kind: "atlas_composed";
      ok: boolean;
      issuesCount: number;
      issuesPreview: string[];
    }
  | {
      kind: "qa_ready";
      contactSheetPath: string;
      previewPath?: string;
      atlasPath: string;
    };

export interface ResearchSummaryPayload {
  docs: Array<
    Pick<
      ResearchDoc,
      "agentId" | "agentName" | "status" | "confidence" | "webSearchUsed" | "durationMs" | "sources" | "errorMessage"
    > & { excerpt: string }
  >;
  okCount: number;
  failedCount: number;
  totalDurationMs: number;
}

export interface SynthesisSummaryPayload {
  mentalModelNames: string[];
  heuristicsCount: number;
  expressionSignatures: string[];
  expressionForbidden: string[];
  tensions: string[];
  honestyNotes: string[];
}

export interface LLMProviderConfig {
  kind: "openai-compatible" | "anthropic-compatible";
  baseUrl: string;
  apiKey: string;
  /** 主模型：对话、人格卡、框架提炼等（推荐 deepseek-v4-flash 等纯文本模型）。 */
  model: string;
  /**
   * 参考图读图 / 外貌 vision 专用模型（与 model 分离）。
   * 默认 bytedance/doubao-seed-2.0-lite-260428。
   */
  visionModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

export type ImageTierName = "economy" | "standard" | "premium";

export interface ImageTierConfigDTO {
  model: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  quality?: "low" | "medium" | "high" | "standard" | "hd";
  estimatedCostUsd?: number;
}

/**
 * 写入 / 读取生图配置时的 DTO；apiKey 单独走 setConfig 的可选字段。
 * - useLLMProvider=true：忽略 baseUrl / apiKey，复用 LLM 提供商
 * - useLLMProvider=false：必须传 baseUrl，第一次必须传 apiKey
 */
export interface ImageGenerationConfigDTO {
  useLLMProvider: boolean;
  baseUrl?: string;
  /** 仅在 setConfig 时使用；getConfig 永远返回 undefined（不回传密钥）。 */
  apiKey?: string;
  tiers: Record<ImageTierName, ImageTierConfigDTO>;
  defaultTier: ImageTierName;
}

export interface CharacterListItem {
  id: string;
  name: string;
  sourceName?: string;
  track: "utility" | "companion";
  isSkeleton: boolean;
  isActive: boolean;
}

export interface CreateCharacterInput {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  track: "utility" | "companion";
  userHint?: string;
  userMaterial?: string;
  /**
   * v0.2：快速模式也支持参考图。若视觉模型（默认豆包 Seed 2.0 Lite）可用且用户上传了图，
   * 就走 vision 路径；否则降级到纯文本。
   */
  referenceImages?: ReferenceImageInput[];
}

/** 从渲染进程传到 main 的参考图（已转 data URI 或 URL）。 */
export interface ReferenceImageInput {
  /** https:// URL 或 data:image/...;base64,... */
  url: string;
  source: "user-upload" | "web";
  role?: "primary" | "reference";
  notes?: string;
}

export interface StarterMetaDto {
  id: string;
  name: string;
  sourceName: string;
  track: "utility" | "companion";
  blurb: string;
}

export interface SendMessageInput {
  characterId: string;
  sessionId: string;
  content: string;
  /** bubble = 桌宠气泡短回复；chat = 完整聊天窗长回复。 */
  surface?: "bubble" | "chat";
  userTurnId?: string;
  assistantTurnId?: string;
  /** 重新生成 assistant 回复时设为 true，不再重复写入 user turn。 */
  skipUserAppend?: boolean;
}

export interface DeleteChatTurnInput {
  characterId: string;
  sessionId: string;
  turnId: string;
}

export interface SwitchChatSessionInput {
  characterId: string;
  sessionId: string;
}

export interface RenameChatSessionInput {
  characterId: string;
  sessionId: string;
  title: string;
}

export interface DeleteChatSessionInput {
  characterId: string;
  sessionId: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatStreamChunk {
  requestId: string;
  sessionId: string;
  done: boolean;
  delta?: string;
  error?: string;
  finishReason?: "stop" | "length" | "error" | "safety";
  assistantTurnId?: string;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface UserProfile {
  preferredName?: string;
  currentGoals: string[];
  ongoingConcerns: string[];
  tabooTopics: string[];
}

export interface ProactiveSettings {
  enabled: boolean;
  intensity: "off" | "light" | "standard";
  maxPerHour: 0 | 1 | 2;
  defaultHushMinutes: 15 | 30 | 60;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  screenAwareness: "off" | "signals" | "screenshots";
}

export interface ProactiveStatus {
  enabled: boolean;
  hushUntil?: number;
  utterancesThisHour: number;
  screenAwareness: ProactiveSettings["screenAwareness"];
  lastReason?: AmbientSignal["kind"];
  lastAt?: number;
}

export type AmbientSignal =
  | { kind: "idle"; idleSeconds: number; at: number }
  | { kind: "active"; idleSeconds: number; at: number }
  | { kind: "lock"; at: number }
  | { kind: "unlock"; at: number }
  | { kind: "resume"; at: number }
  | { kind: "manual"; at: number };

export interface ProactiveWhisperEvent {
  id: string;
  characterId: string;
  text: string;
  reason: AmbientSignal["kind"];
  createdAt: number;
}

export const IPC = {
  AppIsFirstRun: "nuwa.app.isFirstRun",
  AppCompleteFirstRun: "nuwa.app.completeFirstRun",
  AppQuit: "nuwa.app.quit",

  LlmSetProvider: "nuwa.llm.setProvider",
  LlmGetProvider: "nuwa.llm.getProvider",
  LlmTestConnection: "nuwa.llm.testConnection",
  LlmClearKey: "nuwa.llm.clearKey",

  ImageGenGetConfig: "nuwa.imageGen.getConfig",
  ImageGenSetConfig: "nuwa.imageGen.setConfig",
  ImageGenDetectCapability: "nuwa.imageGen.detectCapability",
  ImageGenTest: "nuwa.imageGen.test",
  ImageGenClearKey: "nuwa.imageGen.clearKey",

  CharactersList: "nuwa.characters.list",
  CharactersGet: "nuwa.characters.get",
  CharactersImportStarter: "nuwa.characters.importStarter",
  CharactersCreate: "nuwa.characters.create",
  CharactersCreateDeep: "nuwa.characters.createDeep",
  CharactersApproveDistillation: "nuwa.characters.approveDistillation",
  CharactersCancelDistillation: "nuwa.characters.cancelDistillation",
  CharactersGetResearchDocs: "nuwa.characters.getResearchDocs",
  CharactersGetResearchByCharacter: "nuwa.characters.getResearchByCharacter",
  CharactersRegenerateSprite: "nuwa.characters.regenerateSprite",
  CharactersRegenerateAppearance: "nuwa.characters.regenerateAppearance",
  CharactersDelete: "nuwa.characters.delete",
  CharactersActivate: "nuwa.characters.activate",
  CharactersGetActive: "nuwa.characters.getActive",
  CharactersListStarters: "nuwa.characters.listStarters",
  CharactersDetectCapabilities: "nuwa.characters.detectCapabilities",
  CharactersDetectVision: "nuwa.characters.detectVision",
  CharactersProbeVision: "nuwa.characters.probeVision",
  CharactersProbeWebSearch: "nuwa.characters.probeWebSearch",

  ChatSend: "nuwa.chat.send",
  ChatCancel: "nuwa.chat.cancel",
  ChatNewSession: "nuwa.chat.newSession",
  ChatGetActiveSession: "nuwa.chat.getActiveSession",
  ChatGetRecent: "nuwa.chat.getRecent",
  ChatListSessions: "nuwa.chat.listSessions",
  ChatSwitchSession: "nuwa.chat.switchSession",
  ChatRenameSession: "nuwa.chat.renameSession",
  ChatDeleteSession: "nuwa.chat.deleteSession",
  ChatHide: "nuwa.chat.hide",
  ChatGetSize: "nuwa.chat.getSize",
  ChatResize: "nuwa.chat.resize",
  ChatDeleteTurn: "nuwa.chat.deleteTurn",
  ChatDeleteTurnsFrom: "nuwa.chat.deleteTurnsFrom",

  MemoryGetProfile: "nuwa.memory.getProfile",
  MemoryUpdateProfile: "nuwa.memory.updateProfile",
  MemoryClearProfile: "nuwa.memory.clearProfile",
  MemoryGetPerCharacter: "nuwa.memory.getPerCharacter",
  MemoryClearPerCharacter: "nuwa.memory.clearPerCharacter",
  MemoryClearAll: "nuwa.memory.clearAll",

  PetSummon: "nuwa.pet.summon",
  PetHush: "nuwa.pet.hush",
  PetSetPosition: "nuwa.pet.setPosition",
  PetSetMouseIgnore: "nuwa.pet.setMouseIgnore",
  PetOpenChat: "nuwa.pet.openChat",
  PetOpenSettings: "nuwa.pet.openSettings",
  PetHide: "nuwa.pet.hide",
  PetDragStart: "nuwa.pet.dragStart",
  PetDragMove: "nuwa.pet.dragMove",
  PetDragEnd: "nuwa.pet.dragEnd",

  ProactiveGetSettings: "nuwa.proactive.getSettings",
  ProactiveSetSettings: "nuwa.proactive.setSettings",
  ProactiveGetStatus: "nuwa.proactive.getStatus",
  ProactiveTriggerNow: "nuwa.proactive.triggerNow",

  EventChatStream: "nuwa.event.chatStream",
  EventActiveCharacterChanged: "nuwa.event.activeCharacterChanged",
  EventPetSummon: "nuwa.event.petSummon",
  EventProactiveWhisper: "nuwa.event.proactiveWhisper",
  EventAmbientSignal: "nuwa.event.ambientSignal",
  EventDistillationProgress: "nuwa.event.distillationProgress"
} as const;
