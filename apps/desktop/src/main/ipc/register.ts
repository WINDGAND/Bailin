import { ipcMain, BrowserWindow, shell } from "electron";
import { ulid } from "ulid";
import {
  IPC,
  type AmbientSignal,
  type DistillationApprovalResult,
  type DistillationProgressEvent,
  type ImageGenerationConfigDTO,
  type ImageTierName,
  type ProactiveSettings,
  type SendMessageInput,
  type SettingsTab,
  type UserProfile
} from "../../shared/ipc-contract.js";
import type { LocalVault } from "../store/local-vault.js";
import type { MemoryStore } from "../runtime/memory-store.js";
import type { ProfileExtractor } from "../runtime/profile-extractor.js";
import type { CharacterRuntime } from "../runtime/character-runtime.js";
import type { NuwaOrchestrator } from "../orchestration/nuwa-orchestrator.js";
import type { ProactiveOrchestrator } from "../proactive/proactive-orchestrator.js";
import type { LLMAdapter } from "../adapters/llm-adapter.js";
import { DEFAULT_VISION_MODEL } from "../adapters/llm-adapter.js";
import {
  DEFAULT_IMAGE_GENERATION_CONFIG,
  type ImageGenerationAdapter,
  type ImageGenerationConfig
} from "../adapters/image-generation-adapter.js";
import { findStarterById, STARTER_META } from "@nuwa-pet/starter-library";
import {
  DistillationJobConfigSchema,
  summarizeAppearance,
  type CharacterBundle,
  type DistillationJob
} from "@nuwa-pet/character-protocol";

export interface IpcDeps {
  vault: LocalVault;
  memory: MemoryStore;
  profileExtractor: ProfileExtractor;
  runtime: CharacterRuntime;
  orchestrator: NuwaOrchestrator;
  proactive: ProactiveOrchestrator;
  llm: LLMAdapter;
  imageGen: ImageGenerationAdapter;
  getActiveCharacterId(): string | null;
  setActiveCharacterId(id: string | null): void;
  broadcast: (channel: string, payload: unknown) => void;
  getPetBounds: () => { x: number; y: number; width: number; height: number } | null;
  summonPetBubble: () => void;
  showChatNearPet: () => void;
  hideChat: () => void;
  isChatVisible: () => boolean;
  hidePet: () => void;
  setPetContextMenuOpen: (open: boolean) => "left" | "right" | null;
  dismissProactiveBubble: () => void;
  movePet: (x: number, y: number) => { x: number; y: number };
  ensurePetOnScreen: () => void;
  ensureSettingsWindow: (tab?: SettingsTab) => void;
  /** 拖动开始：记录光标相对窗口偏移。*/
  petDragStart: () => void;
  /** 拖动中：读取最新光标位置并移动桌宠。*/
  petDragMove: () => void;
  /** 拖动结束：清理拖动状态并返回最终位置用于落盘。*/
  petDragEnd: () => { x: number; y: number } | null;
  getChatWindowSize: () => { width: number; height: number };
  setChatWindowSize: (width: number, height: number) => { width: number; height: number };
  onLocaleChanged?: () => void;
  applyPetDisplayScale: (scale?: number) => void;
  syncProactiveAmbient?: () => void;
}

const SETTING_FIRST_RUN_DONE = "first_run_done";
export const SETTING_LOCALE = "ui.locale";
export const SETTING_THEME = "ui.theme";
const SETTING_ACTIVE_CHARACTER = "active_character_id";
const SETTING_LLM_PROVIDER = "llm_provider_json";
const SETTING_LLM_API_KEY = "llm_api_key_enc";
export const SETTING_IMAGE_PROVIDER = "image_provider_json";
export const SETTING_IMAGE_API_KEY = "image_api_key_enc";

interface ApprovalGate {
  promise: Promise<DistillationApprovalResult>;
  resolve: (result: DistillationApprovalResult) => void;
  reject: (err: Error) => void;
}

interface DeepJobState {
  jobId: string;
  abortCtl: AbortController;
  approvals: Map<"research", ApprovalGate>;
}

function makeGate(): ApprovalGate {
  let resolve!: (result: DistillationApprovalResult) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<DistillationApprovalResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function registerIpc(deps: IpcDeps): void {
  const { vault, memory, runtime, orchestrator, proactive, llm, imageGen, broadcast, profileExtractor } =
    deps;
  /** 进行中的深度蒸馏 jobs（jobId → state）。 */
  const activeJobs = new Map<string, DeepJobState>();

  // ===== App =====
  ipcMain.handle(IPC.AppIsFirstRun, () => vault.getSetting(SETTING_FIRST_RUN_DONE) !== "1");
  ipcMain.handle(IPC.AppCompleteFirstRun, () => vault.setSetting(SETTING_FIRST_RUN_DONE, "1"));
  ipcMain.handle(IPC.AppQuit, () => {
    setTimeout(() => process.exit(0), 50);
  });
  ipcMain.handle(IPC.AppGetLocale, () => {
    const raw = vault.getSetting(SETTING_LOCALE);
    return raw === "en" ? "en" : "zh";
  });
  ipcMain.handle(IPC.AppSetLocale, (_evt, locale: string) => {
    const next = locale === "en" ? "en" : "zh";
    vault.setSetting(SETTING_LOCALE, next);
    deps.onLocaleChanged?.();
    broadcast(IPC.EventLocaleChanged, next);
  });
  ipcMain.handle(IPC.AppGetTheme, () => {
    const raw = vault.getSetting(SETTING_THEME);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  });
  ipcMain.handle(IPC.AppSetTheme, (_evt, theme: string) => {
    const next = theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
    vault.setSetting(SETTING_THEME, next);
    broadcast(IPC.EventThemeChanged, next);
  });
  ipcMain.handle(IPC.AppOpenExternal, async (_evt, url: unknown) => {
    if (typeof url !== "string") return { ok: false };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
    await shell.openExternal(parsed.href);
    return { ok: true };
  });

  // ===== LLM =====
  ipcMain.handle(IPC.LlmSetProvider, async (_e, input) => {
    try {
      const { apiKey, ...rest } = input;
      vault.setSetting(SETTING_LLM_PROVIDER, JSON.stringify(rest));
      vault.setEncryptedString(SETTING_LLM_API_KEY, apiKey);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(IPC.LlmGetProvider, () => {
    const json = vault.getSetting(SETTING_LLM_PROVIDER);
    const key = vault.getEncryptedString(SETTING_LLM_API_KEY);
    if (!json || !key) return null;
    try {
      const rest = JSON.parse(json) as { visionModel?: string; [k: string]: unknown };
      return {
        ...rest,
        apiKey: key,
        visionModel: rest.visionModel?.trim() || DEFAULT_VISION_MODEL
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC.LlmTestConnection, () => llm.testConnection());

  ipcMain.handle(IPC.LlmClearKey, () => {
    vault.setSetting(SETTING_LLM_PROVIDER, "");
    vault.setSetting(SETTING_LLM_API_KEY, "");
  });

  // ===== ImageGen =====
  ipcMain.handle(IPC.ImageGenGetConfig, () => readImageConfigForRenderer(vault));

  ipcMain.handle(IPC.ImageGenSetConfig, async (_e, input: ImageGenerationConfigDTO) => {
    try {
      if (!input || !input.tiers) {
        return { ok: false, error: "tiers 必填" };
      }
      const persisted: Omit<ImageGenerationConfig, "apiKey"> = {
        useLLMProvider: input.useLLMProvider,
        baseUrl: input.baseUrl,
        tiers: input.tiers,
        defaultTier: input.defaultTier
      };
      vault.setSetting(SETTING_IMAGE_PROVIDER, JSON.stringify(persisted));
      if (input.apiKey != null && input.apiKey !== "") {
        vault.setEncryptedString(SETTING_IMAGE_API_KEY, input.apiKey);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(IPC.ImageGenDetectCapability, () => imageGen.detectCapability());

  ipcMain.handle(IPC.ImageGenTest, async (_e, tier?: ImageTierName) => {
    const startedAt = Date.now();
    const cap = imageGen.detectCapability();
    if (!cap.ok) {
      return { ok: false, error: cap.reason };
    }
    const res = await imageGen.generate({
      prompt:
        "A friendly chibi mascot facing forward, transparent background, cell-safe pose.",
      tier,
      transparentBackground: true
    });
    if (res.kind === "error") {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: `${res.code}: ${res.message}`
      };
    }
    return {
      ok: true,
      latencyMs: res.durationMs,
      tier: res.tier,
      model: res.model,
      estimatedCostUsd: res.estimatedCostUsd
    };
  });

  ipcMain.handle(IPC.ImageGenClearKey, () => {
    vault.setSetting(SETTING_IMAGE_API_KEY, "");
  });

  // ===== Characters =====
  ipcMain.handle(IPC.CharactersListStarters, () => STARTER_META);

  ipcMain.handle(IPC.CharactersList, () => {
    const activeId = deps.getActiveCharacterId();
    return vault.listCharacters().map((c) => ({
      id: c.id,
      name: c.name,
      sourceName: c.sourceName,
      track: c.track,
      isSkeleton: c.isSkeleton,
      isActive: c.id === activeId
    }));
  });

  ipcMain.handle(IPC.CharactersGet, (_e, characterId: string) => vault.getCharacter(characterId));
  ipcMain.handle(IPC.CharactersGetActive, () => {
    const id = deps.getActiveCharacterId();
    return id ? vault.getCharacter(id) : null;
  });

  ipcMain.handle(IPC.CharactersImportStarter, (_e, starterId: string) => {
    const starter = findStarterById(starterId);
    if (!starter) return { ok: false, error: "starter not found" };
    const now = Date.now();
    const bundle: CharacterBundle = {
      ...starter,
      card: { ...starter.card, id: ulid(), createdAt: now, updatedAt: now }
    };
    vault.upsertCharacter({ id: bundle.card.id, bundle, isSkeleton: false, now });
    deps.setActiveCharacterId(bundle.card.id);
    vault.setSetting(SETTING_ACTIVE_CHARACTER, bundle.card.id);
    broadcast(IPC.EventActiveCharacterChanged, bundle);
    return { ok: true, characterId: bundle.card.id };
  });

  ipcMain.handle(IPC.CharactersCreate, async (_e, input) => {
    try {
      const result = await orchestrator.createCharacter(input);
      vault.upsertCharacter({
        id: result.bundle.card.id,
        bundle: result.bundle,
        isSkeleton: result.isSkeleton,
        now: Date.now()
      });
      deps.setActiveCharacterId(result.bundle.card.id);
      vault.setSetting(SETTING_ACTIVE_CHARACTER, result.bundle.card.id);
      broadcast(IPC.EventActiveCharacterChanged, result.bundle);
      return {
        ok: true,
        characterId: result.bundle.card.id,
        isSkeleton: result.isSkeleton,
        warnings: result.warnings
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(IPC.CharactersRegenerateSprite, async (_e, characterId: string) => {
    try {
      const bundle = vault.getCharacter(characterId);
      if (!bundle) return { ok: false, error: "角色不存在" };
      const result = await orchestrator.regenerateSprite({ card: bundle.card });
      if (!result.ok && !result.sprite) {
        return { ok: false, error: result.error ?? "形象生成失败" };
      }
      const newBundle: CharacterBundle = {
        ...bundle,
        sprite: result.sprite!
      };
      vault.upsertCharacter({
        id: characterId,
        bundle: newBundle,
        isSkeleton: false,
        now: Date.now()
      });
      if (deps.getActiveCharacterId() === characterId) {
        broadcast(IPC.EventActiveCharacterChanged, newBundle);
      }
      return { ok: true, warnings: result.warnings };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(IPC.CharactersDelete, (_e, characterId: string) => {
    vault.deleteCharacter(characterId);
    if (deps.getActiveCharacterId() === characterId) {
      const fallback = vault.listCharacters()[0];
      const nextId = fallback?.id ?? null;
      deps.setActiveCharacterId(nextId);
      vault.setSetting(SETTING_ACTIVE_CHARACTER, nextId ?? "");
      broadcast(IPC.EventActiveCharacterChanged, nextId ? vault.getCharacter(nextId) : null);
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.CharactersDetectCapabilities, () => llm.detectCapabilities());
  ipcMain.handle(IPC.CharactersDetectVision, () => llm.detectVisionCapability());
  ipcMain.handle(IPC.CharactersProbeVision, () => llm.probeVision());
  ipcMain.handle(IPC.CharactersProbeWebSearch, () => llm.probeWebSearch());

  ipcMain.handle(IPC.CharactersRegenerateAppearance, async (_e, input: {
    characterId: string;
    referenceImages?: Array<{
      url: string;
      source: "user-upload" | "web";
      role?: "primary" | "reference";
      notes?: string;
    }>;
    userHint?: string;
  }) => {
    try {
      const bundle = vault.getCharacter(input.characterId);
      if (!bundle) return { ok: false, error: "角色不存在" };
      // 限制图片大小：拒绝 >6MB 的 data URI（base64 ~ 8MB binary）
      const refs = (input.referenceImages ?? []).filter((r) => {
        if (!r.url) return false;
        if (r.url.startsWith("data:") && r.url.length > 6 * 1024 * 1024) {
          return false;
        }
        return true;
      });
      const result = await orchestrator.regenerateAppearance({
        card: bundle.card,
        referenceImages: refs,
        userHint: input.userHint
      });
      if (!result.ok || !result.appearance || !result.sprite) {
        return { ok: false, error: result.error ?? "形象重生失败", warnings: result.warnings };
      }
      const newBundle: CharacterBundle = {
        ...bundle,
        card: {
          ...bundle.card,
          meta: {
            ...bundle.card.meta,
            appearance: result.appearance,
            avatarHint: summarizeAppearance(result.appearance)
          },
          updatedAt: Date.now()
        },
        sprite: result.sprite
      };
      vault.upsertCharacter({
        id: input.characterId,
        bundle: newBundle,
        isSkeleton: false,
        now: Date.now()
      });
      if (deps.getActiveCharacterId() === input.characterId) {
        broadcast(IPC.EventActiveCharacterChanged, newBundle);
      }
      return { ok: true, warnings: result.warnings };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ===== 深度蒸馏 =====
  ipcMain.handle(IPC.CharactersCreateDeep, async (_e, rawInput) => {
    const parsed = DistillationJobConfigSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.errors.slice(0, 4).map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      };
    }
    const config = parsed.data;
    const jobId = ulid();
    const now = Date.now();
    const job: DistillationJob = {
      id: jobId,
      config,
      status: "pending",
      progress: 0,
      message: "已排队",
      warnings: [],
      createdAt: now,
      updatedAt: now
    };
    vault.upsertJob(job);

    const abortCtl = new AbortController();
    const approvals = new Map<"research", ApprovalGate>([["research", makeGate()]]);
    activeJobs.set(jobId, { jobId, abortCtl, approvals });

    // 后台跑 generator，不阻塞 IPC 返回
    void (async () => {
      try {
        const generator = orchestrator.createCharacterDeep({
          jobId,
          config,
          awaitApproval: (phase) => approvals.get(phase)!.promise,
          signal: abortCtl.signal,
          runVoiceTest: true,
          // 让 hatch-pet 的实时事件越过 generator 直接推给 UI，避免批量延迟
          liveBroadcast: (evt) => {
            broadcast(IPC.EventDistillationProgress, evt as DistillationProgressEvent);
            if (evt.kind === "hatch_progress") {
              // 同时记一条 warning 文本到 vault，作为审计；不展开成详细字段
              try {
                vault.appendJobWarning(jobId, `[hatch] ${evt.event.kind}`);
              } catch {
                // ignore
              }
            }
          }
        });

        for await (const evt of generator) {
          // 落盘 / 转发
          if (evt.kind === "phase") {
            vault.updateJobStatus(jobId, evt.phase, evt.progress, evt.message);
          } else if (evt.kind === "warning") {
            vault.appendJobWarning(jobId, evt.message);
          } else if (evt.kind === "agent_done") {
            vault.upsertResearchDoc({
              jobId,
              doc: evt.doc,
              createdAt: Date.now()
            });
          } else if (evt.kind === "done") {
            // 落盘 character & 关联 research_docs / job
            const bundle = evt.bundle;
            vault.upsertCharacter({
              id: bundle.card.id,
              bundle,
              isSkeleton: evt.isSkeleton,
              now: Date.now()
            });
            vault.bindResearchDocsToCharacter(jobId, bundle.card.id);
            // 重新写一次 docs，让 character_id 关联 + 文件镜像
            for (const d of bundle.researchDocs ?? []) {
              vault.upsertResearchDoc({
                jobId,
                characterId: bundle.card.id,
                doc: d,
                createdAt: Date.now()
              });
            }
            vault.updateJobStatus(jobId, "done", 100, "完成");
            deps.setActiveCharacterId(bundle.card.id);
            vault.setSetting(SETTING_ACTIVE_CHARACTER, bundle.card.id);
            broadcast(IPC.EventActiveCharacterChanged, bundle);
            // 转发给渲染进程
            const forwardEvt: DistillationProgressEvent = {
              kind: "done",
              jobId,
              characterId: bundle.card.id,
              isSkeleton: evt.isSkeleton,
              warnings: evt.warnings
            };
            broadcast(IPC.EventDistillationProgress, forwardEvt);
            continue;
          } else if (evt.kind === "cancelled") {
            vault.updateJobStatus(jobId, "cancelled", 0, "已取消");
          } else if (evt.kind === "failed") {
            vault.updateJobStatus(jobId, "failed", 0, evt.reason);
          }
          // 直接转发其他事件（agent_start / research_complete / synthesis_summary / appearance_ready / quality_report / started）
          broadcast(IPC.EventDistillationProgress, evt as DistillationProgressEvent);
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        vault.updateJobStatus(jobId, "failed", 0, reason);
        const failEvt: DistillationProgressEvent = {
          kind: "failed",
          jobId,
          reason,
          warnings: []
        };
        broadcast(IPC.EventDistillationProgress, failEvt);
      } finally {
        activeJobs.delete(jobId);
      }
    })();

    return { ok: true, jobId };
  });

  ipcMain.handle(
    IPC.CharactersApproveDistillation,
    (
      _e,
      input: {
        jobId: string;
        phase: "research";
        supplementalAgentIds?: DistillationApprovalResult["supplementalAgentIds"];
      }
    ) => {
    const state = activeJobs.get(input.jobId);
    if (!state) return { ok: false };
    const gate = state.approvals.get("research");
    if (!gate) return { ok: false };
    gate.resolve({
      supplementalAgentIds:
        input.phase === "research" ? input.supplementalAgentIds : undefined
    });
    return { ok: true };
  }
  );

  ipcMain.handle(IPC.CharactersCancelDistillation, (_e, jobId: string) => {
    const state = activeJobs.get(jobId);
    if (!state) return { ok: false };
    state.abortCtl.abort();
    // 把两个 gate 全 reject，让 generator 立刻退出
    for (const gate of state.approvals.values()) {
      gate.reject(new Error("user cancelled"));
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.CharactersGetResearchDocs, (_e, jobId: string) =>
    vault.getResearchDocs(jobId)
  );

  ipcMain.handle(IPC.CharactersGetResearchByCharacter, (_e, characterId: string) => {
    const docs = vault.getResearchDocsByCharacter(characterId);
    const bundle = vault.getCharacter(characterId);
    return { docs, qualityReport: bundle?.qualityReport };
  });

  ipcMain.handle(IPC.CharactersActivate, (_e, characterId: string) => {
    const bundle = vault.getCharacter(characterId);
    if (!bundle) return { ok: false };
    deps.setActiveCharacterId(characterId);
    vault.setSetting(SETTING_ACTIVE_CHARACTER, characterId);
    deps.ensurePetOnScreen();
    const bounds = deps.getPetBounds();
    if (bounds) {
      vault.setSetting(SETTING_PET_POS, JSON.stringify({ x: bounds.x, y: bounds.y }));
    }
    broadcast(IPC.EventActiveCharacterChanged, bundle);
    return { ok: true };
  });

  // ===== Chat =====
  ipcMain.handle(IPC.ChatNewSession, (_e, characterId: string) => ({
    sessionId: runtime.newSession(characterId)
  }));

  ipcMain.handle(IPC.ChatGetRecent, (_e, characterId: string, sessionId?: string) => {
    const sessionKey =
      sessionId && sessionId.length > 0
        ? sessionId
        : runtime.getOrCreateActiveSession(characterId);
    return runtime.getRecentTurns(characterId, sessionKey, 24);
  });

  ipcMain.handle(IPC.ChatSend, async (_e, input: SendMessageInput) => {
    const bundle = vault.getCharacter(input.characterId);
    if (!bundle) {
      const requestId = ulid();
      broadcast(IPC.EventChatStream, {
        requestId,
        sessionId: input.sessionId,
        characterId: input.characterId,
        done: true,
        error: "character not found"
      });
      return { requestId };
    }
    const sessionId = runtime.ensureSession(input.characterId, input.sessionId);
    vault.setSetting("session." + input.characterId, sessionId);

    const requestId = ulid();
    const userTurnId = input.userTurnId ?? ulid();
    const assistantTurnId = input.assistantTurnId ?? ulid();
    broadcast(IPC.EventChatStream, {
      requestId,
      sessionId,
      characterId: input.characterId,
      done: false,
      phase: "thinking"
    });
    void (async () => {
      try {
        for await (const chunk of runtime.sendMessage({
          bundle,
          sessionId,
          userContent: input.content,
          responseMode: input.surface === "bubble" ? "bubble" : "full",
          userTurnId,
          assistantTurnId,
          skipUserAppend: input.skipUserAppend
        })) {
          if (chunk.kind === "delta") {
            broadcast(IPC.EventChatStream, {
              requestId,
              sessionId,
              characterId: input.characterId,
              done: false,
              delta: chunk.text
            });
          } else if (chunk.kind === "done") {
            broadcast(IPC.EventChatStream, {
              requestId,
              sessionId,
              characterId: input.characterId,
              done: true,
              finishReason: chunk.finishReason,
              assistantTurnId
            });
            if (chunk.finishReason !== "safety") {
              void profileExtractor.maybeExtract({
                characterId: input.characterId,
                sessionId,
                characterName: bundle.card.meta.name
              });
            }
          } else {
            broadcast(IPC.EventChatStream, {
              requestId,
              sessionId,
              characterId: input.characterId,
              done: true,
              error: chunk.message,
              finishReason: "error"
            });
          }
        }
      } catch (e) {
        broadcast(IPC.EventChatStream, {
          requestId,
          sessionId,
          characterId: input.characterId,
          done: true,
          error: e instanceof Error ? e.message : String(e),
          finishReason: "error"
        });
      }
    })();
    return { requestId, userTurnId, assistantTurnId };
  });

  ipcMain.handle(IPC.ChatCancel, () => {
    runtime.cancelActive();
    const characterId = deps.getActiveCharacterId();
    if (characterId) {
      broadcast(IPC.EventChatStream, {
        requestId: ulid(),
        sessionId: "",
        characterId,
        done: true,
        cancelled: true,
        finishReason: "error"
      });
    }
  });

  ipcMain.handle(IPC.ChatHide, () => {
    deps.hideChat();
  });

  ipcMain.handle(IPC.ChatIsVisible, () => deps.isChatVisible());

  ipcMain.handle(IPC.ChatGetSize, () => deps.getChatWindowSize());

  ipcMain.handle(IPC.ChatResize, (_e, input: { width: number; height: number }) =>
    deps.setChatWindowSize(input.width, input.height)
  );

  // ===== Memory =====
  ipcMain.handle(IPC.MemoryGetProfile, () => memory.getProfile());
  ipcMain.handle(IPC.MemoryUpdateProfile, (_e, patch: Partial<UserProfile>) =>
    memory.updateProfile(patch)
  );
  ipcMain.handle(IPC.MemoryClearProfile, () => memory.clearProfile());
  ipcMain.handle(IPC.MemoryGetPerCharacter, (_e, characterId: string) =>
    memory.getPerCharacter(characterId)
  );
  ipcMain.handle(IPC.MemoryClearPerCharacter, (_e, characterId: string) =>
    memory.clearPerCharacter(characterId)
  );
  ipcMain.handle(IPC.MemoryClearAll, () => vault.clearAll());
  ipcMain.handle(IPC.MemoryGetSettings, () => memory.getSettings());
  ipcMain.handle(IPC.MemorySetSettings, (_e, patch) => memory.setSettings(patch));
  ipcMain.handle(IPC.MemoryGetRecentChanges, (_e, limit?: number) =>
    memory.getRecentChanges(limit ?? 5)
  );
  ipcMain.handle(IPC.MemoryUndoLastChange, () => memory.undoLastChange());

  // ===== Pet =====
  ipcMain.handle(IPC.PetSummon, () => deps.summonPetBubble());
  ipcMain.handle(IPC.PetHush, (_e, durationMs: number) => {
    proactive.hush(durationMs);
  });
  ipcMain.handle(IPC.PetSetPosition, (_e, x: number, y: number) => {
    const pos = deps.movePet(Math.round(x), Math.round(y));
    vault.setSetting(SETTING_PET_POS, JSON.stringify(pos));
  });
  ipcMain.handle(IPC.PetSetMouseIgnore, (e, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (ignore) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
  });
  ipcMain.handle(IPC.PetOpenChat, () => deps.showChatNearPet());
  ipcMain.handle(IPC.PetOpenSettings, (_e, tab?: SettingsTab) => {
    deps.ensureSettingsWindow(tab);
  });
  ipcMain.handle(IPC.PetHide, () => deps.hidePet());
  ipcMain.handle(IPC.PetSetContextMenuOpen, (_e, open: boolean) => {
    return deps.setPetContextMenuOpen(open);
  });
  ipcMain.handle(IPC.ProactiveBubbleDismiss, () => {
    deps.dismissProactiveBubble();
  });

  // ===== 拖动（主进程全程用 screen 坐标，规避渲染进程 CSS 像素 / DPI 差异） =====
  ipcMain.handle(IPC.PetDragStart, () => deps.petDragStart());
  ipcMain.handle(IPC.PetDragMove, () => deps.petDragMove());
  ipcMain.handle(IPC.PetDragEnd, () => {
    const pos = deps.petDragEnd();
    if (pos) vault.setSetting(SETTING_PET_POS, JSON.stringify(pos));
  });

  // ===== Proactive companion =====
  ipcMain.handle(IPC.ProactiveGetSettings, () => proactive.getSettings());
  ipcMain.handle(IPC.ProactiveSetSettings, (_e, input: ProactiveSettings) => {
    const saved = proactive.setSettings(input);
    deps.applyPetDisplayScale(saved.petDisplayScale);
    deps.syncProactiveAmbient?.();
    deps.broadcast(IPC.EventProactiveSettingsChanged, saved);
    return saved;
  });
  ipcMain.handle(IPC.ProactiveGetStatus, () => proactive.getStatus());
  ipcMain.handle(IPC.ProactiveTriggerNow, (_e, reason?: string) =>
    proactive.triggerNow(reason as AmbientSignal["kind"] | undefined)
  );
  ipcMain.handle(IPC.ProactiveTriggerLlmScreenshot, () => proactive.triggerLlmWhisperNow());
  ipcMain.handle(IPC.ProactiveFocusMode, (_e, durationMs: number) => {
    proactive.focusMode(durationMs);
  });
}

const SETTING_PET_POS = "pet_position_json";
export { SETTING_PET_POS };

export function broadcastToAllWindows(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send(channel, payload);
    } catch {
      // ignore
    }
  }
}

/**
 * 从 Vault 读取生图配置；返回 DTO（不含 apiKey）。
 * 没有任何配置时返回 DEFAULT_IMAGE_GENERATION_CONFIG（仅展示，用户必须显式保存才会落库）。
 */
export function readImageConfigForRenderer(
  vault: LocalVault
): ImageGenerationConfigDTO | null {
  const raw = vault.getSetting(SETTING_IMAGE_PROVIDER);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Omit<ImageGenerationConfig, "apiKey">;
    return {
      useLLMProvider: parsed.useLLMProvider,
      baseUrl: parsed.baseUrl,
      tiers: parsed.tiers,
      defaultTier: parsed.defaultTier
    };
  } catch {
    return {
      useLLMProvider: DEFAULT_IMAGE_GENERATION_CONFIG.useLLMProvider,
      tiers: DEFAULT_IMAGE_GENERATION_CONFIG.tiers,
      defaultTier: DEFAULT_IMAGE_GENERATION_CONFIG.defaultTier
    };
  }
}

/**
 * 从 Vault 读完整 ImageGenerationConfig（含 apiKey，供主进程使用）。
 * 没有自定义配置时返回默认；apiKey 会按 useLLMProvider 决定要不要读 image_api_key_enc。
 */
export function readImageConfigForMain(
  vault: LocalVault
): ImageGenerationConfig | null {
  const raw = vault.getSetting(SETTING_IMAGE_PROVIDER);
  let base: Omit<ImageGenerationConfig, "apiKey">;
  if (!raw) {
    base = {
      useLLMProvider: DEFAULT_IMAGE_GENERATION_CONFIG.useLLMProvider,
      tiers: DEFAULT_IMAGE_GENERATION_CONFIG.tiers,
      defaultTier: DEFAULT_IMAGE_GENERATION_CONFIG.defaultTier
    };
  } else {
    try {
      base = JSON.parse(raw) as Omit<ImageGenerationConfig, "apiKey">;
    } catch {
      return null;
    }
  }
  if (base.useLLMProvider) {
    return base;
  }
  const key = vault.getEncryptedString(SETTING_IMAGE_API_KEY);
  if (!key) {
    return base; // baseUrl 有但没 key，adapter 会自检失败
  }
  return { ...base, apiKey: key };
}
