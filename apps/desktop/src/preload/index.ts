import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ImageTierName } from "../shared/ipc-contract.js";

const api = {
  app: {
    isFirstRun: () => ipcRenderer.invoke(IPC.AppIsFirstRun),
    completeFirstRun: () => ipcRenderer.invoke(IPC.AppCompleteFirstRun),
    quit: () => ipcRenderer.invoke(IPC.AppQuit),
    getLocale: () => ipcRenderer.invoke(IPC.AppGetLocale),
    setLocale: (locale: "zh" | "en") => ipcRenderer.invoke(IPC.AppSetLocale, locale),
    getTheme: () => ipcRenderer.invoke(IPC.AppGetTheme),
    setTheme: (theme: "light" | "dark" | "system") => ipcRenderer.invoke(IPC.AppSetTheme, theme),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.AppOpenExternal, url),
    getVersion: () => ipcRenderer.invoke(IPC.AppGetVersion),
    checkForUpdates: () => ipcRenderer.invoke(IPC.AppCheckForUpdates),
    listReleases: () => ipcRenderer.invoke(IPC.AppListReleases),
    dismissUpdate: (latestVersion: string) => ipcRenderer.invoke(IPC.AppDismissUpdate, latestVersion)
  },
  llm: {
    setProvider: (input: unknown) => ipcRenderer.invoke(IPC.LlmSetProvider, input),
    getProvider: () => ipcRenderer.invoke(IPC.LlmGetProvider),
    testConnection: () => ipcRenderer.invoke(IPC.LlmTestConnection),
    clearKey: () => ipcRenderer.invoke(IPC.LlmClearKey)
  },
  imageGen: {
    getConfig: () => ipcRenderer.invoke(IPC.ImageGenGetConfig),
    setConfig: (input: unknown) => ipcRenderer.invoke(IPC.ImageGenSetConfig, input),
    detectCapability: () => ipcRenderer.invoke(IPC.ImageGenDetectCapability),
    test: (tier?: ImageTierName) => ipcRenderer.invoke(IPC.ImageGenTest, tier),
    clearKey: () => ipcRenderer.invoke(IPC.ImageGenClearKey)
  },
  characters: {
    list: () => ipcRenderer.invoke(IPC.CharactersList),
    get: (id: string) => ipcRenderer.invoke(IPC.CharactersGet, id),
    importStarter: (id: string) => ipcRenderer.invoke(IPC.CharactersImportStarter, id),
    createDeep: (input: unknown) => ipcRenderer.invoke(IPC.CharactersCreateDeep, input),
    approveDistillation: (input: unknown) =>
      ipcRenderer.invoke(IPC.CharactersApproveDistillation, input),
    cancelDistillation: (jobId: string) =>
      ipcRenderer.invoke(IPC.CharactersCancelDistillation, jobId),
    getResearchDocs: (jobId: string) =>
      ipcRenderer.invoke(IPC.CharactersGetResearchDocs, jobId),
    getResearchByCharacter: (characterId: string) =>
      ipcRenderer.invoke(IPC.CharactersGetResearchByCharacter, characterId),
    regenerateSprite: (id: string) => ipcRenderer.invoke(IPC.CharactersRegenerateSprite, id),
    regenerateAppearance: (input: unknown) =>
      ipcRenderer.invoke(IPC.CharactersRegenerateAppearance, input),
    delete: (id: string) => ipcRenderer.invoke(IPC.CharactersDelete, id),
    activate: (id: string) => ipcRenderer.invoke(IPC.CharactersActivate, id),
    getActive: () => ipcRenderer.invoke(IPC.CharactersGetActive),
    listStarters: () => ipcRenderer.invoke(IPC.CharactersListStarters),
    detectCapabilities: () => ipcRenderer.invoke(IPC.CharactersDetectCapabilities),
    detectVisionCapability: () => ipcRenderer.invoke(IPC.CharactersDetectVision),
    probeVision: () => ipcRenderer.invoke(IPC.CharactersProbeVision),
    probeWebSearch: () => ipcRenderer.invoke(IPC.CharactersProbeWebSearch)
  },
  chat: {
    send: (input: unknown) => ipcRenderer.invoke(IPC.ChatSend, input),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC.ChatCancel, requestId),
    newSession: (characterId: string) => ipcRenderer.invoke(IPC.ChatNewSession, characterId),
    getActiveSession: (characterId: string) =>
      ipcRenderer.invoke(IPC.ChatGetActiveSession, characterId),
    getRecent: (characterId: string, sessionId?: string) =>
      ipcRenderer.invoke(IPC.ChatGetRecent, characterId, sessionId),
    listSessions: (characterId: string) => ipcRenderer.invoke(IPC.ChatListSessions, characterId),
    switchSession: (input: unknown) => ipcRenderer.invoke(IPC.ChatSwitchSession, input),
    renameSession: (input: unknown) => ipcRenderer.invoke(IPC.ChatRenameSession, input),
    deleteSession: (input: unknown) => ipcRenderer.invoke(IPC.ChatDeleteSession, input),
    hide: () => ipcRenderer.invoke(IPC.ChatHide),
    isVisible: () => ipcRenderer.invoke(IPC.ChatIsVisible),
    getSize: () => ipcRenderer.invoke(IPC.ChatGetSize),
    resize: (input: { width: number; height: number }) =>
      ipcRenderer.invoke(IPC.ChatResize, input),
    deleteTurn: (input: unknown) => ipcRenderer.invoke(IPC.ChatDeleteTurn, input),
    deleteTurnsFrom: (input: unknown) => ipcRenderer.invoke(IPC.ChatDeleteTurnsFrom, input)
  },
  memory: {
    getProfile: () => ipcRenderer.invoke(IPC.MemoryGetProfile),
    updateProfile: (patch: unknown) => ipcRenderer.invoke(IPC.MemoryUpdateProfile, patch),
    clearProfile: () => ipcRenderer.invoke(IPC.MemoryClearProfile),
    getPerCharacter: (id: string) => ipcRenderer.invoke(IPC.MemoryGetPerCharacter, id),
    clearPerCharacter: (id: string) => ipcRenderer.invoke(IPC.MemoryClearPerCharacter, id),
    clearAll: () => ipcRenderer.invoke(IPC.MemoryClearAll),
    getSettings: () => ipcRenderer.invoke(IPC.MemoryGetSettings),
    setSettings: (input: unknown) => ipcRenderer.invoke(IPC.MemorySetSettings, input),
    getRecentChanges: (limit?: number) => ipcRenderer.invoke(IPC.MemoryGetRecentChanges, limit),
    undoLastChange: () => ipcRenderer.invoke(IPC.MemoryUndoLastChange)
  },
  pet: {
    summon: () => ipcRenderer.invoke(IPC.PetSummon),
    hush: (ms: number) => ipcRenderer.invoke(IPC.PetHush, ms),
    setPosition: (x: number, y: number) => ipcRenderer.invoke(IPC.PetSetPosition, x, y),
    setMouseIgnore: (ignore: boolean) => ipcRenderer.invoke(IPC.PetSetMouseIgnore, ignore),
    openChat: () => ipcRenderer.invoke(IPC.PetOpenChat),
    openSettings: (tab?: unknown) => ipcRenderer.invoke(IPC.PetOpenSettings, tab),
    hide: () => ipcRenderer.invoke(IPC.PetHide),
    setContextMenuOpen: (open: boolean) => ipcRenderer.invoke(IPC.PetSetContextMenuOpen, open),
    dragStart: () => ipcRenderer.invoke(IPC.PetDragStart),
    dragMove: () => ipcRenderer.invoke(IPC.PetDragMove),
    dragEnd: () => ipcRenderer.invoke(IPC.PetDragEnd)
  },
  proactiveBubble: {
    dismiss: () => ipcRenderer.invoke(IPC.ProactiveBubbleDismiss),
    resize: (size: { width: number; height: number }) =>
      ipcRenderer.invoke(IPC.ProactiveBubbleResize, size)
  },
  proactive: {
    getSettings: () => ipcRenderer.invoke(IPC.ProactiveGetSettings),
    setSettings: (input: unknown) => ipcRenderer.invoke(IPC.ProactiveSetSettings, input),
    getStatus: () => ipcRenderer.invoke(IPC.ProactiveGetStatus),
    triggerNow: (reason?: string) => ipcRenderer.invoke(IPC.ProactiveTriggerNow, reason),
    triggerLlmScreenshot: () => ipcRenderer.invoke(IPC.ProactiveTriggerLlmScreenshot),
    focusMode: (durationMs: number) => ipcRenderer.invoke(IPC.ProactiveFocusMode, durationMs)
  },
  on: {
    chatStream(handler: (chunk: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventChatStream, listener);
      return () => ipcRenderer.removeListener(IPC.EventChatStream, listener);
    },
    chatVisibility(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventChatVisibility, listener);
      return () => ipcRenderer.removeListener(IPC.EventChatVisibility, listener);
    },
    activeCharacterChanged(handler: (bundle: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventActiveCharacterChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventActiveCharacterChanged, listener);
    },
    petSummon(handler: () => void) {
      const listener = () => handler();
      ipcRenderer.on(IPC.EventPetSummon, listener);
      return () => ipcRenderer.removeListener(IPC.EventPetSummon, listener);
    },
    proactiveWhisper(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProactiveWhisper, listener);
      return () => ipcRenderer.removeListener(IPC.EventProactiveWhisper, listener);
    },
    proactiveBubblePlacement(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProactiveBubblePlacement, listener);
      return () => ipcRenderer.removeListener(IPC.EventProactiveBubblePlacement, listener);
    },
    ambientSignal(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventAmbientSignal, listener);
      return () => ipcRenderer.removeListener(IPC.EventAmbientSignal, listener);
    },
    distillationProgress(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventDistillationProgress, listener);
      return () => ipcRenderer.removeListener(IPC.EventDistillationProgress, listener);
    },
    localeChanged(handler: (locale: "zh" | "en") => void) {
      const listener = (_e: unknown, p: unknown) => handler(p as "zh" | "en");
      ipcRenderer.on(IPC.EventLocaleChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventLocaleChanged, listener);
    },
    themeChanged(handler: (theme: "light" | "dark" | "system") => void) {
      const listener = (_e: unknown, p: unknown) =>
        handler(p as "light" | "dark" | "system");
      ipcRenderer.on(IPC.EventThemeChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventThemeChanged, listener);
    },
    profileUpdated(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProfileUpdated, listener);
      return () => ipcRenderer.removeListener(IPC.EventProfileUpdated, listener);
    },
    navigateSettings(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventNavigateSettings, listener);
      return () => ipcRenderer.removeListener(IPC.EventNavigateSettings, listener);
    },
    proactiveSettingsChanged(handler: (settings: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProactiveSettingsChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventProactiveSettingsChanged, listener);
    },
    updateAvailable(handler: (result: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventUpdateAvailable, listener);
      return () => ipcRenderer.removeListener(IPC.EventUpdateAvailable, listener);
    }
  }
};

contextBridge.exposeInMainWorld("bailin", api);

export type BailinWindowApi = typeof api;
