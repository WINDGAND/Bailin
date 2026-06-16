import {
  isQuoteAcceptable,
  needsQuoteLookup,
  needsQuoteTranslation
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

if (failed > 0) {
  process.exit(1);
}
console.log("character-quote checks passed");
