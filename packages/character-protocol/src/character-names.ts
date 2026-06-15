import { pinyin } from "pinyin-pro";

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const ROLE_SUFFIX_RE =
  /\s*[·•]\s*(?:视角助手|灵感角色|灵感视角|思维顾问|桌面陪伴)\s*$/;
const LATIN_NAME_RE = /^[\p{L}\p{M}\s.'\-]+$/u;

export interface CharacterNamePair {
  chineseName: string;
  englishName: string;
}

export interface NormalizeCharacterNamesInput {
  inputName?: string;
  name?: string;
  sourceName?: string;
  chineseName?: string;
  englishName?: string;
}

function hasCjk(value: string): boolean {
  return CJK_RE.test(value);
}

function isLatinName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !hasCjk(trimmed) && LATIN_NAME_RE.test(trimmed);
}

function stripRoleSuffix(name: string): string {
  return name.replace(ROLE_SUFFIX_RE, "").trim();
}

function splitNameParts(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*[\/|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

function titleCase(segment: string): string {
  return segment
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** 中文名 → 拼音英文名（GivenName FamilyName），用于无常用英文译名时。 */
export function chineseNameToPinyinEnglish(chinese: string): string {
  const compact = chinese.replace(/\s+/g, "").replace(/[·•]/g, "");
  if (!hasCjk(compact)) return compact;

  const chars = [...compact];
  const surnameLen = 1;
  const surname = chars.slice(0, surnameLen).join("");
  const given = chars.slice(surnameLen).join("");
  const surnamePinyin = titleCase(pinyin(surname, { toneType: "none" }));
  if (!given) return surnamePinyin;

  const givenPinyin = titleCase(
    pinyin(given, { toneType: "none", type: "array" }).join("")
  );
  return `${givenPinyin} ${surnamePinyin}`;
}

function isUsableEnglishName(value: string | undefined, chineseName: string): boolean {
  if (!value?.trim()) return false;
  if (!isLatinName(value)) return false;
  return value.trim().toLowerCase() !== chineseName.trim().toLowerCase();
}

export function needsCharacterNameLookup(
  names: CharacterNamePair,
  sourceType: "public-figure" | "fictional" | "original"
): boolean {
  const hasCompletePair =
    Boolean(names.chineseName.trim()) &&
    Boolean(names.englishName.trim()) &&
    hasCjk(names.chineseName) &&
    isUsableEnglishName(names.englishName, names.chineseName);

  if (sourceType === "public-figure" || sourceType === "fictional") {
    return !hasCompletePair;
  }

  return !hasCompletePair;
}

export function normalizeCharacterNames(
  input: NormalizeCharacterNamesInput
): CharacterNamePair {
  const cleanedName = stripRoleSuffix(input.name ?? input.inputName ?? "");
  const candidates = unique(
    [
      input.chineseName,
      input.englishName,
      cleanedName,
      input.inputName ? stripRoleSuffix(input.inputName) : "",
      ...splitNameParts(input.sourceName)
    ].filter((part): part is string => Boolean(part?.trim()))
  );

  const chineseParts = candidates.filter(hasCjk);
  const englishParts = candidates.filter(isLatinName);

  let chineseName =
    (input.chineseName && hasCjk(input.chineseName) ? input.chineseName : undefined) ??
    chineseParts.find((part) => part === cleanedName || cleanedName.includes(part)) ??
    chineseParts[0] ??
    (hasCjk(cleanedName) ? cleanedName : "");

  if (!chineseName) {
    chineseName =
      hasCjk(input.inputName ?? "") ? stripRoleSuffix(input.inputName!) : cleanedName;
  }

  let englishName =
    (input.englishName && isLatinName(input.englishName)
      ? input.englishName
      : undefined) ??
    englishParts.find(
      (part) => part.toLowerCase() !== chineseName.toLowerCase()
    ) ??
    englishParts[0] ??
    "";

  if (!englishName && hasCjk(chineseName)) {
    englishName = chineseNameToPinyinEnglish(chineseName);
  }
  if (!englishName) {
    englishName = isLatinName(chineseName) ? chineseName : cleanedName;
  }
  if (!chineseName) {
    chineseName = cleanedName || input.inputName || englishName;
  }

  return {
    chineseName: stripRoleSuffix(chineseName),
    englishName: englishName.trim()
  };
}

export function applyCharacterNamesToMeta(
  meta: {
    name: string;
    sourceName?: string;
    chineseName?: string;
    englishName?: string;
  },
  names: CharacterNamePair
): void {
  meta.chineseName = names.chineseName;
  meta.englishName = names.englishName;
  meta.name = names.chineseName;
  meta.sourceName = names.englishName;
}

export function getCharacterDisplayNames(meta: {
  name: string;
  sourceName?: string;
  chineseName?: string;
  englishName?: string;
}): CharacterNamePair {
  if (meta.chineseName?.trim() && meta.englishName?.trim()) {
    return {
      chineseName: meta.chineseName.trim(),
      englishName: meta.englishName.trim()
    };
  }
  return normalizeCharacterNames({
    name: meta.name,
    sourceName: meta.sourceName,
    chineseName: meta.chineseName,
    englishName: meta.englishName
  });
}
