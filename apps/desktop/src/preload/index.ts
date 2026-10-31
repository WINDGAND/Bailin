/**
 * 预加载脚本（Preload）——渲染进程访问主进程能力的唯一合法通道。
 *
 * ## 职责
 * 1. 把 `window.bailin` 这个受控 API 对象挂到渲染进程的全局作用域上，供桌宠窗、聊天窗、
 *    设置窗、气泡窗等所有渲染进程页面调用。
 * 2. 每一次调用都被翻译成一条 `ipcRenderer.invoke(通道名, ...参数)` 请求，通道名全部取自
 *    `../shared/ipc-contract.js` 的 `IPC` 常量表，不在本文件里硬编码字符串，避免两侧拼写漂移。
 *
 * ## 边界与安全约定
 * - 因为主进程开启了 `contextIsolation`（渲染进程拿不到 Node / Electron 对象），所以这里只暴露
 *   "扁平的方法集合"，绝不把 `ipcRenderer`、`require`、`process` 等原始能力透传出去；
 *   渲染进程能做的事被严格收敛到下面这份白名单内。
 * - 本文件不含任何业务判断：不做参数校验（交给主进程 handler 与类型契约）、不缓存状态、
 *   不处理错误。`invoke` 返回的 Promise 是 reject 还是 resolve 由主进程决定，渲染层自行处理。
 * - 参数类型尽量保持 `unknown`（如 `input: unknown`、`patch: unknown`），真正的结构定义集中在
 *   `ipc-contract.ts` 的 `BailinApi` 接口里。这样契约变更只需改一处，preload 不用跟着改签名。
 *
 * ## 与 ipc-contract 的对应关系
 * 下方各命名空间（app / feedback / llm / imageGen / characters / chat / memory / pet /
 * proactiveBubble / proactive / on）与 `BailinApi` 接口的分组逐一对应；`on.*` 的返回类型
 * （`() => void` 取消订阅函数）也与之保持一致。新增通道时，两处需同步增加。
 */
import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ImageTierName } from "../shared/ipc-contract.js";

/**
 * 要暴露给渲染进程的 API 集合。
 *
 * 结构上分为两组：
 * - **请求类命名空间**（app / feedback / llm / imageGen / characters / chat / memory / pet /
 *   proactiveBubble / proactive）：均为"渲染进程发起、主进程应答"的 `invoke` 调用，
 *   返回 Promise，结果类型见 `BailinApi`。
 * - **`on` 事件订阅命名空间**：均为"主进程推送、渲染进程监听"的单向广播，统一返回取消订阅函数。
 */
const api = {
  // ===== 应用级：首启引导、语言 / 主题、外链、版本与更新 =====
  app: {
    /** 是否首次启动（决定是否弹设置向导 / 引导流程）。 */
    isFirstRun: () => ipcRenderer.invoke(IPC.AppIsFirstRun),
    /** 标记首次引导已完成，之后 `isFirstRun` 恒为 false。 */
    completeFirstRun: () => ipcRenderer.invoke(IPC.AppCompleteFirstRun),
    /** 退出应用（设置页的"退出"入口走这里，而不是让渲染层关窗）。 */
    quit: () => ipcRenderer.invoke(IPC.AppQuit),
    getLocale: () => ipcRenderer.invoke(IPC.AppGetLocale),
    /** 切换界面语言；主进程会持久化并广播 EventLocaleChanged，实现多窗口同步。 */
    setLocale: (locale: "zh" | "en") => ipcRenderer.invoke(IPC.AppSetLocale, locale),
    getTheme: () => ipcRenderer.invoke(IPC.AppGetTheme),
    /** 切换明暗主题；"system" 表示跟随系统，主进程负责监听系统主题变化。 */
    setTheme: (theme: "light" | "dark" | "system") => ipcRenderer.invoke(IPC.AppSetTheme, theme),
    /** 用系统浏览器打开外部链接（GitHub、Release 页等）。渲染进程无法直接开外链，必须走主进程。 */
    openExternal: (url: string) => ipcRenderer.invoke(IPC.AppOpenExternal, url),
    getVersion: () => ipcRenderer.invoke(IPC.AppGetVersion),
    /** 主动检查更新，返回 UpdateCheckResult（含是否被用户"忽略此版本"的标记）。 */
    checkForUpdates: () => ipcRenderer.invoke(IPC.AppCheckForUpdates),
    /**
     * 拉取更新日志所需的 Release 列表。
     * `forceRefresh` 为 true 时跳过本地新鲜期缓存，强制向 GitHub 校验（可能触发限流，
     * 此时主进程会回退缓存并在结果里带上 `staleReason`）。
     */
    listReleases: (options?: { forceRefresh?: boolean }) =>
      ipcRenderer.invoke(IPC.AppListReleases, options),
    /** 记录"忽略此版本"，避免同一版本反复弹更新横幅。 */
    dismissUpdate: (latestVersion: string) => ipcRenderer.invoke(IPC.AppDismissUpdate, latestVersion)
  },

  // ===== 意见反馈：表单提交（正文 + 可选截图）由主进程转发到反馈服务 =====
  feedback: {
    submit: (input: unknown) => ipcRenderer.invoke(IPC.FeedbackSubmit, input)
  },

  // ===== 大语言模型供应商配置（含 API Key 的读写与连通性测试）=====
  llm: {
    setProvider: (input: unknown) => ipcRenderer.invoke(IPC.LlmSetProvider, input),
    /** 读回当前供应商配置。注意：返回给渲染层的是脱敏结果，API Key 原文不会下发。 */
    getProvider: () => ipcRenderer.invoke(IPC.LlmGetProvider),
    /** 用当前配置发一次最小请求，验证 Key 与网络是否可用。 */
    testConnection: () => ipcRenderer.invoke(IPC.LlmTestConnection),
    /** 清除已保存的 Key（供应商配置的其他字段保留）。 */
    clearKey: () => ipcRenderer.invoke(IPC.LlmClearKey)
  },

  // ===== 图像生成（角色立绘 / 精灵图）供应商配置 =====
  imageGen: {
    getConfig: () => ipcRenderer.invoke(IPC.ImageGenGetConfig),
    setConfig: (input: unknown) => ipcRenderer.invoke(IPC.ImageGenSetConfig, input),
    /** 探测当前供应商支持哪些画质档位，用于设置页只渲染可用选项。 */
    detectCapability: () => ipcRenderer.invoke(IPC.ImageGenDetectCapability),
    /** 对指定画质档位（tier）做真实出图测试；不传则用当前默认档位。 */
    test: (tier?: ImageTierName) => ipcRenderer.invoke(IPC.ImageGenTest, tier),
    clearKey: () => ipcRenderer.invoke(IPC.ImageGenClearKey)
  },

  // ===== 角色仓库：列表、创建（含深度蒸馏）、素材重生成、激活与删除 =====
  characters: {
    list: () => ipcRenderer.invoke(IPC.CharactersList),
    /** 按新的 id 顺序重排仓库列表（拖拽排序后调用）。 */
    reorder: (orderedIds: string[]) =>
      ipcRenderer.invoke(IPC.CharactersReorder, orderedIds),
    get: (id: string) => ipcRenderer.invoke(IPC.CharactersGet, id),
    /** 从内置 starter（预设角色）导入一份副本到本地仓库。 */
    importStarter: (id: string) => ipcRenderer.invoke(IPC.CharactersImportStarter, id),
    /**
     * 深度创建角色：启动多 Agent 研究 + 蒸馏流水线，属于长任务。
     * 进度通过 EventDistillationProgress 事件流式反馈，完成后需调用 approveDistillation 落库。
     */
    createDeep: (input: unknown) => ipcRenderer.invoke(IPC.CharactersCreateDeep, input),
    /** 用户确认蒸馏结果并正式保存角色。 */
    approveDistillation: (input: unknown) =>
      ipcRenderer.invoke(IPC.CharactersApproveDistillation, input),
    /** 中途取消蒸馏任务，主进程会清理已产生的临时产物。 */
    cancelDistillation: (jobId: string) =>
      ipcRenderer.invoke(IPC.CharactersCancelDistillation, jobId),
    /** 查看某次蒸馏任务收集到的研究文档（用户在检查点弹窗里可读）。 */
    getResearchDocs: (jobId: string) =>
      ipcRenderer.invoke(IPC.CharactersGetResearchDocs, jobId),
    getResearchByCharacter: (characterId: string) =>
      ipcRenderer.invoke(IPC.CharactersGetResearchByCharacter, characterId),
    /** 重新生成精灵图（桌宠动画帧集）。 */
    regenerateSprite: (id: string) => ipcRenderer.invoke(IPC.CharactersRegenerateSprite, id),
    /** 重新生成角色的口头禅 / 台词。 */
    regenerateQuote: (id: string) => ipcRenderer.invoke(IPC.CharactersRegenerateQuote, id),
    /** 按用户输入的外观描述重新生成形象。 */
    regenerateAppearance: (input: unknown) =>
      ipcRenderer.invoke(IPC.CharactersRegenerateAppearance, input),
    delete: (id: string) => ipcRenderer.invoke(IPC.CharactersDelete, id),
    /** 把某个角色设为当前激活角色（桌宠窗口展示的那一位）。 */
    activate: (id: string) => ipcRenderer.invoke(IPC.CharactersActivate, id),
    getActive: () => ipcRenderer.invoke(IPC.CharactersGetActive),
    listStarters: () => ipcRenderer.invoke(IPC.CharactersListStarters),
    /** 汇总探测：当前供应商是否具备生图 / 视觉能力。 */
    detectCapabilities: () => ipcRenderer.invoke(IPC.CharactersDetectCapabilities),
    /** 仅探测视觉（图片理解）能力，用于决定是否允许发送截图。 */
    detectVisionCapability: () => ipcRenderer.invoke(IPC.CharactersDetectVision),
    /** 用一张最小图片真实打一次视觉接口，比能力声明更可靠。 */
    probeVision: () => ipcRenderer.invoke(IPC.CharactersProbeVision),
    /** 探测联网搜索能力（影响深度蒸馏时是否能抓取外部资料）。 */
    probeWebSearch: () => ipcRenderer.invoke(IPC.CharactersProbeWebSearch)
  },

  // ===== 对话：发送 / 取消、会话管理与聊天窗口控制 =====
  chat: {
    /** 发送一轮消息。返回 requestId 等标识；回复正文通过 EventChatStream 流式推送。 */
    send: (input: unknown) => ipcRenderer.invoke(IPC.ChatSend, input),
    /** 按 requestId 中断正在流式输出的这一轮（用户点"停止生成"）。 */
    cancel: (requestId: string) => ipcRenderer.invoke(IPC.ChatCancel, requestId),
    newSession: (characterId: string) => ipcRenderer.invoke(IPC.ChatNewSession, characterId),
    /** 取该角色上次活跃的会话，用于打开聊天窗时恢复上下文。 */
    getActiveSession: (characterId: string) =>
      ipcRenderer.invoke(IPC.ChatGetActiveSession, characterId),
    /** 取历史消息；不传 sessionId 时按当前活跃会话返回。 */
    getRecent: (characterId: string, sessionId?: string) =>
      ipcRenderer.invoke(IPC.ChatGetRecent, characterId, sessionId),
    listSessions: (characterId: string) => ipcRenderer.invoke(IPC.ChatListSessions, characterId),
    switchSession: (input: unknown) => ipcRenderer.invoke(IPC.ChatSwitchSession, input),
    renameSession: (input: unknown) => ipcRenderer.invoke(IPC.ChatRenameSession, input),
    deleteSession: (input: unknown) => ipcRenderer.invoke(IPC.ChatDeleteSession, input),
    hide: () => ipcRenderer.invoke(IPC.ChatHide),
    isVisible: () => ipcRenderer.invoke(IPC.ChatIsVisible),
    getSize: () => ipcRenderer.invoke(IPC.ChatGetSize),
    /** 调整聊天窗尺寸（用户拖拽边缘后回写）；主进程会做最小 / 最大尺寸与出屏校正。 */
    resize: (input: { width: number; height: number }) =>
      ipcRenderer.invoke(IPC.ChatResize, input),
    /** 删除单条对话记录。 */
    deleteTurn: (input: unknown) => ipcRenderer.invoke(IPC.ChatDeleteTurn, input),
    /** 删除某条记录及其之后的全部内容（"从这里重新开始"）。 */
    deleteTurnsFrom: (input: unknown) => ipcRenderer.invoke(IPC.ChatDeleteTurnsFrom, input)
  },

  // ===== 长期记忆：用户画像、角色私有记忆、记忆策略与撤销 =====
  memory: {
    getProfile: () => ipcRenderer.invoke(IPC.MemoryGetProfile),
    updateProfile: (patch: unknown) => ipcRenderer.invoke(IPC.MemoryUpdateProfile, patch),
    clearProfile: () => ipcRenderer.invoke(IPC.MemoryClearProfile),
    /** 取某角色专属的记忆条目（与全局用户画像分开存放）。 */
    getPerCharacter: (id: string) => ipcRenderer.invoke(IPC.MemoryGetPerCharacter, id),
    clearPerCharacter: (id: string) => ipcRenderer.invoke(IPC.MemoryClearPerCharacter, id),
    /** 清空全部记忆：用户画像 + 所有角色私有记忆。 */
    clearAll: () => ipcRenderer.invoke(IPC.MemoryClearAll),
    getSettings: () => ipcRenderer.invoke(IPC.MemoryGetSettings),
    setSettings: (input: unknown) => ipcRenderer.invoke(IPC.MemorySetSettings, input),
    /** 画像变更记录（谁在什么时候改了哪条），用于设置页展示与追溯。 */
    getRecentChanges: (limit?: number) => ipcRenderer.invoke(IPC.MemoryGetRecentChanges, limit),
    /** 撤销最近一次画像变更（误记住时的一键回滚）。 */
    undoLastChange: () => ipcRenderer.invoke(IPC.MemoryUndoLastChange)
  },

  // ===== 桌宠窗口控制 =====
  pet: {
    /** 唤起桌宠窗（若已隐藏则重新显示并回到上次位置）。 */
    summon: () => ipcRenderer.invoke(IPC.PetSummon),
    /**
     * 静音一段时间：期间不弹主动陪伴气泡（用户"别打扰我"）。
     * 单位毫秒，静音截止时间由主进程记录在 ProactiveStatus.hushUntil。
     */
    hush: (ms: number) => ipcRenderer.invoke(IPC.PetHush, ms),
    setPosition: (x: number, y: number) => ipcRenderer.invoke(IPC.PetSetPosition, x, y),
    /**
     * 设置窗口是否"鼠标穿透"：true 时点击落到桌面、只有身体命中区才拦事件，
     * 用于实现鼠标移开后不挡桌面操作的效果。
     */
    setMouseIgnore: (ignore: boolean) => ipcRenderer.invoke(IPC.PetSetMouseIgnore, ignore),
    openChat: () => ipcRenderer.invoke(IPC.PetOpenChat),
    /** 打开设置窗并直接定位到指定标签页（右键菜单的快捷入口）。 */
    openSettings: (tab?: unknown) => ipcRenderer.invoke(IPC.PetOpenSettings, tab),
    hide: () => ipcRenderer.invoke(IPC.PetHide),
    /** 解析右键菜单应朝哪一侧展开（贴近屏幕边缘时自动翻转）。 */
    resolveContextMenuSide: () => ipcRenderer.invoke(IPC.PetResolveContextMenuSide),
    /** 打开 / 关闭独立快捷菜单窗；返回最终采用的展开方向。 */
    setContextMenuOpen: (open: boolean) => ipcRenderer.invoke(IPC.PetSetContextMenuOpen, open),
    /** 子菜单展开后按内容高度调整菜单窗尺寸（保持顶边，出屏则上移）。 */
    fitContextMenuSize: (size: { width?: number; height: number }) =>
      ipcRenderer.invoke(IPC.PetFitContextMenuSize, size),
    /**
     * 拖动三步曲：start 记录光标相对窗口的偏移，move 由主进程用
     * `screen.getCursorScreenPoint()` 反复计算新位置并 clamp 到屏内，end 清理状态并持久化位置。
     * 坐标运算全部留在主进程的物理像素体系里，避免渲染进程 CSS 像素与高 DPI 缩放之间的换算误差，
     * 因此这三个方法都不需要传坐标参数。
     */
    dragStart: () => ipcRenderer.invoke(IPC.PetDragStart),
    dragMove: () => ipcRenderer.invoke(IPC.PetDragMove),
    dragEnd: () => ipcRenderer.invoke(IPC.PetDragEnd)
  },

  // ===== 独立气泡窗（方案 B）：主动陪伴文案在独立窗口里展示 =====
  proactiveBubble: {
    dismiss: () => ipcRenderer.invoke(IPC.ProactiveBubbleDismiss),
    /** 内容测量完成后回写气泡窗尺寸，保证长文案不被裁切。 */
    resize: (size: { width: number; height: number }) =>
      ipcRenderer.invoke(IPC.ProactiveBubbleResize, size)
  },

  // ===== 主动陪伴 / 屏幕感知 =====
  proactive: {
    getSettings: () => ipcRenderer.invoke(IPC.ProactiveGetSettings),
    setSettings: (input: unknown) => ipcRenderer.invoke(IPC.ProactiveSetSettings, input),
    /** 运行状态快照：本小时已打扰次数、静音 / 专注到期时间、最近一次触发原因等。 */
    getStatus: () => ipcRenderer.invoke(IPC.ProactiveGetStatus),
    /**
     * 立即触发一次主动陪伴（调试或用户手动"陪我说说话"）。
     * reason 传入环境信号类型，便于统计与文案选择；不传由主进程按当前上下文推断。
     */
    triggerNow: (reason?: string) => ipcRenderer.invoke(IPC.ProactiveTriggerNow, reason),
    /** 忽略节流限制，立刻走一次"截图 + 视觉模型"的智能陪伴。 */
    triggerLlmScreenshot: () => ipcRenderer.invoke(IPC.ProactiveTriggerLlmScreenshot),
    /** 进入专注模式 durationMs 毫秒，期间不主动打扰。 */
    focusMode: (durationMs: number) => ipcRenderer.invoke(IPC.ProactiveFocusMode, durationMs)
  },

  /**
   * 主进程 → 渲染进程的事件订阅集合。
   *
   * 每个方法统一遵循同一套模板，理解其中一个即可推广到全部：
   * 1. 包一层 `listener`，把 Electron 原始回调的 `(event, payload)` 拆成只剩 payload——
   *    `event` 里带着 `sender` 等不可序列化对象，绝不能泄漏给渲染层业务代码；
   * 2. 用 `ipcRenderer.on(通道, listener)` 注册；
   * 3. **返回取消订阅函数**（`() => void`）。React 组件里直接把它当 `useEffect` 的
   *    cleanup 返回即可，切记要调用，否则组件卸载后监听器会不断累积、重复触发。
   */
  on: {
    /** 流式回复分片：delta 增量、done 结束、phase 为思考阶段、cancelled / error 为异常终态。 */
    chatStream(handler: (chunk: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventChatStream, listener);
      return () => ipcRenderer.removeListener(IPC.EventChatStream, listener);
    },
    /** 聊天窗显示 / 隐藏状态变化（桌宠据此切换神态或暂停动作）。 */
    chatVisibility(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventChatVisibility, listener);
      return () => ipcRenderer.removeListener(IPC.EventChatVisibility, listener);
    },
    /** 当前激活角色发生切换，payload 为新的 CharacterBundle（可能为 null，表示没有角色）。 */
    activeCharacterChanged(handler: (bundle: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventActiveCharacterChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventActiveCharacterChanged, listener);
    },
    /** 请求把桌宠叫回前台（无 payload）。 */
    petSummon(handler: () => void) {
      const listener = () => handler();
      ipcRenderer.on(IPC.EventPetSummon, listener);
      return () => ipcRenderer.removeListener(IPC.EventPetSummon, listener);
    },
    /** 快捷菜单窗已打开（桌宠主体可据此进入"菜单展开"待机状态）。 */
    petContextMenuOpen(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventPetContextMenuOpen, listener);
      return () => ipcRenderer.removeListener(IPC.EventPetContextMenuOpen, listener);
    },
    /** 快捷菜单窗已关闭（无 payload），用于恢复常态待机。 */
    petContextMenuClose(handler: () => void) {
      const listener = () => handler();
      ipcRenderer.on(IPC.EventPetContextMenuClose, listener);
      return () => ipcRenderer.removeListener(IPC.EventPetContextMenuClose, listener);
    },
    /** 一条主动陪伴悄悄话：含角色、文案、触发原因（idle / lock / llm 等）与生成层（模板 / LLM）。 */
    proactiveWhisper(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProactiveWhisper, listener);
      return () => ipcRenderer.removeListener(IPC.EventProactiveWhisper, listener);
    },
    /** 气泡窗应显示的方位（above / below），由主进程按屏幕剩余空间决定。 */
    proactiveBubblePlacement(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProactiveBubblePlacement, listener);
      return () => ipcRenderer.removeListener(IPC.EventProactiveBubblePlacement, listener);
    },
    /** 环境信号（空闲 / 活跃 / 长时间活跃 / 锁屏 / 解锁 / 恢复 / 手动），驱动陪伴决策。 */
    ambientSignal(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventAmbientSignal, listener);
      return () => ipcRenderer.removeListener(IPC.EventAmbientSignal, listener);
    },
    /** 深度蒸馏的实时进度（阶段、各 Agent 开始 / 结束、失败原因等）。 */
    distillationProgress(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventDistillationProgress, listener);
      return () => ipcRenderer.removeListener(IPC.EventDistillationProgress, listener);
    },
    /** 界面语言被改动，各窗口据此同步切换文案。 */
    localeChanged(handler: (locale: "zh" | "en") => void) {
      const listener = (_e: unknown, p: unknown) => handler(p as "zh" | "en");
      ipcRenderer.on(IPC.EventLocaleChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventLocaleChanged, listener);
    },
    /** 主题被改动，各窗口据此同步换肤。 */
    themeChanged(handler: (theme: "light" | "dark" | "system") => void) {
      const listener = (_e: unknown, p: unknown) =>
        handler(p as "light" | "dark" | "system");
      ipcRenderer.on(IPC.EventThemeChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventThemeChanged, listener);
    },
    /** 用户画像被更新（自动抽取或手动编辑后），设置页记忆面板据此刷新。 */
    profileUpdated(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProfileUpdated, listener);
      return () => ipcRenderer.removeListener(IPC.EventProfileUpdated, listener);
    },
    /** 请求设置窗跳转到某个标签页（例如从桌宠菜单直接进"模型"页）。 */
    navigateSettings(handler: (evt: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventNavigateSettings, listener);
      return () => ipcRenderer.removeListener(IPC.EventNavigateSettings, listener);
    },
    /** 主动陪伴设置被其他窗口修改，用于多窗口状态对齐。 */
    proactiveSettingsChanged(handler: (settings: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventProactiveSettingsChanged, listener);
      return () => ipcRenderer.removeListener(IPC.EventProactiveSettingsChanged, listener);
    },
    /** 主进程查到新版本（且未被用户忽略）时推送，用于侧栏红点高亮。 */
    updateAvailable(handler: (result: unknown) => void) {
      const listener = (_e: unknown, p: unknown) => handler(p);
      ipcRenderer.on(IPC.EventUpdateAvailable, listener);
      return () => ipcRenderer.removeListener(IPC.EventUpdateAvailable, listener);
    }
  }
};

// 挂载到渲染进程的 `window.bailin`。这是渲染层与主进程之间唯一的桥梁：
// 只有上面这份白名单内的能力可用，其余 Node / Electron 接口一律不可达。
contextBridge.exposeInMainWorld("bailin", api);

/**
 * 渲染进程侧的类型入口：直接由 `api` 推导，保证「实现」与「类型」永远一致。
 * 各渲染页面通过 `window.bailin` 使用这些能力；`ipc-contract.ts` 里的 `BailinApi`
 * 是人写的契约文档，两者需保持方法名与参数一一对应。
 */
export type BailinWindowApi = typeof api;
