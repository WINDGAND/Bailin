import type {
  ProfileEntry,
  ProfileFact,
  ProfileFactCategory,
  PreferredNameField,
  UserProfile
} from "./ipc-contract.js";

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

export function emptyProfile(): UserProfile {
  return { facts: [] };
}

const VALID_CATEGORIES = new Set<string>(PROFILE_FACT_CATEGORY_ORDER);

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

export function profilePreferredNameText(profile: UserProfile): string | undefined {
  return profile.preferredName?.text?.trim() || undefined;
}

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
