/**
 * 角色名解析启发式单元测试（无 LLM）。
 * 运行：node scripts/verify/verify-character-names.mjs
 */
import {
  chineseNameToPinyinEnglish,
  isPinyinFallbackEnglish,
  looksLikeForeignTranslitWithoutDot,
  needsCharacterNameLookup,
  normalizeCharacterNames,
  normalizeChineseNameDots
} from "../../packages/character-protocol/dist/index.js";

let failed = 0;

function assert(label, cond) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    failed++;
  } else {
    console.log(`ok: ${label}`);
  }
}

const kobeRaw = normalizeCharacterNames({
  inputName: "科比布莱恩特",
  name: "科比布莱恩特"
});
assert("科比输入产生拼音英文", isPinyinFallbackEnglish(kobeRaw.chineseName, kobeRaw.englishName));
assert(
  "科比公众人物需联网 lookup",
  needsCharacterNameLookup(kobeRaw, "public-figure")
);
assert("科比无间隔号视为未规范化", looksLikeForeignTranslitWithoutDot("科比布莱恩特"));

const kobeCanonical = {
  chineseName: "科比·布莱恩特",
  englishName: "Kobe Bryant"
};
assert(
  "科比标准译名不需 lookup",
  !needsCharacterNameLookup(kobeCanonical, "public-figure")
);

const jay = { chineseName: "周杰伦", englishName: "Jay Chou" };
assert("周杰伦不需 lookup", !needsCharacterNameLookup(jay, "public-figure"));

assert(
  "・ 规范为 ·",
  normalizeChineseNameDots("科比・布莱恩特") === "科比·布莱恩特"
);

const pinyin = chineseNameToPinyinEnglish("科比布莱恩特");
assert("科比拼音非 Kobe Bryant", pinyin !== "Kobe Bryant");

if (failed > 0) {
  process.exit(1);
}
console.log("character-names checks passed");
