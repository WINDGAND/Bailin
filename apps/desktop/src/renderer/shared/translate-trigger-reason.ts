/**
 * 主动陪伴触发原因与 API 错误码的国际化翻译器。
 *
 * 本文件负责把主进程返回的英文/机器原因字符串（如 "hourly-quota"、"NETWORK_ERROR"）
 * 映射为对应的多语言文案键，供 UI 在 toast、设置页状态栏等位置展示中文/英文提示。
 * 映射表与主进程 ProactiveOrchestrator / LLMAdapter 的错误码保持同步；新增原因时
 * 须同时在此注册键名，否则前端会 fallback 到 "未知错误"。
 */
import type { TranslationParams } from "./i18n/types.js";

/** 主动陪伴各场景的门控/失败原因 → i18n 键。涵盖 quiet-hours、quota、LLM 截图等全部分支。 */
const PROACTIVE_TRIGGER_KEYS: Record<string, string> = {
  disabled: "desktop.triggerReasonDisabled",
  "quiet-hours": "desktop.triggerReasonQuietHours",
  hushed: "desktop.triggerReasonHushed",
  "focus-mode": "desktop.triggerReasonHushed",
  "chat-visible": "desktop.triggerReasonChatVisible",
  locked: "desktop.triggerReasonLocked",
  "quota-disabled": "desktop.triggerReasonQuotaDisabled",
  "hourly-quota": "desktop.triggerReasonHourlyQuota",
  "no-active-character": "desktop.triggerReasonNoActiveCharacter",
  "character-not-found": "desktop.triggerReasonCharacterNotFound",
  "scenario-disabled": "desktop.triggerReasonScenarioDisabled",
  "unknown-scenario": "desktop.triggerReasonUnknownScenario",
  "llm-screenshots-off": "desktop.triggerReasonLlmScreenshotsOff",
  "llm-capture-blocked": "desktop.triggerReasonLlmScreenshotsOff",
  "llm-no-vision": "desktop.triggerReasonLlmNoVision",
  "llm-capture-failed": "desktop.triggerReasonLlmCaptureFailed",
  "llm-unavailable": "desktop.triggerReasonLlmUnavailable",
  "llm-empty": "desktop.triggerReasonLlmEmpty",
  "llm-not-standard": "desktop.triggerReasonLlmNotStandard",
  "llm-interval": "desktop.triggerReasonLlmInterval",
  "llm-error": "desktop.triggerReasonLlmError"
};

/** LLM / 联网检索 / 图像生成等底层适配器错误码 → i18n 键。与 adapters/llm-adapter.ts 抛出的错误名一一对应。 */
const LLM_API_ERROR_KEYS: Record<string, string> = {
  NETWORK_ERROR: "common.apiErrorNetwork",
  TIMEOUT: "common.apiErrorTimeout",
  NO_PROVIDER: "common.apiErrorNoProvider",
  UNSUPPORTED_PROVIDER: "common.apiErrorUnsupportedProvider",
  AUTH_FAILED: "common.apiErrorAuthFailed",
  RATE_LIMITED: "common.apiErrorRateLimited",
  PROVIDER_ERROR: "common.apiErrorProviderError",
  BAD_RESPONSE: "common.apiErrorBadResponse",
  EMPTY_RESPONSE: "common.apiErrorEmptyResponse",
  CONTENT_FILTER: "common.apiErrorContentFilter",
  WEB_SEARCH_UNSUPPORTED_MODEL: "common.apiErrorWebSearchUnsupported",
  WEB_SEARCH_NOT_CONFIRMED: "common.apiErrorWebSearchNotConfirmed"
};

/**
 * 把主进程返回的原因字符串翻译成用户可见文案。
 *
 * 查找优先级：
 *  1. 主动陪伴门控原因（PROACTIVE_TRIGGER_KEYS）
 *  2. LLM / API 错误码（LLM_API_ERROR_KEYS）
 *  3. HTTP_ 前缀状态码（如 "HTTP_429"）
 *  4. 以上皆不匹配则返回 "未知错误" 兜底
 *
 * @param t   翻译函数，来自 i18n 上下文
 * @param reason  主进程返回的原始原因字符串；undefined 时直接走兜底
 * @returns  本地化后的提示文案
 */
export function translateTriggerReason(
  t: (key: string, params?: TranslationParams) => string,
  reason: string | undefined
): string {
  if (!reason) return t("common.unknownError");

  const proactiveKey = PROACTIVE_TRIGGER_KEYS[reason];
  if (proactiveKey) return t(proactiveKey);

  const apiKey = LLM_API_ERROR_KEYS[reason];
  if (apiKey) return t(apiKey);

  if (reason.startsWith("HTTP_")) {
    return t("common.apiErrorHttp", { status: reason.slice(5) });
  }

  return t("common.apiErrorUnknown", { code: reason });
}
