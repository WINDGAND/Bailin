import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CharacterBundle,
  DistillationJobConfig,
  QualityReport,
  ResearchAgentId,
  ResearchDoc
} from "@nuwa-pet/character-protocol";
import type {
  AmbientSignal,
  DistillationProgressEvent,
  ImageGenerationConfigDTO,
  ImageTierName,
  ProactiveSettings,
  ProactiveStatus,
  ProactiveWhisperEvent
} from "../../shared/ipc-contract.js";
import type { ChatStreamChunk, ChatVisibilityEvent } from "../../shared/ipc-contract.js";

interface NuwaWindow {
  nuwa: {
    app: { isFirstRun(): Promise<boolean>; completeFirstRun(): Promise<void>; quit(): Promise<void>; getLocale(): Promise<"zh" | "en">; setLocale(locale: "zh" | "en"): Promise<void>; getTheme(): Promise<import("../../shared/ipc-contract.js").ThemePreference>; setTheme(theme: import("../../shared/ipc-contract.js").ThemePreference): Promise<void>; openExternal(url: string): Promise<{ ok: boolean }> };
    llm: {
      setProvider(input: unknown): Promise<{ ok: boolean; error?: string }>;
      getProvider(): Promise<unknown>;
      testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
      clearKey(): Promise<void>;
    };
    imageGen: {
      getConfig(): Promise<ImageGenerationConfigDTO | null>;
      setConfig(input: ImageGenerationConfigDTO): Promise<{ ok: boolean; error?: string }>;
      detectCapability(): Promise<{ ok: boolean; reason: string }>;
      test(tier?: ImageTierName): Promise<{
        ok: boolean;
        latencyMs?: number;
        tier?: ImageTierName;
        model?: string;
        estimatedCostUsd?: number;
        error?: string;
        requestFields?: string[];
      }>;
      clearKey(): Promise<void>;
    };
    characters: {
      list(): Promise<Array<{ id: string; name: string; sourceName?: string; track: "utility" | "companion"; isSkeleton: boolean; isActive: boolean }>>;
      get(id: string): Promise<CharacterBundle | null>;
      importStarter(id: string): Promise<{ ok: boolean; characterId?: string; error?: string }>;
      create(input: unknown): Promise<{ ok: boolean; characterId?: string; isSkeleton?: boolean; warnings?: string[]; error?: string }>;
      createDeep(input: Partial<DistillationJobConfig> & { characterName: string; sourceType: DistillationJobConfig["sourceType"]; track: DistillationJobConfig["track"] }): Promise<{ ok: boolean; jobId?: string; error?: string }>;
      approveDistillation(input: {
        jobId: string;
        phase: "research";
        supplementalAgentIds?: ResearchAgentId[];
      }): Promise<{ ok: boolean }>;
      cancelDistillation(jobId: string): Promise<{ ok: boolean }>;
      getResearchDocs(jobId: string): Promise<ResearchDoc[]>;
      getResearchByCharacter(characterId: string): Promise<{ docs: ResearchDoc[]; qualityReport?: QualityReport }>;
      regenerateSprite(id: string): Promise<{ ok: boolean; warnings?: string[]; error?: string }>;
      regenerateAppearance(input: {
        characterId: string;
        referenceImages?: Array<{
          url: string;
          source: "user-upload" | "web";
          role?: "primary" | "reference";
          notes?: string;
        }>;
        userHint?: string;
      }): Promise<{ ok: boolean; warnings?: string[]; error?: string }>;
      delete(id: string): Promise<{ ok: boolean }>;
      activate(id: string): Promise<{ ok: boolean }>;
      getActive(): Promise<CharacterBundle | null>;
      listStarters(): Promise<Array<{ id: string; name: string; sourceName: string; track: "utility" | "companion"; blurb: string }>>;
      detectCapabilities(): Promise<{ webSearch: boolean; reason: string }>;
      detectVisionCapability(): Promise<{
        vision: boolean;
        reason: string;
        visionModel: string;
        mainModel: string;
      }>;
      probeVision(): Promise<{ ok: boolean; latencyMs?: number; reason?: string }>;
      probeWebSearch(): Promise<{
        ok: boolean;
        realWebSearch: boolean;
        latencyMs?: number;
        citations: number;
        reason?: string;
      }>;
    };
    chat: {
      send(input: { characterId: string; sessionId: string; content: string; surface?: "bubble" | "chat"; userTurnId?: string; skipUserAppend?: boolean }): Promise<{ requestId: string; userTurnId: string; assistantTurnId: string }>;
      cancel(requestId: string): Promise<void>;
      newSession(characterId: string): Promise<{ sessionId: string }>;
      getActiveSession(characterId: string): Promise<{ sessionId: string }>;
      getRecent(
        characterId: string,
        sessionId?: string
      ): Promise<Array<{ id: string; role: "user" | "assistant" | "system"; content: string; createdAt: number }>>;
      listSessions(
        characterId: string
      ): Promise<Array<{ id: string; title: string; messageCount: number; createdAt: number; updatedAt: number }>>;
      switchSession(input: { characterId: string; sessionId: string }): Promise<{ ok: boolean }>;
      renameSession(input: { characterId: string; sessionId: string; title: string }): Promise<{ ok: boolean }>;
      deleteSession(input: { characterId: string; sessionId: string }): Promise<{ ok: boolean }>;
      hide(): Promise<void>;
      isVisible(): Promise<boolean>;
      getSize(): Promise<{ width: number; height: number }>;
      resize(input: { width: number; height: number }): Promise<{ width: number; height: number }>;
      deleteTurn(input: { characterId: string; sessionId: string; turnId: string }): Promise<{ ok: boolean }>;
      deleteTurnsFrom(input: { characterId: string; sessionId: string; turnId: string }): Promise<{ ok: boolean }>;
    };
    memory: {
      getProfile(): Promise<import("../../shared/ipc-contract.js").UserProfile>;
      updateProfile(patch: unknown): Promise<import("../../shared/ipc-contract.js").UserProfile>;
      clearProfile(): Promise<void>;
      getPerCharacter(id: string): Promise<string[]>;
      clearPerCharacter(id: string): Promise<void>;
      clearAll(): Promise<void>;
      getSettings(): Promise<import("../../shared/ipc-contract.js").MemorySettings>;
      setSettings(input: Partial<import("../../shared/ipc-contract.js").MemorySettings>): Promise<import("../../shared/ipc-contract.js").MemorySettings>;
      getRecentChanges(limit?: number): Promise<import("../../shared/ipc-contract.js").ProfileChangeRecord[]>;
      undoLastChange(): Promise<{ ok: boolean; profile?: import("../../shared/ipc-contract.js").UserProfile; reason?: string }>;
    };
    pet: { summon(): Promise<void>; hush(ms: number): Promise<void>; setPosition(x: number, y: number): Promise<void>; setMouseIgnore(ignore: boolean): Promise<void>; openChat(): Promise<void>; openSettings(tab?: import("../../shared/ipc-contract.js").SettingsTab): Promise<void>; hide(): Promise<void>; setContextMenuOpen(open: boolean): Promise<"left" | "right" | null>; dragStart(): Promise<void>; dragMove(): Promise<void>; dragEnd(): Promise<void> };
    proactiveBubble: { dismiss(): Promise<void>; resize(size: { width: number; height: number }): Promise<void> };
    proactive: {
      getSettings(): Promise<ProactiveSettings>;
      setSettings(input: ProactiveSettings): Promise<ProactiveSettings>;
      getStatus(): Promise<ProactiveStatus>;
      triggerNow(reason?: AmbientSignal["kind"]): Promise<{ ok: boolean; reason?: string }>;
      triggerLlmScreenshot(): Promise<{ ok: boolean; reason?: string }>;
      focusMode(durationMs: number): Promise<void>;
    };
    on: {
      chatStream(h: (chunk: ChatStreamChunk) => void): () => void;
      chatVisibility(h: (evt: ChatVisibilityEvent) => void): () => void;
      activeCharacterChanged(h: (bundle: CharacterBundle | null) => void): () => void;
      petSummon(h: () => void): () => void;
      proactiveWhisper(h: (evt: ProactiveWhisperEvent) => void): () => void;
      proactiveBubblePlacement(h: (evt: import("../../shared/ipc-contract.js").ProactiveBubblePlacementEvent) => void): () => void;
      ambientSignal(h: (evt: AmbientSignal) => void): () => void;
      distillationProgress(h: (evt: DistillationProgressEvent) => void): () => void;
      localeChanged(h: (locale: "zh" | "en") => void): () => void;
      themeChanged(h: (theme: import("../../shared/ipc-contract.js").ThemePreference) => void): () => void;
      profileUpdated(h: (evt: import("../../shared/ipc-contract.js").ProfileUpdatedEvent) => void): () => void;
      navigateSettings(h: (evt: import("../../shared/ipc-contract.js").NavigateSettingsEvent) => void): () => void;
      proactiveSettingsChanged(h: (settings: ProactiveSettings) => void): () => void;
    };
  };
}

export function useNuwa() {
  return useMemo(() => {
    const w = window as unknown as NuwaWindow;
    if (w.nuwa) return w.nuwa;
    // Fallback：vite 单独跑（无 Electron preload）或测试场景，返回空安全的 stub，
    // 保证 UI 仍可渲染，方便截图 / 设计调试。
    return makeNuwaStub();
  }, []);
}

/** 仅用于 vite 单跑 / 测试环境的空安全 stub，绝不在 Electron 内被使用。
 *  为方便在浏览器里设计 / 截图：list / getActive / listStarters / get 直接返回
 *  apps/desktop shared/starters 内置 bundle，写操作仍是空 stub。 */
function makeNuwaStub(): NuwaWindow["nuwa"] {
  const noopOff = () => () => {};
  let starterCache: any[] | null = null;
  async function loadStarters(): Promise<any[]> {
    if (starterCache) return starterCache;
    try {
      const mod = await import("../../shared/starters.js");
      starterCache = (mod as any).STARTER_BUNDLES ?? [];
      return starterCache ?? [];
    } catch {
      return [];
    }
  }
  return {
    app: {
      isFirstRun: async () => false,
      completeFirstRun: async () => undefined,
      quit: async () => undefined,
      getLocale: async () => {
        const v = localStorage.getItem("bailin.locale");
        return v === "en" ? "en" : "zh";
      },
      setLocale: async (locale: "zh" | "en") => {
        localStorage.setItem("bailin.locale", locale);
        window.dispatchEvent(new CustomEvent("bailin-locale", { detail: locale }));
      },
      getTheme: async () => {
        const v = localStorage.getItem("bailin.theme");
        return v === "light" || v === "dark" || v === "system" ? v : "system";
      },
      setTheme: async (theme: "light" | "dark" | "system") => {
        localStorage.setItem("bailin.theme", theme);
        window.dispatchEvent(new CustomEvent("bailin-theme", { detail: theme }));
      },
      openExternal: async (url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
        return { ok: true };
      }
    },
    llm: {
      setProvider: async () => ({ ok: false, error: "stub" }),
      getProvider: async () => null,
      testConnection: async () => ({ ok: false, error: "stub" }),
      clearKey: async () => undefined
    },
    imageGen: {
      getConfig: async () => null,
      setConfig: async () => ({ ok: false, error: "stub" }),
      detectCapability: async () => ({ ok: false, reason: "stub 环境" }),
      test: async () => ({ ok: false, error: "stub 环境" }),
      clearKey: async () => undefined
    },
    characters: {
      list: async () => {
        const bs = await loadStarters();
        return bs.map((b: any, i: number) => ({
          id: b.card.id,
          name: b.card.meta.name,
          sourceName: b.card.meta.sourceName,
          track: b.card.meta.track,
          isSkeleton: false,
          isActive: i === 0
        }));
      },
      get: async (id: string) => {
        const bs = await loadStarters();
        return bs.find((b: any) => b.card.id === id) ?? null;
      },
      importStarter: async () => ({ ok: false, error: "stub" }),
      create: async () => ({ ok: false, error: "stub" }),
      createDeep: async () => ({ ok: false, error: "stub" }),
      approveDistillation: async () => ({ ok: false }),
      cancelDistillation: async () => ({ ok: false }),
      getResearchDocs: async () => [],
      getResearchByCharacter: async () => ({ docs: [] }),
      regenerateSprite: async () => ({ ok: false, error: "stub" }),
      regenerateAppearance: async () => ({ ok: false, error: "stub" }),
      delete: async () => ({ ok: false }),
      activate: async () => ({ ok: false }),
      getActive: async () => {
        const bs = await loadStarters();
        return bs[0] ?? null;
      },
      listStarters: async () => {
        const bs = await loadStarters();
        return bs.map((b: any) => ({
          id: b.card.id,
          name: b.card.meta.name,
          sourceName: b.card.meta.sourceName ?? b.card.meta.name,
          track: b.card.meta.track,
          blurb: b.card.meta.quoteOneLiner ?? ""
        }));
      },
      detectCapabilities: async () => ({ webSearch: false, reason: "stub 环境" }),
      detectVisionCapability: async () => ({
        vision: false,
        reason: "stub 环境",
        visionModel: "",
        mainModel: ""
      }),
      probeVision: async () => ({ ok: false, reason: "stub 环境" }),
      probeWebSearch: async () => ({ ok: false, realWebSearch: false, citations: 0 })
    },
    chat: {
      send: async () => ({ requestId: "stub", userTurnId: "stub-u", assistantTurnId: "stub-a" }),
      cancel: async () => undefined,
      newSession: async () => ({ sessionId: "stub" }),
      getActiveSession: async () => ({ sessionId: "stub" }),
      getRecent: async () => [],
      listSessions: async () => [],
      switchSession: async () => ({ ok: true }),
      renameSession: async () => ({ ok: true }),
      deleteSession: async () => ({ ok: true }),
      hide: async () => undefined,
      isVisible: async () => false,
      getSize: async () => ({ width: 380, height: 480 }),
      resize: async (input) => input,
      deleteTurn: async () => ({ ok: true }),
      deleteTurnsFrom: async () => ({ ok: true })
    },
    memory: {
      getProfile: async () => ({ facts: [] }),
      updateProfile: async () => ({ facts: [] }),
      clearProfile: async () => undefined,
      getPerCharacter: async () => [],
      clearPerCharacter: async () => undefined,
      clearAll: async () => undefined,
      getSettings: async () => ({ autoLearnEnabled: true, extractEveryNTurns: 2 }),
      setSettings: async (input) => ({
        autoLearnEnabled: input.autoLearnEnabled ?? true,
        extractEveryNTurns: input.extractEveryNTurns ?? 2
      }),
      getRecentChanges: async () => [],
      undoLastChange: async () => ({ ok: false, reason: "stub" })
    },
    pet: {
      summon: async () => undefined,
      hush: async () => undefined,
      setPosition: async () => undefined,
      setMouseIgnore: async () => undefined,
      openChat: async () => undefined,
      openSettings: async () => undefined,
      hide: async () => undefined,
      setContextMenuOpen: async () => null,
      dragStart: async () => undefined,
      dragMove: async () => undefined,
      dragEnd: async () => undefined
    },
    proactiveBubble: {
      dismiss: async () => undefined,
      resize: async () => undefined
    },
    proactive: {
      getSettings: async () => ({
        enabled: false,
        intensity: "off" as const,
        maxPerHour: 0 as const,
        companionFrequency: "off" as const,
        scenarioToggles: {
          longActive: true,
          idle: true,
          returnActive: true,
          unlock: false
        },
        defaultHushMinutes: 30 as const,
        defaultFocusMinutes: 25 as const,
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        screenAwareness: "off" as const,
        petDisplayScale: 0.9
      }),
      setSettings: async (input) => input,
      getStatus: async () => ({
        enabled: false,
        companionFrequency: "off" as const,
        maxPerHour: 0,
        utterancesThisHour: 0,
        screenAwareness: "off" as const,
        activeMinutes: 0,
        longActiveThresholdMinutes: 60,
        minutesUntilLongActive: null
      }),
      triggerNow: async () => ({ ok: false, reason: "stub" }),
      triggerLlmScreenshot: async () => ({ ok: false, reason: "stub" }),
      focusMode: async () => undefined
    },
    on: {
      chatStream: noopOff,
      chatVisibility: noopOff,
      activeCharacterChanged: noopOff,
      petSummon: noopOff,
      proactiveWhisper: noopOff,
      proactiveBubblePlacement: noopOff,
      ambientSignal: noopOff,
      distillationProgress: noopOff,
      localeChanged: (h) => {
        const onStorage = (e: StorageEvent) => {
          if (e.key === "bailin.locale" && (e.newValue === "zh" || e.newValue === "en")) {
            h(e.newValue);
          }
        };
        const onCustom = (e: Event) => {
          const next = (e as CustomEvent<"zh" | "en">).detail;
          if (next === "zh" || next === "en") h(next);
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener("bailin-locale", onCustom);
        return () => {
          window.removeEventListener("storage", onStorage);
          window.removeEventListener("bailin-locale", onCustom);
        };
      },
      themeChanged: (h) => {
        const onStorage = (e: StorageEvent) => {
          if (
            e.key === "bailin.theme" &&
            (e.newValue === "light" || e.newValue === "dark" || e.newValue === "system")
          ) {
            h(e.newValue);
          }
        };
        const onCustom = (e: Event) => {
          const next = (e as CustomEvent<"light" | "dark" | "system">).detail;
          if (next === "light" || next === "dark" || next === "system") h(next);
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener("bailin-theme", onCustom);
        return () => {
          window.removeEventListener("storage", onStorage);
          window.removeEventListener("bailin-theme", onCustom);
        };
      },
      profileUpdated: noopOff,
      navigateSettings: noopOff,
      proactiveSettingsChanged: noopOff
    }
  };
}

export function useActiveCharacter(): {
  bundle: CharacterBundle | null;
  refresh: () => Promise<void>;
} {
  const nuwa = useNuwa();
  const [bundle, setBundle] = useState<CharacterBundle | null>(null);

  const refresh = useCallback(async () => {
    const b = await nuwa.characters.getActive();
    setBundle(b);
  }, [nuwa]);

  useEffect(() => {
    void refresh();
    const off = nuwa.on.activeCharacterChanged((b) => {
      setBundle(b);
    });
    return off;
  }, [nuwa, refresh]);

  return { bundle, refresh };
}
