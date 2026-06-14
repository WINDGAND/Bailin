/**
 * SafetyPolicy（MVP 极简版）。
 * 用关键词 / 正则做命中检测；命中后由 CharacterRuntime 在 system prompt 提示模型用角色化口吻拒答。
 * 严格越界（如未成年色情）直接硬拒，不走 LLM。
 */

export interface SafetyVerdict {
  kind: "ok" | "soft-refuse" | "hard-refuse";
  reason?: string;
  defaultRefusal?: string;
}

const HARD_REFUSE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(未成年|十二岁|十四岁|十六岁).*(性|色情|裸|做爱)/i, reason: "未成年色情请求" },
  { re: /(child|minor|underage).*(porn|nude|sex)/i, reason: "未成年色情请求" }
];

const SOFT_REFUSE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(自杀|自残).*(方法|怎么做|教程)/i, reason: "自伤求助" },
  { re: /(制毒|制造.*武器|炸弹.*制作)/i, reason: "违法操作教程" },
  { re: /(身份证号|银行卡号|密码|信用卡号).*\d{6,}/i, reason: "个人隐私信息" }
];

export const GLOBAL_REFUSAL_LIST = [
  "未成年色情",
  "制毒 / 武器 / 炸弹制造",
  "针对特定群体的极端煽动",
  "他人隐私详细信息"
];

const DEFAULT_REFUSAL_TEMPLATE =
  "这个话题我们换一个聊？如果你正在经历困难，请直接联系当地的紧急服务或专业支持。";

export class SafetyPolicy {
  check(userInput: string): SafetyVerdict {
    for (const { re, reason } of HARD_REFUSE_PATTERNS) {
      if (re.test(userInput)) {
        return { kind: "hard-refuse", reason, defaultRefusal: DEFAULT_REFUSAL_TEMPLATE };
      }
    }
    for (const { re, reason } of SOFT_REFUSE_PATTERNS) {
      if (re.test(userInput)) {
        return { kind: "soft-refuse", reason, defaultRefusal: DEFAULT_REFUSAL_TEMPLATE };
      }
    }
    return { kind: "ok" };
  }

  defaultRefusal(): string {
    return DEFAULT_REFUSAL_TEMPLATE;
  }
}
