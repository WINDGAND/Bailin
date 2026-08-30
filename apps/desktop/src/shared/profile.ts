/**
 * 用户画像规范化：把 LocalVault 里新旧 JSON 统一成 `UserProfile` v2，并裁成 prompt 可用片段。
 *
 * 旧版把目标 / 顾虑 / 禁忌拆成独立字符串数组；新版全部收进 `facts` 并带 `category`。
 * `normalizeProfile` 只做形状迁移、不写盘。`profileForPrompt` 按分类截断（`boundary` 不截断）。
 * 主进程记忆仓库、画像抽取与聊天 system prompt 共用本模块。
 */
import type {
  ProfileEntry,
  ProfileFact,
  ProfileFactCategory,
  PreferredNameField,
  UserProfile
} from "./ipc-contract.js";

/** UI 与 prompt 共用的分类展示顺序；未知分类会被归一成 `other`。 */
export const PROFILE_FACT_CATEGORY_ORDER: ProfileFactCategory[] = [
  "identity",
  "goal",
  "concern",
  "interest",
  "skill",
  "preference",
  "boundary",
  "other"
];

/** 空画像：无称呼、无事实。无副作用。 */
export function emptyProfile(): UserProfile {
  return { facts: [] };
}

const VALID_CATEGORIES = new Set<string>(PROFILE_FACT_CATEGORY_ORDER);

/**
 * 把未知 / 缺失的分类收成 `other`，避免脏 JSON 把非法 category 送进 prompt。
 * @returns 合法 `ProfileFactCategory`；无法识别时为 `other`。
 */
export function normalizeFactCategory(value: unknown): ProfileFactCategory {
  if (typeof value === "string" && VALID_CATEGORIES.has(value)) {
    return value as ProfileFactCategory;
  }
  return "other";
}

function isProfileEntry(value: unknown): value is ProfileEntry {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.updatedAt === "number" &&
    (o.source === "manual" || o.source === "auto")
  );
}

function isProfileFact(value: unknown): value is ProfileFact {
  return isProfileEntry(value) && typeof (value as ProfileFact).category === "string";
}

function isPreferredNameField(value: unknown): value is PreferredNameField {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.text === "string" &&
    typeof o.updatedAt === "number" &&
    (o.source === "manual" || o.source === "auto")
  );
}

function migrateStringList(
  items: unknown,
  category: ProfileFactCategory,
  now: number
): ProfileFact[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((text) => ({
      id: `legacy-${category}-${text.slice(0, 8)}-${now}`,
      text: text.trim(),
      updatedAt: now,
      source: "manual" as const,
      category
    }));
}

function migrateEntryList(
  items: unknown,
  category: ProfileFactCategory,
  now: number
): ProfileFact[] {
  if (!Array.isArray(items)) return [];
  // v2 已带 category；v1 ProfileEntry 无 category，用调用方传入的分类补上；再不行当纯字符串列表迁。
  if (items.every(isProfileFact)) {
    return items.map((f) => ({ ...f, category: normalizeFactCategory(f.category) }));
  }
  if (items.every(isProfileEntry)) {
    return (items as ProfileEntry[]).map((e) => ({
      ...e,
      category
    }));
  }
  return migrateStringList(items, category, now);
}

/** 将 DB 中的旧/新 JSON 统一为 UserProfile v2。 */
export function normalizeProfile(raw: unknown, now = Date.now()): UserProfile {
  if (!raw || typeof raw !== "object") return emptyProfile();
  const o = raw as Record<string, unknown>;

  let preferredName: PreferredNameField | undefined;
  // 旧数据把称呼存成裸字符串；新结构是 `{ text, updatedAt, source }`。
  if (isPreferredNameField(o.preferredName)) {
    preferredName = o.preferredName;
  } else if (typeof o.preferredName === "string" && o.preferredName.trim()) {
    preferredName = {
      text: o.preferredName.trim(),
      updatedAt: now,
      source: "manual"
    };
  }

  if (Array.isArray(o.facts)) {
    const facts = o.facts
      .filter((x) => isProfileEntry(x) || isProfileFact(x))
      .map((x) => {
        const entry = x as ProfileEntry;
        return {
          id: entry.id,
          text: entry.text.trim(),
          updatedAt: entry.updatedAt,
          source: entry.source,
          characterId: entry.characterId,
          sessionId: entry.sessionId,
          category: normalizeFactCategory((x as ProfileFact).category)
        };
      })
      .filter((f) => f.text.length > 0);
    return { preferredName, facts };
  }

  const facts: ProfileFact[] = [
    ...migrateEntryList(o.currentGoals, "goal", now),
    ...migrateEntryList(o.ongoingConcerns, "concern", now),
    ...migrateEntryList(o.tabooTopics, "boundary", now)
  ];

  return { preferredName, facts };
}

/** 取出称呼正文；空串视为未设置。无副作用。 */
export function profilePreferredNameText(profile: UserProfile): string | undefined {
  return profile.preferredName?.text?.trim() || undefined;
}

/** 比较 / 去重用：去首尾空白、压成单空格并转小写。不改原字符串。 */
export function normalizeEntryText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

const PROMPT_LIMITS: Partial<Record<ProfileFactCategory, number>> = {
  goal: 3,
  concern: 3,
  identity: 2,
  interest: 2,
  skill: 2,
  preference: 2,
  other: 2
};

/** 供 system prompt / 画像抽取 prompt 使用。 */
export function profileForPrompt(profile: UserProfile): {
  preferredName?: string;
  facts: Array<{ category: ProfileFactCategory; text: string }>;
  factsByCategory: Record<string, string[]>;
} {
  const preferredName = profilePreferredNameText(profile);
  const grouped = new Map<ProfileFactCategory, string[]>();

  for (const cat of PROFILE_FACT_CATEGORY_ORDER) {
    grouped.set(cat, []);
  }

  for (const fact of profile.facts) {
    const cat = normalizeFactCategory(fact.category);
    grouped.get(cat)!.push(fact.text);
  }

  const factsByCategory: Record<string, string[]> = {};
  const facts: Array<{ category: ProfileFactCategory; text: string }> = [];

  for (const cat of PROFILE_FACT_CATEGORY_ORDER) {
    const items = grouped.get(cat) ?? [];
    if (items.length === 0) continue;

    let selected: string[];
    // 边界 / 禁忌全部进 prompt，避免被截断后角色踩线；其它分类按 PROMPT_LIMITS 截取。
    if (cat === "boundary") {
      selected = items;
    } else {
      const limit = PROMPT_LIMITS[cat] ?? 2;
      selected = items.slice(0, limit);
    }

    factsByCategory[cat] = selected;
    for (const text of selected) {
      facts.push({ category: cat, text });
    }
  }

  return { preferredName, facts, factsByCategory };
}

/** 按分类分组 facts（UI 用，不过滤）。 */
export function groupFactsByCategory(
  facts: ProfileFact[]
): Map<ProfileFactCategory, ProfileFact[]> {
  const map = new Map<ProfileFactCategory, ProfileFact[]>();
  for (const cat of PROFILE_FACT_CATEGORY_ORDER) {
    map.set(cat, []);
  }
  for (const fact of facts) {
    const cat = normalizeFactCategory(fact.category);
    map.get(cat)!.push(fact);
  }
  return map;
}
