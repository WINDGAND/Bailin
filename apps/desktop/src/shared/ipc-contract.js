"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC = void 0;
exports.IPC = {
    AppIsFirstRun: "nuwa.app.isFirstRun",
    AppCompleteFirstRun: "nuwa.app.completeFirstRun",
    AppQuit: "nuwa.app.quit",
    LlmSetProvider: "nuwa.llm.setProvider",
    LlmGetProvider: "nuwa.llm.getProvider",
    LlmTestConnection: "nuwa.llm.testConnection",
    LlmClearKey: "nuwa.llm.clearKey",
    CharactersList: "nuwa.characters.list",
    CharactersGet: "nuwa.characters.get",
    CharactersImportStarter: "nuwa.characters.importStarter",
    CharactersCreate: "nuwa.characters.create",
    CharactersDelete: "nuwa.characters.delete",
    CharactersActivate: "nuwa.characters.activate",
    CharactersGetActive: "nuwa.characters.getActive",
    CharactersListStarters: "nuwa.characters.listStarters",
    ChatSend: "nuwa.chat.send",
    ChatCancel: "nuwa.chat.cancel",
    ChatNewSession: "nuwa.chat.newSession",
    ChatGetRecent: "nuwa.chat.getRecent",
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
    EventChatStream: "nuwa.event.chatStream",
    EventActiveCharacterChanged: "nuwa.event.activeCharacterChanged",
    EventPetSummon: "nuwa.event.petSummon"
};
//# sourceMappingURL=ipc-contract.js.map