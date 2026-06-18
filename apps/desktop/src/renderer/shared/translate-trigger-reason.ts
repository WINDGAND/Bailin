import type { TranslationParams } from "./i18n/types.js";

const PROACTIVE_TRIGGER_KEYS: Record<string, string> = {
  disabled: "desktop.triggerReasonDisabled",
  "quiet-hours": "desktop.triggerReasonQuietHours",
  hushed: "desktop.triggerReasonHushed",
  "focus-mode": "desktop.triggerReasonFocusMode",
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
