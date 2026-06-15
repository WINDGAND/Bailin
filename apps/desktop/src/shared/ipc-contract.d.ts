import type { CharacterBundle } from "@nuwa-pet/character-protocol";
/**
 * 渲染进程与主进程之间的 IPC 契约。
 * Preload 暴露给渲染进程一个 `window.nuwa` 对象，下方所有方法都通过 ipcRenderer.invoke。
 */
export interface BailinApi {
    app: {
        isFirstRun(): Promise<boolean>;
        completeFirstRun(): Promise<void>;
        quit(): Promise<void>;
    };
    llm: {
        setProvider(input: LLMProviderConfig): Promise<{
            ok: boolean;
            error?: string;
        }>;
        getProvider(): Promise<LLMProviderConfig | null>;
        testConnection(): Promise<{
            ok: boolean;
            latencyMs?: number;
            error?: string;
        }>;
        clearKey(): Promise<void>;
    };
    characters: {
        list(): Promise<CharacterListItem[]>;
        get(characterId: string): Promise<CharacterBundle | null>;
        importStarter(starterId: string): Promise<{
            ok: boolean;
            characterId?: string;
            error?: string;
        }>;
        create(input: CreateCharacterInput): Promise<{
            ok: boolean;
            characterId?: string;
            isSkeleton?: boolean;
            error?: string;
        }>;
        delete(characterId: string): Promise<{
            ok: boolean;
        }>;
        activate(characterId: string): Promise<{
            ok: boolean;
        }>;
        getActive(): Promise<CharacterBundle | null>;
        listStarters(): Promise<StarterMetaDto[]>;
    };
    chat: {
        send(input: SendMessageInput): Promise<{
            requestId: string;
        }>;
        cancel(requestId: string): Promise<void>;
        newSession(characterId: string): Promise<{
            sessionId: string;
        }>;
        getRecent(characterId: string): Promise<ChatTurn[]>;
    };
    memory: {
        getProfile(): Promise<UserProfile>;
        updateProfile(input: Partial<UserProfile>): Promise<UserProfile>;
        clearProfile(): Promise<void>;
        getPerCharacter(characterId: string): Promise<string[]>;
        clearPerCharacter(characterId: string): Promise<void>;
        clearAll(): Promise<void>;
    };
    pet: {
        summon(): Promise<void>;
        hush(durationMs: number): Promise<void>;
        setPosition(x: number, y: number): Promise<void>;
        setMouseIgnore(ignore: boolean): Promise<void>;
    };
    on: {
        chatStream(handler: (chunk: ChatStreamChunk) => void): () => void;
        activeCharacterChanged(handler: (bundle: CharacterBundle | null) => void): () => void;
        petSummon(handler: () => void): () => void;
    };
}
export interface LLMProviderConfig {
    kind: "openai-compatible" | "anthropic-compatible";
    baseUrl: string;
    apiKey: string;
    model: string;
    visionModel?: string;
    defaultTemperature?: number;
    defaultMaxTokens?: number;
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
}
export interface ChatStreamChunk {
    requestId: string;
    sessionId: string;
    done: boolean;
    delta?: string;
    error?: string;
    finishReason?: "stop" | "length" | "error" | "safety";
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
export declare const IPC: {
    readonly AppIsFirstRun: "nuwa.app.isFirstRun";
    readonly AppCompleteFirstRun: "nuwa.app.completeFirstRun";
    readonly AppQuit: "nuwa.app.quit";
    readonly LlmSetProvider: "nuwa.llm.setProvider";
    readonly LlmGetProvider: "nuwa.llm.getProvider";
    readonly LlmTestConnection: "nuwa.llm.testConnection";
    readonly LlmClearKey: "nuwa.llm.clearKey";
    readonly CharactersList: "nuwa.characters.list";
    readonly CharactersGet: "nuwa.characters.get";
    readonly CharactersImportStarter: "nuwa.characters.importStarter";
    readonly CharactersCreate: "nuwa.characters.create";
    readonly CharactersDelete: "nuwa.characters.delete";
    readonly CharactersActivate: "nuwa.characters.activate";
    readonly CharactersGetActive: "nuwa.characters.getActive";
    readonly CharactersListStarters: "nuwa.characters.listStarters";
    readonly ChatSend: "nuwa.chat.send";
    readonly ChatCancel: "nuwa.chat.cancel";
    readonly ChatNewSession: "nuwa.chat.newSession";
    readonly ChatGetRecent: "nuwa.chat.getRecent";
    readonly MemoryGetProfile: "nuwa.memory.getProfile";
    readonly MemoryUpdateProfile: "nuwa.memory.updateProfile";
    readonly MemoryClearProfile: "nuwa.memory.clearProfile";
    readonly MemoryGetPerCharacter: "nuwa.memory.getPerCharacter";
    readonly MemoryClearPerCharacter: "nuwa.memory.clearPerCharacter";
    readonly MemoryClearAll: "nuwa.memory.clearAll";
    readonly PetSummon: "nuwa.pet.summon";
    readonly PetHush: "nuwa.pet.hush";
    readonly PetSetPosition: "nuwa.pet.setPosition";
    readonly PetSetMouseIgnore: "nuwa.pet.setMouseIgnore";
    readonly EventChatStream: "nuwa.event.chatStream";
    readonly EventActiveCharacterChanged: "nuwa.event.activeCharacterChanged";
    readonly EventPetSummon: "nuwa.event.petSummon";
};
//# sourceMappingURL=ipc-contract.d.ts.map
