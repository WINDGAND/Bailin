#!/usr/bin/env node
/**
 * 回归检查：polishChromaMatte 对贴透明边缘的"过渡带"像素（真实抗锯齿混色像素）
 * 必须做渐变 alpha + 去溢色处理，而不是现在的二元判断（色距够近就整像素清零，
 * 否则完全不碰）。二元判断正是用户反馈"桌宠周围总有白边"的根因：
 *   - 色距在阈值内 → 整像素清零，边缘出现锯齿状缺口
 *   - 色距刚超出阈值 → 完全不处理，保留混入背景色的白边/绿边
 *
 * 不需要真实生图；用已知混合比例（straight-alpha over 公式）构造合成过渡像素，
 * 断言修复后的像素：
 *   1. 非常接近纯 chroma 的像素 → 依然整像素清零（不回归，行为和旧版一致）
 *   2. 处于"过渡带"的混色像素 → alpha 变成渐变值（不再是非 0 即 255），
 *      且恢复出的颜色应明显比原始观测颜色更接近真实前景色（去溢色生效）
 *   3. 远离 chroma 的纯前景像素 → 完全不变（不回归）
 *   4. 过渡带内，混合比例越高（越接近前景）的像素，恢复出的 alpha 应该越高（单调性）
 *
 * 跑法（先 build pet-atlas-tools）：
 *   pnpm --filter=@bailin/pet-atlas-tools run build
 *   node scripts/verify/verify-chroma-decontaminate.mjs
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const toolsPath = resolve(repoRoot, "packages/pet-atlas-tools/dist/index.cjs");

if (!existsSync(toolsPath)) {
  console.error(
    "[verify-chroma-decontaminate] 缺少 dist 产物；请先：\n" +
      "  pnpm --filter=@bailin/pet-atlas-tools run build"
  );
  process.exit(2);
}

const { blankImage, polishChromaMatte } = require(toolsPath);

let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}${detail ? " — " + detail : ""}`);
  }
}

/** 按 straight-alpha over 公式构造"观测到的混合颜色"：observed = alpha*fg + (1-alpha)*bg。 */
function blend(fg, bg, alpha) {
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha))
  };
}

function setPixel(img, x, y, r, g, b, a) {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

function getPixel(img, x, y) {
  const i = (y * img.width + x) * 4;
  return {
    r: img.data[i],
    g: img.data[i + 1],
    b: img.data[i + 2],
    a: img.data[i + 3]
  };
}

// ============================================================
// Case 1：白色 chroma —— B25/B50/B75/纯前景 混合链
// ============================================================
{
  const WHITE = { r: 255, g: 255, b: 255 };
  const ORANGE = { r: 255, g: 120, b: 40 };
  const width = 6;
  const height = 3;
  const img = blankImage(width, height);

  // row0 / row2：已经是透明背景（模拟 removeChromaBackgroundConnected 处理后的结果）
  for (let x = 0; x < width; x += 1) {
    setPixel(img, x, 0, 0, 0, 0, 0);
    setPixel(img, x, 2, 0, 0, 0, 0);
  }
  // row1：col0 透明续接；col1~col3 是已知混合比例的过渡像素；col4/col5 是纯前景
  setPixel(img, 0, 1, 0, 0, 0, 0);
  const b25 = blend(ORANGE, WHITE, 0.25);
  const b50 = blend(ORANGE, WHITE, 0.5);
  const b75 = blend(ORANGE, WHITE, 0.75);
  setPixel(img, 1, 1, b25.r, b25.g, b25.b, 255);
  setPixel(img, 2, 1, b50.r, b50.g, b50.b, 255);
  setPixel(img, 3, 1, b75.r, b75.g, b75.b, 255);
  setPixel(img, 4, 1, ORANGE.r, ORANGE.g, ORANGE.b, 255);
  setPixel(img, 5, 1, ORANGE.r, ORANGE.g, ORANGE.b, 255);

  const opts = {
    chromaKey: WHITE,
    seedThreshold: 30,
    spillThreshold: 40,
    edgeSpillThreshold: 38,
    greenSpill: false,
    maxInteriorChromaIsland: 0,
    interiorChromaThreshold: 30
  };

  const out = polishChromaMatte(img, opts);

  const p25 = getPixel(out, 1, 1);
  const p50 = getPixel(out, 2, 1);
  const p75 = getPixel(out, 3, 1);
  const pFg = getPixel(out, 4, 1);

  check(
    "B25 过渡像素：alpha 应是渐变值（既不是 0 也不是 255）",
    p25.a > 0 && p25.a < 255,
    `got a=${p25.a}`
  );
  // 注意：收紧默认上限（76，而非最初拍脑袋的 edge+100=138）是为了防止贴边
  // 纯色浅色前景（比如肤色）被误判成溢色带（见 Case 2.5）。副作用是过渡带变窄后，
  // 线性色距估计对"真实混合比例低、但前景本身饱和度高/离 chroma 远"这类像素
  // （本例：真实混合 25%，但纯橙色离白色色距高达 254）的颜色还原精度会变差——
  // 这里断言的是"公式确实按预期数学关系执行"（回归基线），不是"颜色被精确
  // 还原成真实前景色"，后者对线性估计公式而言本来就是不现实的期望。
  check(
    "B25 过渡像素：至少确实发生了去溢色（颜色应比原始观测值(221)更低，不是原样保留）",
    p25.g < 221,
    `got rgb=(${p25.r},${p25.g},${p25.b})`
  );
  check(
    "B25 过渡像素：按公式计算的颜色还原值应落在预期范围内（回归基线，容差 ±3）",
    Math.abs(p25.g - 205) <= 3 && Math.abs(p25.b - 176) <= 3,
    `got rgb=(${p25.r},${p25.g},${p25.b})`
  );
  check(
    "B50 过渡像素：alpha 应比 B25 更高（离 chroma 更远，单调性；本例色距已超出处理区间，视为满 alpha）",
    p50.a > p25.a,
    `got a25=${p25.a} a50=${p50.a}`
  );
  // 收紧默认上限后（76，见 Case 2.5 的说明），色距 126 的 B50 已经落在处理区间
  // 之外，和 B75、纯前景一样被判定为"确定的前景"，保持原样不变——这条不是在
  // 测去溢色效果，是确认收紧阈值后 B50 这个具体色距点确实退回到了"不处理"分支。
  check(
    "B50 过渡像素：色距超出收紧后的处理区间，保持原样不变",
    p50.r === b50.r && p50.g === b50.g && p50.b === b50.b && p50.a === 255,
    `got rgba=(${p50.r},${p50.g},${p50.b},${p50.a})`
  );
  check(
    "B75 过渡像素：色距已超出去溢色区间，应保持原样不变（不回归）",
    p75.r === b75.r && p75.g === b75.g && p75.b === b75.b && p75.a === 255,
    `got rgba=(${p75.r},${p75.g},${p75.b},${p75.a})`
  );
  check(
    "纯前景像素：完全不变（不回归）",
    pFg.r === ORANGE.r && pFg.g === ORANGE.g && pFg.b === ORANGE.b && pFg.a === 255,
    `got rgba=(${pFg.r},${pFg.g},${pFg.b},${pFg.a})`
  );
}

// ============================================================
// Case 2：非常接近纯 chroma 的像素 —— 依然整像素清零（不回归，行为和旧版一致）
// ============================================================
{
  const WHITE = { r: 255, g: 255, b: 255 };
  const width = 3;
  const height = 3;
  const img = blankImage(width, height);
  for (let x = 0; x < width; x += 1) {
    setPixel(img, x, 0, 0, 0, 0, 0);
    setPixel(img, x, 2, 0, 0, 0, 0);
  }
  setPixel(img, 0, 1, 0, 0, 0, 0);
  // 色距 = sqrt(3*10^2) ≈ 17.3，远小于 edgeSpillThreshold=38，应被整像素清零
  setPixel(img, 1, 1, 245, 245, 245, 255);
  setPixel(img, 2, 1, 245, 245, 245, 255);

  const opts = {
    chromaKey: WHITE,
    seedThreshold: 30,
    spillThreshold: 40,
    edgeSpillThreshold: 38,
    greenSpill: false,
    maxInteriorChromaIsland: 0,
    interiorChromaThreshold: 30
  };
  const out = polishChromaMatte(img, opts);
  const p = getPixel(out, 1, 1);
  check(
    "极接近 chroma 的像素：整像素清零（alpha=0, rgb=0）",
    p.r === 0 && p.g === 0 && p.b === 0 && p.a === 0,
    `got rgba=(${p.r},${p.g},${p.b},${p.a})`
  );
}

// ============================================================
// Case 2.5：贴边的纯色浅色前景（肤色）不应被误判成溢色过渡像素
//
// 这是代码审查发现的真实回归风险：肤色 #f3d3b1（本仓库 verify-hatch-pet.mjs
// 里用的同一个肤色）贴白色 chroma 背景时色距 ≈90.5——它不是抗锯齿过渡色，
// 就是一整块纯色的皮肤，恰好贴着透明轮廓边（比如手臂/脸颊轮廓）。
// 如果去溢色的处理区间设得太宽（比如 edgeThreshold+100 ≈138），会把这类
// 像素也当成"过渡带"处理，凭空产生新的半透明+变色缺陷——用消灭白边的手段
// 制造了肤色色斑，属于以毒攻毒。默认阈值（edgeThreshold×2=76）必须把它
// 排除在处理区间之外，保持原样不变。
// ============================================================
{
  const WHITE = { r: 255, g: 255, b: 255 };
  const SKIN = { r: 243, g: 211, b: 177 }; // #f3d3b1，同 verify-hatch-pet.mjs 用的肤色
  const width = 3;
  const height = 3;
  const img = blankImage(width, height);
  for (let x = 0; x < width; x += 1) {
    setPixel(img, x, 0, 0, 0, 0, 0);
    setPixel(img, x, 2, 0, 0, 0, 0);
  }
  setPixel(img, 0, 1, 0, 0, 0, 0);
  setPixel(img, 1, 1, SKIN.r, SKIN.g, SKIN.b, 255);
  setPixel(img, 2, 1, SKIN.r, SKIN.g, SKIN.b, 255);

  const opts = {
    chromaKey: WHITE,
    seedThreshold: 30,
    spillThreshold: 40,
    edgeSpillThreshold: 38,
    greenSpill: false,
    maxInteriorChromaIsland: 0,
    interiorChromaThreshold: 30
    // edgeDecontaminateThreshold 不传，用默认值 edgeThreshold×2=76
  };
  const out = polishChromaMatte(img, opts);
  const p = getPixel(out, 1, 1);
  check(
    "贴边肤色像素：默认阈值下不应被当成溢色过渡带处理，保持完全不变",
    p.r === SKIN.r && p.g === SKIN.g && p.b === SKIN.b && p.a === 255,
    `got rgba=(${p.r},${p.g},${p.b},${p.a})，色距≈${Math.round(
      Math.sqrt((SKIN.r - WHITE.r) ** 2 + (SKIN.g - WHITE.g) ** 2 + (SKIN.b - WHITE.b) ** 2)
    )}`
  );
}

// ============================================================
// Case 2.6：自定义 edgeDecontaminateThreshold 应生效（显式传参优先于默认值）
//
// 构造一个色距恰好落在"默认上限(76)之外、自定义上限(100)之内"的像素：
// 用默认阈值应保持不变，用自定义阈值应被去溢色——两次跑同一个像素，
// 结果必须不同，才能证明 `opts.edgeDecontaminateThreshold ?? edgeThreshold*2`
// 里显式传参分支真的被走到了，而不是默认值分支恰好也能覆盖到这个色距。
// ============================================================
{
  const WHITE = { r: 255, g: 255, b: 255 };
  const FG = { r: 255, g: 190, b: 90 };
  const mid = blend(FG, WHITE, 0.5); // 色距 ≈88，介于默认上限 76 和自定义上限 100 之间

  function buildImg() {
    const img = blankImage(3, 3);
    for (let x = 0; x < 3; x += 1) {
      setPixel(img, x, 0, 0, 0, 0, 0);
      setPixel(img, x, 2, 0, 0, 0, 0);
    }
    setPixel(img, 0, 1, 0, 0, 0, 0);
    setPixel(img, 1, 1, mid.r, mid.g, mid.b, 255);
    setPixel(img, 2, 1, mid.r, mid.g, mid.b, 255);
    return img;
  }

  const baseOpts = {
    chromaKey: WHITE,
    seedThreshold: 30,
    spillThreshold: 40,
    edgeSpillThreshold: 38,
    greenSpill: false,
    maxInteriorChromaIsland: 0,
    interiorChromaThreshold: 30
  };

  const outDefault = polishChromaMatte(buildImg(), baseOpts);
  const outCustom = polishChromaMatte(buildImg(), { ...baseOpts, edgeDecontaminateThreshold: 100 });
  const pDefault = getPixel(outDefault, 1, 1);
  const pCustom = getPixel(outCustom, 1, 1);

  check(
    "默认阈值(76)：色距≈88 的像素在处理区间之外，保持不变",
    pDefault.r === mid.r && pDefault.g === mid.g && pDefault.b === mid.b && pDefault.a === 255,
    `got rgba=(${pDefault.r},${pDefault.g},${pDefault.b},${pDefault.a})`
  );
  check(
    "自定义阈值(100)：同一个像素这次落入处理区间，被去溢色（alpha 变成渐变值）",
    pCustom.a > 0 && pCustom.a < 255,
    `got rgba=(${pCustom.r},${pCustom.g},${pCustom.b},${pCustom.a})`
  );
}

// ============================================================
// Case 2.7：alpha 恰好等于 MIN_DESPILL_ALPHA 边界——不应产生除零/NaN
// ============================================================
{
  const WHITE = { r: 255, g: 255, b: 255 };
  const edgeThreshold = 38;
  const decontaminateThreshold = 138; // 手动指定，方便精确构造边界色距
  // alpha = (dist - edge) / (ceil - edge) = MIN_DESPILL_ALPHA=0.06
  // => dist = edge + 0.06 * (ceil - edge) = 38 + 0.06*100 = 44
  const targetDist = edgeThreshold + 0.06 * (decontaminateThreshold - edgeThreshold);
  // 沿 r 轴构造一个到白色 chroma 距离恰好为 targetDist 的像素（其余通道保持满值）
  const r = clampByte(255 - targetDist);
  const img = blankImage(3, 3);
  for (let x = 0; x < 3; x += 1) {
    setPixel(img, x, 0, 0, 0, 0, 0);
    setPixel(img, x, 2, 0, 0, 0, 0);
  }
  setPixel(img, 0, 1, 0, 0, 0, 0);
  setPixel(img, 1, 1, r, 255, 255, 255);

  const opts = {
    chromaKey: WHITE,
    seedThreshold: 30,
    spillThreshold: 40,
    edgeSpillThreshold: edgeThreshold,
    edgeDecontaminateThreshold: decontaminateThreshold,
    greenSpill: false,
    maxInteriorChromaIsland: 0,
    interiorChromaThreshold: 30
  };
  const out = polishChromaMatte(img, opts);
  const p = getPixel(out, 1, 1);
  check(
    "alpha 极接近 MIN_DESPILL_ALPHA 边界：结果必须是有限数值，不能是 NaN/Infinity",
    Number.isFinite(p.r) && Number.isFinite(p.g) && Number.isFinite(p.b) && Number.isFinite(p.a),
    `got rgba=(${p.r},${p.g},${p.b},${p.a})`
  );
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ============================================================
// Case 3：绿色 chroma —— 验证阈值参数化正确（不是写死白色）
// ============================================================
{
  const GREEN = { r: 0, g: 255, b: 0 };
  const BLUE = { r: 40, g: 60, b: 220 };
  const width = 4;
  const height = 3;
  const img = blankImage(width, height);
  for (let x = 0; x < width; x += 1) {
    setPixel(img, x, 0, 0, 0, 0, 0);
    setPixel(img, x, 2, 0, 0, 0, 0);
  }
  setPixel(img, 0, 1, 0, 0, 0, 0);
  const g30 = blend(BLUE, GREEN, 0.3);
  setPixel(img, 1, 1, g30.r, g30.g, g30.b, 255);
  setPixel(img, 2, 1, BLUE.r, BLUE.g, BLUE.b, 255);
  setPixel(img, 3, 1, BLUE.r, BLUE.g, BLUE.b, 255);

  const opts = {
    chromaKey: GREEN,
    seedThreshold: 60,
    spillThreshold: 75,
    edgeSpillThreshold: 70,
    greenSpill: false,
    maxInteriorChromaIsland: 0,
    interiorChromaThreshold: 60
  };
  const out = polishChromaMatte(img, opts);
  const p30 = getPixel(out, 1, 1);
  const pBlue = getPixel(out, 2, 1);

  check(
    "绿幕过渡像素：alpha 应是渐变值（证明阈值按 opts 参数化，不是写死白色逻辑）",
    p30.a > 0 && p30.a < 255,
    `got a=${p30.a}`
  );
  check(
    "绿幕纯前景像素：完全不变（不回归）",
    pBlue.r === BLUE.r && pBlue.g === BLUE.g && pBlue.b === BLUE.b && pBlue.a === 255,
    `got rgba=(${pBlue.r},${pBlue.g},${pBlue.b},${pBlue.a})`
  );
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll chroma decontamination cases passed.`);
