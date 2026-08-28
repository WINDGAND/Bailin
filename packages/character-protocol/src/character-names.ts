/**
 * 角色中英文名规范化：从用户输入、人设卡与来源字段抽出一对可用的中/英文名。
 *
 * 负责剥离产品角色后缀、统一间隔号、拼音回退英文名，以及判断公众人物/虚构角色
 * 是否还需要联网核验译名。纯函数，不读磁盘、不调 LLM。
 */
import { pinyin } from "pinyin-pro";

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const ROLE_SUFFIX_RE =
  /\s*[·•]\s*(?:视角助手|灵感角色|灵感视角|思维顾问|桌面陪伴)\s*$/;
const LATIN_NAME_RE = /^[\p{L}\p{M}\s.'\-]+$/u;

/** 一对展示/存储用的中文名与英文名；英文名可能是拼音回退而非官方译名。 */
export interface CharacterNamePair {
  chineseName: string;
  englishName: string;
}

/**
 * 规范化入参：各字段都可能缺失或互相重叠（用户一次填「中文/英文」）。
 * `name` / `inputName` 常是 UI 主输入；`sourceName` 可能含 `/` 或 `|` 分隔的多段。
 */
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

/**
 * 去掉「· 视角助手 / · 灵感角色 / · 灵感视角 / · 思维顾问 / · 桌面陪伴」
 * 等中文后缀。UI 展示场景应统一使用本函数，避免各处自写不完整的本地正则。
 */
export function stripRoleSuffix(name: string): string {
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
  const compact = chinese.replace(/\s+/g, "").replace(/[·•・]/g, "");
  if (!hasCjk(compact)) return compact;

  const chars = [...compact];
  // 按单字姓切分；复姓（欧阳等）未单独处理，避免误伤绝大多数两字名
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

/** 英文名是否为中文名拼音回退（非真实艺名/官方英文名）。 */
export function isPinyinFallbackEnglish(chineseName: string, englishName: string): boolean {
  if (!hasCjk(chineseName) || !isLatinName(englishName)) return false;
  const pinyin = chineseNameToPinyinEnglish(chineseName);
  return englishName.trim().toLowerCase() === pinyin.trim().toLowerCase();
}

/**
 * 外文角色常见译名应含间隔号（·），如「科比·布莱恩特」。
 * 连续 4+ 汉字且无间隔号，多半是用户随手输入未规范化。
 */
export function looksLikeForeignTranslitWithoutDot(chineseName: string): boolean {
  if (!hasCjk(chineseName)) return false;
  if (/[·•・]/.test(chineseName)) return false;
  const compact = chineseName.replace(/\s/g, "");
  return compact.length >= 4;
}

/** 统一中文间隔号为「·」。 */
export function normalizeChineseNameDots(chineseName: string): string {
  return chineseName.replace(/[•・]/g, "·").trim();
}

function isUsableEnglishName(value: string | undefined, chineseName: string): boolean {
  if (!value?.trim()) return false;
  if (!isLatinName(value)) return false;
  return value.trim().toLowerCase() !== chineseName.trim().toLowerCase();
}

/**
 * 是否还需要联网核验标准译名。
 *
 * 原创角色只要中英成对即可；公众人物/虚构角色若英文只是拼音回退、
 * 中文像未加间隔号的音译、或中英不成对，都视为需要查找。
 *
 * @param names 当前已规范化的名对
 * @param sourceType 角色来源类型
 * @returns true 表示调用方应走角色名解析（LLM / 检索）
 */
export function needsCharacterNameLookup(
  names: CharacterNamePair,
  sourceType: "public-figure" | "fictional" | "original"
): boolean {
  const chineseName = normalizeChineseNameDots(names.chineseName);
  const englishName = names.englishName.trim();

  const hasCompletePair =
    Boolean(chineseName) &&
    Boolean(englishName) &&
    hasCjk(chineseName) &&
    isUsableEnglishName(englishName, chineseName);

  if (sourceType === "original") {
    return !hasCompletePair;
  }

  // 公众人物 / 虚构：用户输入不可直接当标准译名，需联网核验
  if (isPinyinFallbackEnglish(chineseName, englishName)) return true;
  if (looksLikeForeignTranslitWithoutDot(chineseName)) return true;
  if (!hasCompletePair) return true;

  return false;
}

/**
 * 从可能互相重叠的输入字段抽出一对中英文名。
 *
 * 优先显式 `chineseName` / `englishName`；缺英文且中文含汉字时用拼音回退。
 *
 * @param input 用户表单、骨架卡或导入 meta 上的名字字段
 * @returns 已剥后缀、已统一间隔号的名对；无 I/O
 */
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
    chineseName: normalizeChineseNameDots(stripRoleSuffix(chineseName)),
    englishName: englishName.trim()
  };
}

/**
 * 把名对写回角色 meta。`name` 跟中文、`sourceName` 跟英文，供旧字段读取方兼容。
 *
 * @param meta 会被就地改写
 * @param names 规范化后的名对
 */
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

/**
 * 读取展示用名对：中英都已填写则直接用，否则走 `normalizeCharacterNames`。
 *
 * @param meta 角色卡 / 列表项上的名字字段
 * @returns 可直接展示的中英名对；无副作用
 */
export function getCharacterDisplayNames(meta: {
  name: string;
  sourceName?: string;
  chineseName?: string;
  englishName?: string;
}): CharacterNamePair {
  if (meta.chineseName?.trim() && meta.englishName?.trim()) {
    // 已有完整中英对则不走规范化，避免把用户核验过的译名再拼音化
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
