import {
  isQuoteAcceptable,
  needsQuoteLookup,
  needsQuoteTranslation,
  isChineseNativeForQuote,
  chineseNameToPinyinEnglish,
  effectiveQuoteOneLiner,
  deriveQuoteStatus,
  makeSkeletonCard
} from "../../packages/character-protocol/dist/index.js";

const mikasa =
  "この世界は残酷で、でもとても美しい。（这个世界很残酷，但也很美丽。）";
const violetJaOnly = "私は人間ではありません。人間らしくなりたいです。";
const zhang =
  "选择比努力更重要，但「有得选」的前提是你足够努力。";

let failed = 0;

function assert(label, cond) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    failed++;
  } else {
    console.log(`ok: ${label}`);
  }
}

assert("三笠双语格式有效", isQuoteAcceptable(mikasa, { chineseNative: false }));
assert("三笠无需补译", !needsQuoteTranslation(mikasa, { chineseNative: false }));
assert(
  "三笠已有有效座右铭可跳过检索",
  !needsQuoteLookup(mikasa, "fictional", { chineseNative: false })
);

assert("薇尔莉特纯日文无效", !isQuoteAcceptable(violetJaOnly, { chineseNative: false }));
assert("薇尔莉特需要补译", needsQuoteTranslation(violetJaOnly, { chineseNative: false }));
assert(
  "薇尔莉特纯日文需重新检索",
  needsQuoteLookup(violetJaOnly, "fictional", { chineseNative: false })
);

assert("张雪峰纯中文有效", isQuoteAcceptable(zhang, { chineseNative: true }));
assert("张雪峰无需补译", !needsQuoteTranslation(zhang, { chineseNative: true }));

assert(
  "骨架座右铭需重新检索",
  needsQuoteLookup("我还没准备好。", "public-figure", { chineseNative: false })
);

assert(
  "骨架占位不视为有效原话",
  effectiveQuoteOneLiner("我还没准备好。") === undefined
);

const skeleton = makeSkeletonCard({
  id: "skel",
  name: "测试",
  sourceType: "public-figure",
  track: "companion",
  now: 0
});
assert("骨架卡无占位 quoteOneLiner", skeleton.meta.quoteOneLiner === undefined);
assert("骨架卡 quoteStatus 为 missing", skeleton.meta.quoteStatus === "missing");
assert(
  "有自我介绍时失败态为 provisional",
  deriveQuoteStatus({
    signatureVocabulary: [],
    selfIntro: skeleton.identity.selfIntro
  }) === "provisional"
);

const kobePinyin = chineseNameToPinyinEnglish("科比布莱恩特");
assert(
  "科比误标拼音时座右铭应走外文格式",
  !isChineseNativeForQuote("科比布莱恩特", kobePinyin, kobePinyin, "public-figure")
);
assert(
  "张雪峰拼音英文名仍为中文母语座右铭",
  isChineseNativeForQuote("张雪峰", "Xuefeng Zhang", "Xuefeng Zhang", "public-figure")
);

if (failed > 0) {
  process.exit(1);
}
console.log("character-quote checks passed");
