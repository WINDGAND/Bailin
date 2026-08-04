import type { ConfirmFn } from "./feedback.js";
import type { SettingsTab } from "../../shared/ipc-contract.js";

interface EnsureLlmConfiguredOptions {
  bailin: {
    llm: { getProvider(): Promise<unknown> };
    pet: { openSettings(tab?: SettingsTab): Promise<void> };
  };
  confirm: ConfirmFn;
  t: (key: string) => string;
  /** 默认打开设置「模型与 API Key」页 */
  settingsTab?: "key";
}

/**
 * 核心操作前检查是否已配置 LLM。
 * 未配置时弹出与系统一致的 ConfirmDialog，确认则跳转设置页。
 * @returns true = 已配置，可继续；false = 未配置（已引导或用户取消）
 */
export async function ensureLlmConfigured(
  options: EnsureLlmConfiguredOptions
): Promise<boolean> {
  const provider = await options.bailin.llm.getProvider();
  if (provider) return true;

  const go = await options.confirm({
    title: options.t("provider.needKeyTitle"),
    body: options.t("provider.needKeyBody"),
    confirmLabel: options.t("provider.needKeyConfirm"),
    cancelLabel: options.t("provider.needKeyCancel")
  });
  if (go) {
    void options.bailin.pet.openSettings(options.settingsTab ?? "key");
  }
  return false;
}
