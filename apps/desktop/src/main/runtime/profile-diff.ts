import { ulid } from "ulid";
import type {
  ProfileChange,
  ProfileExtractionDiff,
  ProfileFact,
  ProfileFactCategory,
  ProfileFactInput,
  UserProfile
} from "../../shared/ipc-contract.js";
import {
  emptyProfile,
  normalizeEntryText,
  normalizeFactCategory,
  profileForPrompt
} from "../../shared/profile.js";

const FACTS_LIMIT = 24;

export interface ApplyExtractionContext {
  characterId: string;
  sessionId: string;
  now?: number;
}

export interface ApplyExtractionResult {
  profile: UserProfile;
  changes: ProfileChange[];
  applied: boolean;
}

function factTextExists(facts: ProfileFact[], text: string): boolean {
  const key = normalizeEntryText(text);
  return facts.some((f) => normalizeEntryText(f.text) === key);
}

function trimFacts(facts: ProfileFact[]): ProfileFact[] {
  if (facts.length <= FACTS_LIMIT) return facts;
  const manual = facts.filter((f) => f.source === "manual");
  const auto = facts.filter((f) => f.source === "auto");
  const maxAuto = Math.max(0, FACTS_LIMIT - manual.length);
  while (auto.length > maxAuto) auto.pop();
  return [...manual, ...auto].sort((a, b) => b.updatedAt - a.updatedAt);
}

function prependAutoFact(
  facts: ProfileFact[],
  input: ProfileFactInput,
  ctx: ApplyExtractionContext,
  now: number
): ProfileFact[] {
  const trimmed = input.text.trim();
  if (!trimmed || factTextExists(facts, trimmed)) return facts;
  return [
    {
      id: ulid(),
      text: trimmed,
      category: normalizeFactCategory(input.category),
      updatedAt: now,
      source: "auto",
      characterId: ctx.characterId,
      sessionId: ctx.sessionId
    },
    ...facts
  ];
}

function removeAutoFacts(facts: ProfileFact[], toRemove: ProfileFactInput[] | undefined): ProfileFact[] {
  if (!toRemove?.length) return facts;
  const keys = new Set(toRemove.map((f) => normalizeEntryText(f.text)));
  return facts.filter(
    (f) => !(f.source === "auto" && keys.has(normalizeEntryText(f.text)))
  );
}

export function applyExtractionDiff(
  current: UserProfile,
  diff: ProfileExtractionDiff,
  ctx: ApplyExtractionContext
): ApplyExtractionResult {
  const now = ctx.now ?? Date.now();
  const profile: UserProfile = {
    preferredName: current.preferredName ? { ...current.preferredName } : undefined,
    facts: current.facts.map((f) => ({ ...f }))
  };
  const changes: ProfileChange[] = [];

  const addName = diff.add?.preferredName?.trim();
  if (addName) {
    const canSet =
      !profile.preferredName ||
      profile.preferredName.source === "auto" ||
      !profile.preferredName.text.trim();
    if (canSet && profile.preferredName?.text !== addName) {
      profile.preferredName = {
        text: addName,
        updatedAt: now,
        source: "auto",
        characterId: ctx.characterId,
        sessionId: ctx.sessionId
      };
      changes.push({ kind: "add_name", text: addName, at: now });
    }
  }

  if (diff.remove?.facts?.length) {
    for (const item of diff.remove.facts) {
      if (!item.text.trim()) continue;
      const before = profile.facts.length;
      profile.facts = removeAutoFacts(profile.facts, [item]);
      if (profile.facts.length < before) {
        changes.push({
          kind: "remove_fact",
          text: item.text.trim(),
          category: normalizeFactCategory(item.category),
          at: now
        });
      }
    }
  }

  if (diff.add?.facts?.length) {
    for (const item of diff.add.facts) {
      const before = profile.facts.length;
      profile.facts = prependAutoFact(profile.facts, item, ctx, now);
      if (profile.facts.length > before) {
        changes.push({
          kind: "add_fact",
          text: item.text.trim(),
          category: normalizeFactCategory(item.category),
          at: now
        });
      }
    }
  }

  profile.facts = trimFacts(profile.facts);

  return { profile, changes, applied: changes.length > 0 };
}

function hasFactInputs(items: ProfileFactInput[] | undefined): boolean {
  return Boolean(items?.some((f) => f.text.trim()));
}

export function isEmptyExtractionDiff(diff: ProfileExtractionDiff): boolean {
  const add = diff.add ?? {};
  const remove = diff.remove ?? {};
  return !add.preferredName?.trim() && !hasFactInputs(add.facts) && !hasFactInputs(remove.facts);
}

function parseFactInputs(v: unknown): ProfileFactInput[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ProfileFactInput[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    out.push({
      category: normalizeFactCategory(o.category),
      text
    });
  }
  return out.length > 0 ? out : undefined;
}

export function parseExtractionDiff(raw: unknown): ProfileExtractionDiff | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const addRaw = o.add;
  const removeRaw = o.remove;
  const add =
    addRaw && typeof addRaw === "object"
      ? {
          preferredName:
            typeof (addRaw as Record<string, unknown>).preferredName === "string"
              ? ((addRaw as Record<string, unknown>).preferredName as string)
              : undefined,
          facts: parseFactInputs((addRaw as Record<string, unknown>).facts)
        }
      : {};
  const remove =
    removeRaw && typeof removeRaw === "object"
      ? {
          facts: parseFactInputs((removeRaw as Record<string, unknown>).facts)
        }
      : {};
  return { add, remove };
}

/** 供单元测试 / MemoryPanel save 路径。 */
export function sanitizeManualProfile(input: Partial<UserProfile>, now = Date.now()): UserProfile {
  const base = emptyProfile();

  if (input.preferredName?.text?.trim()) {
    base.preferredName = {
      text: input.preferredName.text.trim(),
      updatedAt: now,
      source: "manual",
      characterId: input.preferredName.characterId,
      sessionId: input.preferredName.sessionId
    };
  }

  base.facts = (input.facts ?? [])
    .map((f) => ({
      id: f.id || ulid(),
      text: f.text.trim(),
      category: normalizeFactCategory(f.category),
      updatedAt: f.updatedAt || now,
      source: "manual" as const,
      characterId: f.characterId,
      sessionId: f.sessionId
    }))
    .filter((f) => f.text.length > 0);

  base.facts = trimFacts(base.facts);
  return base;
}

export { profileForPrompt };
