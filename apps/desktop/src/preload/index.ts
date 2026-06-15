import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ImageTierName } from "../shared/ipc-contract.js";

const api = {
  app: {
    isFirstRun: () => ipcRenderer.invoke(IPC.AppIsFirstRun),
    completeFirstRun: () => ipcRenderer.invoke(IPC.AppCompleteFirstRun),
    quit: () => ipcRenderer.invoke(IPC.AppQuit)
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
    create: (input: unknown) => ipcRenderer.invoke(IPC.CharactersCreate, input),
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
    getRecent: (characterId: string) => ipcRenderer.invoke(IPC.ChatGetRecent, characterId),
    hide: () => ipcRenderer.invoke(IPC.ChatHide)
  },
  memory: {
    getProfile: () => ipcRenderer.invoke(IPC.MemoryGetProfile),
    updateProfile: (patch: unknown) => ipcRenderer.invoke(IPC.MemoryUpdateProfile, patch),
    clearProfile: () => ipcRenderer.invoke(IPC.MemoryClearProfile),
    getPerCharacter: (id: string) => ipcRenderer.invoke(IPC.MemoryGetPerCharacter, id),
    clearPerCharacter: (id: string) => ipcRenderer.invoke(IPC.MemoryClearPerCharacter, id),
    clearAll: () => ipcRenderer.invoke(IPC.MemoryClearAll)
  },
  pet: {
    summon: () => ipcRenderer.invoke(IPC.PetSummon),
    hush: (ms: number) => ipcRenderer.invoke(IPC.PetHush, ms),
    setPosition: (x: number, y: number) => ipcRenderer.invoke(IPC.PetSetPosition, x, y),
    setMouseIgnore: (ignore: boolean) => ipcRenderer.invoke(IPC.PetSetMouseIgnore, ignore),
    openSettings: () => ipcRenderer.invoke(IPC.PetOpenSettings),
    hide: () => ipcRenderer.invoke(IPC.PetHide)
  },
  on: {
    chatStream(handler: (chunk: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventChatStream, listener);
      return () => ipcRenderer.removeListener(IPC.EventChatStream, listener);
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
    distillationProgress(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventDistillationProgress, listener);
      return () => ipcRenderer.removeListener(IPC.EventDistillationProgress, listener);
    }
  }
};

contextBridge.exposeInMainWorld("nuwa", api);

export type BailinWindowApi = typeof api;
