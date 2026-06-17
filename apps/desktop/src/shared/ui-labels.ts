/** UI locale shared by main process (tray) and renderer. */
export type UiLocale = "zh" | "en";

export function parseUiLocale(raw: string | null | undefined): UiLocale {
  return raw === "en" ? "en" : "zh";
}

export interface MainTrayLabels {
  summonClose: string;
  summonOpen: string;
  showPet: string;
  openSettings: string;
  quit: string;
  tooltip: string;
  uncaughtExceptionTitle: string;
}

const TRAY: Record<UiLocale, MainTrayLabels> = {
  zh: {
    summonClose: "关闭对话",
    summonOpen: "唤起对话",
    showPet: "显示桌宠",
    openSettings: "打开设置 / 角色仓库",
    quit: "退出",
    tooltip: "百灵 Bailin",
    uncaughtExceptionTitle: "百灵 Bailin · 主进程异常"
  },
  en: {
    summonClose: "Close chat",
    summonOpen: "Open chat",
    showPet: "Show pet",
    openSettings: "Open settings / library",
    quit: "Quit",
    tooltip: "Bailin",
    uncaughtExceptionTitle: "Bailin · Main process error"
  }
};

export function getMainTrayLabels(locale: UiLocale): MainTrayLabels {
  return TRAY[locale];
}
