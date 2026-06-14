import {
  SCHEMA_VERSION,
  type AppearanceSpec,
  type SpriteProgram,
  type SpriteDSL
} from "@nuwa-pet/character-protocol";
import { symbolForKeyword, type SymbolPattern } from "./sprite-symbols.js";

type AnimDef = NonNullable<SpriteDSL["animations"]["idle"]>;
import {
  baseAnimations,
  standardShadow,
  standardStateMachine,
  withFidgetVariants
} from "@nuwa-pet/starter-library";

/**
 * 程序化 sprite 生成器 v2（96×96 高精度版）。
 *
 * 设计目标：让 LLM 造的角色 sprite 与 starter 同档质量。
 *
 * 关键变体（根据 appearance 自动调节）：
 *   - 体型 build: slim / average / stocky / muscular / child → 头身比、躯干宽度
 *   - 脸型 faceShape: 包含"长"/"瓜子"→ 长脸；"圆"/"方"→ 圆脸；默认椭圆
 *   - 发型 hair.style: 包含"长发/马尾"→ 长发；"光头/秃"→ 光头；"卷"→ 卷发；默认短发
 *   - 服装 outfit.top: "西装"/"suit"→ 西装翻领；"球衣"/"jersey"→ V 领背心；"T 恤"→ 圆领
 *   - 配饰 accessories: 包含"眼镜/glasses"→ 加镜框；"领带"→ 加领带 part
 *   - 装备 gear: 各加一个腰侧挂件
 *   - 表情 expression: 包含"专注/锐利"→ 紧抿嘴 + 沉眉；"温和/笑"→ 笑容 + 眉毛上扬
 *
 * 不同的输入 → 不同的 parts / shapes / 调色板组合，绝不千篇一律。
 */

interface PaletteIndex {
  outline: number;
  shadowDark: number;
  skinHi: number;
  skin: number;
  skinMid: number;
  skinShade: number;
  hair: number;
  hairHi: number;
  hairShade: number;
  shirt: number;
  shirtHi: number;
  shirtShade: number;
  pants: number;
  shoe: number;
  accent: number;
  signature: number;
  // 以下三槽为新增，使用时通过 ensureSlot 取，越界时回退到 accent / signature。
  eye: number;
  cheek: number;
  signature2: number;
}

interface CharacterVariant {
  // 体型
  build: "slim" | "average" | "stocky" | "muscular" | "child";
  shoulderWidth: number; // body 宽度
  // v0.2 新增：性别与画风，驱动头身比 / 眼睛大小 / 服装模板选择
  gender: "female" | "male" | "androgynous" | "unknown";
  animeStyle: "realistic" | "anime-shoujo" | "anime-shounen" | "chibi";
  // 脸
  faceWidth: number;
  faceHeight: number;
  faceShape: "round" | "oval" | "long" | "square";
  // 发
  hairKind:
    | "short"
    | "long"
    | "bald"
    | "curly"
    | "ponytail"
    | "swept-back"
    | "twin-tail"
    | "bun";
  hairFront: "flat" | "messy" | "side-part" | "m-shape";
  // 上衣
  topKind:
    | "tee"
    | "suit"
    | "jersey"
    | "jacket"
    | "shirt"
    | "dress"
    | "military"
    | "sailor"
    | "kimono"
    | "coat";
  hasTie: boolean;
  // 装饰
  hasGlasses: boolean;
  hasSignatureLogo: boolean;
  hasSignatureNumber: boolean;
  signatureName?: string;
  /** 命中 symbol 库时使用的图案，渲染到胸前 / 颈部 / 头顶。 */
  signatureSymbol?: SymbolPattern;
  /** 命中符号库的关键词，决定 anchor 位置：胸前 / 颈部 / 头部 */
  signatureAnchor: "chest" | "neck" | "head";
  signatureColorIdx: number;
  // gear
  hasGear: boolean;
  gearCount: number;
  // 表情
  expression: "neutral" | "focused" | "smile" | "stern" | "gentle";
  // 长裤 vs 短裤 vs 长裙
  shortPants: boolean;
  hasSkirt: boolean;
  skirtLength: "short" | "knee" | "long";
  // 鞋
  shoeKind: "leather" | "sneaker" | "boot";
  // 新增：是否画腮红
  hasCheek: boolean;
  // 新增：眼睛尺寸（chibi 大、shoujo 中、realistic 小）
  eyeWidth: number;
  eyeHeight: number;
  pupilWidth: number;
  pupilHeight: number;
  hasEyeShine: boolean;
  // 头身比微调：相对原 96×96 中心，头部上下偏移
  headDy: number;
}

export function buildSpriteFromAppearance(appearance: AppearanceSpec): SpriteProgram {
  const variant = analyzeAppearance(appearance);
  const palette = buildPalette(appearance, variant);
  const idx = paletteIndex();

  const parts: SpriteDSL["parts"] = [];
  parts.push(standardShadow({ outlineIndex: idx.shadowDark }));
  parts.push(makeLegsPart(idx, variant));
  parts.push(makeBodyPart(idx, variant));
  parts.push(makeArmsPart(idx, variant));
  parts.push(makeNeckPart(idx, variant));
  parts.push(makeHeadPart(idx, variant));
  parts.push(makeHairPart(idx, variant));
  parts.push(makeBrowsPart(idx, variant));
  parts.push(makeEyesPart(idx, variant));
  parts.push(makeNosePart(idx, variant));
  parts.push(makeMouthPart(idx, variant));

  // 可选 parts
  if (variant.hasGlasses) parts.push(makeGlassesPart(idx));
  if (variant.hasTie) parts.push(makeTiePart(idx));
  if (
    variant.hasSignatureLogo ||
    variant.hasSignatureNumber ||
    variant.signatureSymbol
  ) {
    parts.push(makeSignaturePart(idx, variant));
  }
  if (variant.hasGear) {
    if (variant.gearCount >= 1) parts.push(makeGearPart(idx, "left"));
    if (variant.gearCount >= 2) parts.push(makeGearPart(idx, "right"));
  }

  const animations = {
    ...baseAnimations({
      bodyId: "body",
      headId: "head",
      eyesId: "eyes",
      mouthId: "mouth"
    }),
    // 通用 signature：抬手 + 头部抬高 + 嘴张
    signature: makeSignatureAnimation(variant),
    "fidget-a": makeFidgetA(),
    "fidget-b": makeFidgetB()
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "dsl",
    size: { width: 96, height: 96 },
    displayScale: 2,
    palette,
    dsl: {
      parts,
      animations,
      stateMachine: withFidgetVariants(standardStateMachine())
    }
  };
}

// =============================================================
// 1. 分析 appearance，决定该角色的"差异化变体"
// =============================================================

function analyzeAppearance(a: AppearanceSpec): CharacterVariant {
  const topName = a.outfit.top.name.toLowerCase();
  const bottomName = (a.outfit.bottom?.name ?? "").toLowerCase();
  const hairStyle = a.hair.style.toLowerCase();
  const faceStr = a.faceShape.toLowerCase();
  const eyeExpr = a.eyes.expression.toLowerCase();
  const facialFeats = (a.facialFeatures ?? []).map((x) => x.toLowerCase()).join(" ");
  const accessoryNames = (a.outfit.accessories ?? []).map((x) => x.name.toLowerCase());
  const accAll = accessoryNames.join(" ");
  const styleTokens = (a.styleTokens ?? []).map((t) => t.toLowerCase()).join(" ");

  const gender = a.gender ?? "unknown";
  const animeStyle = a.animeStyle ?? "realistic";
  const isChibi = animeStyle === "chibi" || a.ageBand === "child";
  const isShoujo = animeStyle === "anime-shoujo";
  const isShounen = animeStyle === "anime-shounen";
  const isFemale = gender === "female";

  // 体型
  const build = a.build;
  let shoulderWidth = 44;
  if (build === "muscular") shoulderWidth = 50;
  else if (build === "stocky") shoulderWidth = 48;
  else if (build === "slim") shoulderWidth = 40;
  else if (build === "child") shoulderWidth = 36;
  // 少女风：肩窄
  if (isFemale && !isChibi) shoulderWidth = Math.max(36, shoulderWidth - 4);
  // chibi：肩进一步缩小到 32
  if (isChibi) shoulderWidth = 32;

  // 脸 + 头身比
  let faceShape: CharacterVariant["faceShape"] = "oval";
  let faceWidth = 36;
  let faceHeight = 20;
  if (/长|long/.test(faceStr)) {
    faceShape = "long";
    faceWidth = 32;
    faceHeight = 22;
  } else if (/圆|round/.test(faceStr)) {
    faceShape = "round";
    faceWidth = 40;
    faceHeight = 18;
  } else if (/方|square|国字/.test(faceStr)) {
    faceShape = "square";
    faceWidth = 36;
    faceHeight = 20;
  } else if (/瓜子/.test(faceStr)) {
    faceShape = "long";
    faceWidth = 34;
    faceHeight = 20;
  }
  // chibi：脸放大
  if (isChibi) {
    faceShape = "round";
    faceWidth = 48;
    faceHeight = 28;
  }
  // shoujo：脸略大、略圆润
  if (isShoujo && !isChibi) {
    faceWidth = Math.min(44, faceWidth + 4);
    faceHeight = Math.min(24, faceHeight + 2);
  }

  // 头身比微调：chibi 时头向上挪、身体下移
  const headDy = isChibi ? -4 : 0;

  // 眼睛尺寸：chibi 14×6、shoujo 12×5、shounen 10×3 锐利、realistic 8×3
  let eyeWidth = 8;
  let eyeHeight = 3;
  let pupilWidth = 3;
  let pupilHeight = 3;
  let hasEyeShine = false;
  if (isChibi) {
    eyeWidth = 12;
    eyeHeight = 7;
    pupilWidth = 6;
    pupilHeight = 6;
    hasEyeShine = true;
  } else if (isShoujo) {
    eyeWidth = 11;
    eyeHeight = 5;
    pupilWidth = 5;
    pupilHeight = 5;
    hasEyeShine = true;
  } else if (isShounen) {
    eyeWidth = 10;
    eyeHeight = 3;
    pupilWidth = 4;
    pupilHeight = 3;
    hasEyeShine = false;
  }

  const hasCheek = isChibi || isShoujo || /腮红|blush|cheek/.test(facialFeats);

  // 发型
  let hairKind: CharacterVariant["hairKind"] = "short";
  let hairFront: CharacterVariant["hairFront"] = "flat";
  if (/光头|秃|bald/.test(hairStyle)) {
    hairKind = "bald";
  } else if (/双马尾|twin ?tail|双辫|双绑/.test(hairStyle)) {
    hairKind = "twin-tail";
    hairFront = "side-part";
  } else if (/盘发|盘起|发髻|chignon|bun/.test(hairStyle)) {
    hairKind = "bun";
    hairFront = "side-part";
  } else if (/马尾|ponytail|束/.test(hairStyle)) {
    hairKind = "ponytail";
    hairFront = "messy";
  } else if (/长发|长直|长卷|long|齐肩|及腰|腰长/.test(hairStyle)) {
    hairKind = "long";
    hairFront = "side-part";
  } else if (/卷|curly|wave/.test(hairStyle)) {
    hairKind = "curly";
    hairFront = "messy";
  } else if (/梳背|swept|背头|油头/.test(hairStyle)) {
    hairKind = "swept-back";
    hairFront = "side-part";
  } else if (/凌乱|乱发|messy/.test(hairStyle)) {
    hairKind = "short";
    hairFront = "messy";
  }
  // 微秃 / 发际后退
  if (/秃|微秃|发际|hairline|receding/.test(hairStyle)) {
    hairFront = "m-shape";
  }
  // 性别默认：女性 + 没明确写短发 → 默认长发
  if (
    isFemale &&
    hairKind === "short" &&
    !/短发|short|男孩|boyish/.test(hairStyle)
  ) {
    hairKind = "long";
    hairFront = "side-part";
  }

  // 上衣
  let topKind: CharacterVariant["topKind"] = "tee";
  if (/西装|suit\b/.test(topName)) topKind = "suit";
  else if (/军装|军服|制服外套|military|uniform.*coat|coat.*uniform/.test(topName))
    topKind = "military";
  else if (/水手服|sailor|jk|seifuku/.test(topName)) topKind = "sailor";
  else if (/和服|kimono|浴衣|yukata|长袍|robe/.test(topName)) topKind = "kimono";
  else if (/连衣裙|dress\b|裙装/.test(topName)) topKind = "dress";
  else if (/大衣|风衣|trench|long ?coat/.test(topName)) topKind = "coat";
  else if (/球衣|jersey|背心|tank/.test(topName)) topKind = "jersey";
  else if (/夹克|jacket|外衣|外套/.test(topName)) topKind = "jacket";
  else if (/衬衫|衬衣|shirt/.test(topName) && !/t-shirt|t恤|tee/.test(topName))
    topKind = "shirt";
  else if (/t.?shirt|t.?恤|tee/.test(topName)) topKind = "tee";

  // 裙装识别
  const hasSkirt =
    topKind === "dress" ||
    topKind === "sailor" ||
    topKind === "kimono" ||
    /长裙|短裙|skirt|裙/.test(bottomName);
  let skirtLength: CharacterVariant["skirtLength"] = "knee";
  if (hasSkirt) {
    if (/长裙|long ?skirt|maxi|及踝|及地/.test(topName + " " + bottomName)) {
      skirtLength = "long";
    } else if (/短裙|mini ?skirt|超短/.test(topName + " " + bottomName)) {
      skirtLength = "short";
    } else if (topKind === "kimono" || topKind === "dress") {
      skirtLength = "long";
    } else {
      skirtLength = "knee";
    }
  }

  // 配饰
  const hasGlasses = /眼镜|glasses|frame/.test(accAll + " " + facialFeats);
  const hasTie =
    /领带|tie\b|necktie/.test(accAll) ||
    (topKind === "suit" && /领带/.test(topName)) ||
    topKind === "sailor"; // 水手服默认带领结
  const hasBowTie = /蝴蝶结|bow ?tie|领结/.test(accAll);

  // signature
  const sigAcc = (a.outfit.accessories ?? []).find((x) => x.signature);
  let hasSignatureLogo = false;
  let hasSignatureNumber = false;
  let signatureName: string | undefined;
  let signatureSymbol: SymbolPattern | undefined;
  let signatureAnchor: CharacterVariant["signatureAnchor"] = "chest";
  if (sigAcc) {
    signatureName = sigAcc.name;
    const sym = symbolForKeyword(sigAcc.name + " " + (sigAcc.placement ?? ""));
    if (sym) {
      signatureSymbol = sym;
      const placement = (sigAcc.placement ?? "").toLowerCase();
      if (/颈|领|throat|neck|collar/.test(placement)) signatureAnchor = "neck";
      else if (/头|发|head|hair|hat/.test(placement)) signatureAnchor = "head";
      else signatureAnchor = "chest";
    } else if (/号|number|#/.test(sigAcc.name) || /\d/.test(sigAcc.name)) {
      hasSignatureNumber = true;
    } else if (/logo|徽|章|emblem|印|brand/.test(sigAcc.name)) {
      hasSignatureLogo = true;
    } else if (topKind === "jersey") {
      hasSignatureNumber = true;
    } else if (topKind === "tee") {
      hasSignatureLogo = true;
    }
  }
  // 蝴蝶结显式 signature
  if (hasBowTie && !signatureSymbol) {
    signatureSymbol = symbolForKeyword("蝴蝶结") ?? undefined;
    signatureAnchor = "neck";
  }

  // gear
  const gearCount = Math.min((a.gear ?? []).length, 2);
  const hasGear = gearCount > 0;

  // 短裤 vs 长裤
  const shortPants =
    topKind === "jersey" ||
    /短裤|shorts/.test(bottomName) ||
    /球员|运动|篮球|jersey/.test(styleTokens);

  // 鞋
  let shoeKind: CharacterVariant["shoeKind"] = "sneaker";
  const shoeName = (a.outfit.footwear?.name ?? "").toLowerCase();
  if (/皮鞋|leather|dress shoe|formal/.test(shoeName)) shoeKind = "leather";
  else if (/靴|boot/.test(shoeName)) shoeKind = "boot";
  else if (topKind === "suit") shoeKind = "leather";
  else if (topKind === "military" || topKind === "dress") shoeKind = "boot";

  // 表情
  let expression: CharacterVariant["expression"] = "neutral";
  if (/锐利|犀利|专注|focused|sharp|intense|严肃|stern/.test(eyeExpr)) {
    expression = "focused";
  } else if (/温和|笑|smile|gentle|warm|友好|friendly|空灵/.test(eyeExpr)) {
    expression = isFemale || isShoujo ? "gentle" : "smile";
  } else if (/坚定|决意|determined|grim/.test(eyeExpr)) {
    expression = "stern";
  }

  return {
    build,
    shoulderWidth,
    gender,
    animeStyle,
    faceShape,
    faceWidth,
    faceHeight,
    hairKind,
    hairFront,
    topKind,
    hasTie,
    hasGlasses,
    hasSignatureLogo,
    hasSignatureNumber,
    signatureName,
    signatureSymbol,
    signatureAnchor,
    signatureColorIdx: 0,
    hasGear,
    gearCount,
    expression,
    shortPants,
    hasSkirt,
    skirtLength,
    shoeKind,
    hasCheek,
    eyeWidth,
    eyeHeight,
    pupilWidth,
    pupilHeight,
    hasEyeShine,
    headDy
  };
}

// =============================================================
// 2. Palette 推导
// =============================================================

function buildPalette(
  a: AppearanceSpec,
  variant: CharacterVariant
): SpriteProgram["palette"] {
  const role = new Map<string, string>();
  for (const p of a.palette) {
    if (!role.has(p.role)) role.set(p.role, p.hex);
  }

  const skin = role.get("skin") ?? a.skinTone.hex;
  const hair = role.get("hair") ?? a.hair.color.hex;
  const shirt = role.get("shirt") ?? a.outfit.top.color.hex;
  const pants =
    role.get("pants") ?? a.outfit.bottom?.color.hex ?? darken(shirt, 0.15);
  const shoe = a.outfit.footwear?.color.hex ?? darken(pants, 0.35);
  const accent = role.get("accent") ?? "#d99a3a";
  const sigHex =
    role.get("signature") ??
    a.outfit.accessories.find((x) => x.signature)?.color.hex ??
    accent;
  // v0.2 新增 3 槽（眼色 / 腮红 / signature2）
  const eyeHex = role.get("eye") ?? a.eyes.color.hex ?? "#1a1a1a";
  const cheekHex = role.get("cheek") ?? lighten("#ff8aaa", 0.0);
  const sig2Hex = role.get("signature2") ?? lighten(sigHex, 0.3);

  // 16 槽：把扩展槽放在前 16 位之内，并把不常用的 shirtHi/shirtShade 之一让位（保留全部 16 个槽
  // schema 上限 16，因此必须严格 16 项；如果有的话，最后 3 项放新角色色，否则放占位的 shadow/accent 副色）
  const slots = [
    { name: "outline", hex: "#0a0a0a" },
    { name: "shadowDark", hex: "#000000" },
    { name: "skinHi", hex: lighten(skin, 0.12) },
    { name: "skin", hex: skin },
    { name: "skinMid", hex: darken(skin, 0.12) },
    { name: "skinShade", hex: darken(skin, 0.28) },
    { name: "hair", hex: hair },
    { name: "hairHi", hex: lighten(hair, 0.15) },
    { name: "hairShade", hex: darken(hair, 0.2) },
    { name: "shirt", hex: shirt },
    { name: "shirtShade", hex: darken(shirt, 0.2) },
    { name: "pants", hex: pants },
    { name: "shoe", hex: shoe },
    { name: "accent", hex: accent },
    { name: "signature", hex: sigHex },
    { name: "eye", hex: eyeHex }
  ];
  // 把 cheek / signature2 / shirtHi 通过 paletteIndex 复用其它槽（最多 16）
  // 设计选择：cheek 复用 accent（在 chibi 风格下 cheek 常和 accent 配色一致）；
  // signature2 复用 hairHi；shirtHi 复用 skinHi。
  // 若用户的 cheek 配色明确（hex 非默认），调高频度时可考虑 sacrificing 别的槽，
  // 但当前为简单起见全部 16 槽固定。
  void variant;
  void cheekHex;
  void sig2Hex;

  return slots;
}

function paletteIndex(): PaletteIndex {
  return {
    outline: 0,
    shadowDark: 1,
    skinHi: 2, // 同时被复用为 shirtHi
    skin: 3,
    skinMid: 4,
    skinShade: 5,
    hair: 6,
    hairHi: 7, // 同时被复用为 signature2
    hairShade: 8,
    shirt: 9,
    shirtHi: 2, // 复用 skinHi 做衣服高光（颜色相近时差距不明显）
    shirtShade: 10,
    pants: 11,
    shoe: 12,
    accent: 13,
    signature: 14,
    eye: 15,
    cheek: 13, // 复用 accent
    signature2: 7 // 复用 hairHi
  };
}

// =============================================================
// 3. 各 part 生成
// =============================================================

function makeLegsPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  // 裙装：上方画喇叭裙摆（替代裤管），下方画细腿 + 鞋
  if (v.hasSkirt) {
    const skirtTop = 58;
    const skirtBottom =
      v.skirtLength === "long" ? 84 : v.skirtLength === "knee" ? 76 : 68;
    // 用三段宽度模拟喇叭：上窄、中宽、下更宽
    const halfShoulder = Math.floor(v.shoulderWidth / 2);
    shapes.push(
      // 顶层（贴身）
      { type: "rect", x: 48 - halfShoulder, y: skirtTop, w: v.shoulderWidth, h: 4, paletteIndex: idx.shirtShade },
      // 中段裙身（用 shirt 主色 + accent 装饰边）
      { type: "rect", x: 48 - halfShoulder - 2, y: skirtTop + 4, w: v.shoulderWidth + 4, h: Math.max(4, skirtBottom - skirtTop - 8), paletteIndex: idx.shirt },
      // 底沿（更宽 + accent 描边）
      { type: "rect", x: 48 - halfShoulder - 4, y: skirtBottom - 4, w: v.shoulderWidth + 8, h: 3, paletteIndex: idx.shirt },
      { type: "rect", x: 48 - halfShoulder - 4, y: skirtBottom - 1, w: v.shoulderWidth + 8, h: 1, paletteIndex: idx.accent },
      // 纵向褶皱
      { type: "rect", x: 42, y: skirtTop + 4, w: 1, h: skirtBottom - skirtTop - 5, paletteIndex: idx.shirtShade },
      { type: "rect", x: 48, y: skirtTop + 4, w: 1, h: skirtBottom - skirtTop - 5, paletteIndex: idx.shirtShade },
      { type: "rect", x: 54, y: skirtTop + 4, w: 1, h: skirtBottom - skirtTop - 5, paletteIndex: idx.shirtShade }
    );

    // 腿（短裙 / knee 才画；长裙完全盖住）
    if (v.skirtLength !== "long") {
      const legY = skirtBottom;
      shapes.push(
        { type: "rect", x: 42, y: legY, w: 5, h: 84 - legY, paletteIndex: idx.skin },
        { type: "rect", x: 49, y: legY, w: 5, h: 84 - legY, paletteIndex: idx.skin },
        { type: "rect", x: 42, y: legY, w: 1, h: 84 - legY, paletteIndex: idx.skinMid },
        { type: "rect", x: 49, y: legY, w: 1, h: 84 - legY, paletteIndex: idx.skinMid }
      );
    }

    // 鞋 / 靴
    const shoeY = 82;
    const shoeColor = v.shoeKind === "leather" ? idx.outline : idx.shoe;
    shapes.push(
      { type: "rect", x: 40, y: shoeY, w: 8, h: 4, paletteIndex: shoeColor },
      { type: "rect", x: 48, y: shoeY, w: 8, h: 4, paletteIndex: shoeColor },
      { type: "rect", x: 40, y: shoeY + 3, w: 8, h: 1, paletteIndex: idx.outline },
      { type: "rect", x: 48, y: shoeY + 3, w: 8, h: 1, paletteIndex: idx.outline }
    );
    // 长靴：往上延伸（military / boot）
    if (v.shoeKind === "boot") {
      const bootTop = v.skirtLength === "long" ? shoeY - 1 : shoeY - 6;
      shapes.push(
        { type: "rect", x: 42, y: bootTop, w: 5, h: shoeY - bootTop, paletteIndex: idx.shoe },
        { type: "rect", x: 49, y: bootTop, w: 5, h: shoeY - bootTop, paletteIndex: idx.shoe }
      );
    }
    return { id: "legs", z: 0, shapes };
  }

  const pantTop = 60;
  const pantBottom = v.shortPants ? 74 : 84;
  const legWidth = v.build === "muscular" ? 14 : 12;
  const leftX = 48 - legWidth - 4;
  const rightX = 48 + 4;

  // 裤管
  shapes.push(
    { type: "rect", x: leftX, y: pantTop, w: legWidth, h: pantBottom - pantTop, paletteIndex: idx.pants },
    { type: "rect", x: rightX, y: pantTop, w: legWidth, h: pantBottom - pantTop, paletteIndex: idx.pants },
    // 裤侧暗
    { type: "rect", x: leftX, y: pantTop, w: 2, h: pantBottom - pantTop, paletteIndex: idx.shirtShade },
    { type: "rect", x: rightX + legWidth - 2, y: pantTop, w: 2, h: pantBottom - pantTop, paletteIndex: idx.shirtShade },
    // 中缝
    { type: "rect", x: leftX + legWidth - 2, y: pantTop, w: 2, h: pantBottom - pantTop, paletteIndex: idx.shirtShade },
    { type: "rect", x: rightX, y: pantTop, w: 2, h: pantBottom - pantTop, paletteIndex: idx.shirtShade }
  );

  // 短裤露小腿
  if (v.shortPants) {
    shapes.push(
      { type: "rect", x: leftX + 1, y: pantBottom, w: legWidth - 2, h: 6, paletteIndex: idx.skin },
      { type: "rect", x: rightX + 1, y: pantBottom, w: legWidth - 2, h: 6, paletteIndex: idx.skin },
      // 小腿肌肉暗
      { type: "rect", x: leftX + 1, y: pantBottom, w: 2, h: 6, paletteIndex: idx.skinMid },
      { type: "rect", x: rightX + 1, y: pantBottom, w: 2, h: 6, paletteIndex: idx.skinMid }
    );
  }

  // 鞋
  const shoeY = v.shortPants ? 80 : 84;
  const shoeH = 5;
  const shoeColor = v.shoeKind === "leather" ? idx.outline : idx.shoe;
  shapes.push(
    { type: "rect", x: leftX - 2, y: shoeY, w: legWidth + 4, h: shoeH, paletteIndex: shoeColor },
    { type: "rect", x: rightX - 2, y: shoeY, w: legWidth + 4, h: shoeH, paletteIndex: shoeColor },
    // 鞋底
    { type: "rect", x: leftX - 2, y: shoeY + shoeH - 1, w: legWidth + 4, h: 1, paletteIndex: idx.outline },
    { type: "rect", x: rightX - 2, y: shoeY + shoeH - 1, w: legWidth + 4, h: 1, paletteIndex: idx.outline }
  );

  // 球鞋加配色条
  if (v.shoeKind === "sneaker") {
    shapes.push(
      { type: "rect", x: leftX - 2, y: shoeY + 1, w: legWidth + 4, h: 1, paletteIndex: idx.accent },
      { type: "rect", x: rightX - 2, y: shoeY + 1, w: legWidth + 4, h: 1, paletteIndex: idx.accent }
    );
  }

  return { id: "legs", z: 0, shapes };
}

function makeBodyPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const half = Math.floor(v.shoulderWidth / 2);
  const bx = 48 - half;
  const bw = v.shoulderWidth;
  const by = 38;
  const bh = 24;
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  shapes.push(
    { type: "rect", x: bx, y: by, w: bw, h: bh, paletteIndex: idx.shirt },
    // 侧暗
    { type: "rect", x: bx, y: by + 2, w: 3, h: bh - 4, paletteIndex: idx.shirtShade },
    { type: "rect", x: bx + bw - 3, y: by + 2, w: 3, h: bh - 4, paletteIndex: idx.shirtShade },
    // 底暗
    { type: "rect", x: bx, y: by + bh - 2, w: bw, h: 2, paletteIndex: idx.shirtShade },
    // 高光
    { type: "rect", x: bx + 4, y: by + 4, w: 1, h: bh - 8, paletteIndex: idx.shirtHi },
    { type: "rect", x: bx + bw - 5, y: by + 4, w: 1, h: bh - 8, paletteIndex: idx.shirtHi },
    // 上沿描边
    { type: "rect", x: bx, y: by, w: bw, h: 1, paletteIndex: idx.outline }
  );

  // 不同领口
  if (v.topKind === "military") {
    // 军装：立领 + 双排扣 + 肩章
    shapes.push(
      // 立领
      { type: "rect", x: 40, y: by, w: 16, h: 5, paletteIndex: idx.shirtShade },
      { type: "rect", x: 40, y: by + 5, w: 16, h: 1, paletteIndex: idx.outline },
      // 白色高领装饰（颈下三角）
      { type: "rect", x: 42, y: by + 2, w: 12, h: 4, paletteIndex: idx.skinHi },
      // 肩章
      { type: "rect", x: bx, y: by, w: 6, h: 3, paletteIndex: idx.accent },
      { type: "rect", x: bx + bw - 6, y: by, w: 6, h: 3, paletteIndex: idx.accent },
      // 双排扣（4 颗，左右各一列）
      { type: "rect", x: 42, y: by + 8, w: 1, h: 1, paletteIndex: idx.accent },
      { type: "rect", x: 42, y: by + 12, w: 1, h: 1, paletteIndex: idx.accent },
      { type: "rect", x: 42, y: by + 16, w: 1, h: 1, paletteIndex: idx.accent },
      { type: "rect", x: 53, y: by + 8, w: 1, h: 1, paletteIndex: idx.accent },
      { type: "rect", x: 53, y: by + 12, w: 1, h: 1, paletteIndex: idx.accent },
      { type: "rect", x: 53, y: by + 16, w: 1, h: 1, paletteIndex: idx.accent }
    );
  } else if (v.topKind === "dress") {
    // 连衣裙：圆领 + 中央装饰带
    shapes.push(
      { type: "rect", x: 40, y: by, w: 16, h: 4, paletteIndex: idx.skin },
      { type: "rect", x: 40, y: by, w: 16, h: 1, paletteIndex: idx.skinMid },
      { type: "rect", x: 40, y: by + 4, w: 16, h: 1, paletteIndex: idx.outline },
      // 中央装饰带（accent）
      { type: "rect", x: 47, y: by + 4, w: 2, h: 18, paletteIndex: idx.accent }
    );
  } else if (v.topKind === "sailor") {
    // 水手服：宽大领（深蓝白条）
    shapes.push(
      // 后领（梯形覆盖肩部）
      { type: "rect", x: bx + 2, y: by, w: bw - 4, h: 6, paletteIndex: idx.shirtShade },
      { type: "rect", x: bx + 4, y: by + 6, w: bw - 8, h: 2, paletteIndex: idx.shirtShade },
      // 白条
      { type: "rect", x: bx + 3, y: by + 4, w: bw - 6, h: 1, paletteIndex: idx.skinHi },
      // V 领
      { type: "rect", x: 44, y: by, w: 8, h: 6, paletteIndex: idx.skin }
    );
  } else if (v.topKind === "kimono") {
    // 和服 / 长袍：大开襟 + 腰带
    shapes.push(
      // 左襟
      { type: "rect", x: bx, y: by, w: Math.floor(bw / 2), h: bh, paletteIndex: idx.shirt },
      // 右襟（颜色略深）
      { type: "rect", x: 48, y: by, w: Math.ceil(bw / 2), h: bh, paletteIndex: idx.shirtShade },
      // 颈口
      { type: "rect", x: 42, y: by, w: 12, h: 4, paletteIndex: idx.skinHi },
      { type: "rect", x: 42, y: by + 4, w: 12, h: 1, paletteIndex: idx.outline },
      // 腰带
      { type: "rect", x: bx, y: by + bh - 6, w: bw, h: 4, paletteIndex: idx.accent }
    );
  } else if (v.topKind === "coat") {
    // 大衣：长款 + 翻领 + 中线纽扣
    shapes.push(
      { type: "rect", x: 38, y: by, w: 8, h: 12, paletteIndex: idx.shirtShade },
      { type: "rect", x: 50, y: by, w: 8, h: 12, paletteIndex: idx.shirtShade },
      { type: "rect", x: 47, y: by, w: 2, h: bh, paletteIndex: idx.shirtShade },
      { type: "rect", x: 47, y: by + 8, w: 1, h: 1, paletteIndex: idx.accent },
      { type: "rect", x: 47, y: by + 14, w: 1, h: 1, paletteIndex: idx.accent }
    );
  } else if (v.topKind === "suit" || v.topKind === "jacket") {
    // 西装：白衬衫 V + 双翻领
    shapes.push(
      { type: "rect", x: 38, y: by, w: 20, h: 14, paletteIndex: idx.skinHi },
      { type: "rect", x: 38, y: by, w: 20, h: 1, paletteIndex: idx.skinMid },
      { type: "rect", x: 30, y: by, w: 8, h: 14, paletteIndex: idx.shirtShade },
      { type: "rect", x: 58, y: by, w: 8, h: 14, paletteIndex: idx.shirtShade },
      { type: "rect", x: 29, y: by + 1, w: 1, h: 12, paletteIndex: idx.outline },
      { type: "rect", x: 66, y: by + 1, w: 1, h: 12, paletteIndex: idx.outline }
    );
  } else if (v.topKind === "jersey") {
    // 背心 V 领 + 露肩
    shapes.push(
      { type: "rect", x: 40, y: by, w: 16, h: 12, paletteIndex: idx.skin },
      { type: "rect", x: 40, y: by, w: 16, h: 2, paletteIndex: idx.skinMid },
      { type: "rect", x: 39, y: by, w: 1, h: 12, paletteIndex: idx.outline },
      { type: "rect", x: 56, y: by, w: 1, h: 12, paletteIndex: idx.outline },
      // 肩袖镂空
      { type: "rect", x: bx, y: by, w: 8, h: 6, paletteIndex: idx.skin },
      { type: "rect", x: bx + bw - 8, y: by, w: 8, h: 6, paletteIndex: idx.skin },
      { type: "rect", x: bx, y: by, w: 8, h: 1, paletteIndex: idx.skinMid },
      { type: "rect", x: bx + bw - 8, y: by, w: 8, h: 1, paletteIndex: idx.skinMid }
    );
  } else if (v.topKind === "shirt") {
    // 衬衫开领 + 纽扣
    shapes.push(
      { type: "rect", x: 44, y: by, w: 8, h: 16, paletteIndex: idx.outline }, // 衣襟开口
      { type: "rect", x: 46, y: by + 4, w: 2, h: 1, paletteIndex: idx.shirt }, // 纽扣
      { type: "rect", x: 46, y: by + 8, w: 2, h: 1, paletteIndex: idx.shirt },
      { type: "rect", x: 46, y: by + 12, w: 2, h: 1, paletteIndex: idx.shirt },
      // 领子
      { type: "rect", x: 42, y: by, w: 4, h: 4, paletteIndex: idx.shirtShade },
      { type: "rect", x: 50, y: by, w: 4, h: 4, paletteIndex: idx.shirtShade }
    );
  } else {
    // 圆领 T 恤
    shapes.push(
      { type: "rect", x: 42, y: by, w: 12, h: 4, paletteIndex: idx.skin },
      { type: "rect", x: 42, y: by, w: 12, h: 1, paletteIndex: idx.skinMid },
      { type: "rect", x: 42, y: by + 4, w: 12, h: 1, paletteIndex: idx.outline }
    );
  }

  return { id: "body", z: 1, shapes };
}

function makeArmsPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const half = Math.floor(v.shoulderWidth / 2);
  const leftAX = 48 - half - 6;
  const rightAX = 48 + half - 1;
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  // 衣袖（西装 / 衬衫 / T 恤）部分
  const sleeveColor =
    v.topKind === "jersey" ? idx.skin : idx.shirt;
  const sleeveShade =
    v.topKind === "jersey" ? idx.skinMid : idx.shirtShade;
  const sleeveLen = v.topKind === "jersey" ? 4 : v.topKind === "suit" ? 20 : 12;

  // 左大臂
  shapes.push(
    { type: "rect", x: leftAX, y: 40, w: 7, h: sleeveLen, paletteIndex: sleeveColor },
    { type: "rect", x: leftAX, y: 40, w: 2, h: sleeveLen, paletteIndex: sleeveShade }
  );
  // 左前臂（露皮肤区段，球衣 + 短袖 T 都露）
  if (v.topKind !== "suit") {
    shapes.push(
      { type: "rect", x: leftAX, y: 40 + sleeveLen, w: 7, h: 22 - sleeveLen, paletteIndex: idx.skin },
      { type: "rect", x: leftAX, y: 40 + sleeveLen, w: 2, h: 22 - sleeveLen, paletteIndex: idx.skinMid }
    );
  }
  // 西装袖口（白衬衫露出）
  if (v.topKind === "suit") {
    shapes.push(
      { type: "rect", x: leftAX, y: 60, w: 7, h: 2, paletteIndex: idx.skinHi }
    );
  }
  // 左手
  shapes.push(
    { type: "rect", x: leftAX + 1, y: 62, w: 5, h: 6, paletteIndex: idx.skin },
    { type: "rect", x: leftAX + 1, y: 62, w: 1, h: 6, paletteIndex: idx.skinMid }
  );

  // 右大臂
  shapes.push(
    { type: "rect", x: rightAX, y: 40, w: 7, h: sleeveLen, paletteIndex: sleeveColor },
    { type: "rect", x: rightAX + 5, y: 40, w: 2, h: sleeveLen, paletteIndex: sleeveShade }
  );
  if (v.topKind !== "suit") {
    shapes.push(
      { type: "rect", x: rightAX, y: 40 + sleeveLen, w: 7, h: 22 - sleeveLen, paletteIndex: idx.skin },
      { type: "rect", x: rightAX + 5, y: 40 + sleeveLen, w: 2, h: 22 - sleeveLen, paletteIndex: idx.skinMid }
    );
  }
  if (v.topKind === "suit") {
    shapes.push(
      { type: "rect", x: rightAX, y: 60, w: 7, h: 2, paletteIndex: idx.skinHi }
    );
  }
  shapes.push(
    { type: "rect", x: rightAX + 1, y: 62, w: 5, h: 6, paletteIndex: idx.skin },
    { type: "rect", x: rightAX + 5, y: 62, w: 1, h: 6, paletteIndex: idx.skinMid }
  );

  return { id: "arms", z: 1, shapes };
}

function makeNeckPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const neckW = v.build === "muscular" ? 16 : v.build === "child" ? 10 : 12;
  const x = 48 - Math.floor(neckW / 2);
  return {
    id: "neck",
    z: 1,
    shapes: [
      { type: "rect", x, y: 33, w: neckW, h: 6, paletteIndex: idx.skin },
      { type: "rect", x, y: 36, w: neckW, h: 3, paletteIndex: idx.skinMid }
    ]
  };
}

function makeHeadPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const fw = v.faceWidth;
  const fh = v.faceHeight;
  const fx = 48 - Math.floor(fw / 2);
  const fy = 14;
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  // 颅顶
  shapes.push({ type: "rect", x: fx + 2, y: fy - 4, w: fw - 4, h: 4, paletteIndex: idx.skin });
  // 主体脸部
  shapes.push({ type: "rect", x: fx, y: fy, w: fw, h: fh, paletteIndex: idx.skin });
  // 侧暗
  shapes.push(
    { type: "rect", x: fx, y: fy + 2, w: 3, h: fh - 4, paletteIndex: idx.skinMid },
    { type: "rect", x: fx + fw - 3, y: fy + 2, w: 3, h: fh - 4, paletteIndex: idx.skinMid }
  );
  // 颧骨高光
  shapes.push(
    { type: "rect", x: fx + 5, y: fy + 8, w: 4, h: 3, paletteIndex: idx.skinHi },
    { type: "rect", x: fx + fw - 9, y: fy + 8, w: 4, h: 3, paletteIndex: idx.skinHi }
  );

  // 不同脸型不同下颌
  if (v.faceShape === "long") {
    // 长下颌延伸
    shapes.push(
      { type: "rect", x: fx + 4, y: fy + fh - 4, w: fw - 8, h: 3, paletteIndex: idx.skinMid },
      { type: "rect", x: fx + 6, y: fy + fh - 1, w: fw - 12, h: 2, paletteIndex: idx.skinShade }
    );
  } else if (v.faceShape === "round") {
    // 圆下颌
    shapes.push(
      { type: "rect", x: fx + 2, y: fy + fh - 3, w: fw - 4, h: 3, paletteIndex: idx.skinMid }
    );
  } else if (v.faceShape === "square") {
    // 方下颌（更宽 + 平）
    shapes.push(
      { type: "rect", x: fx, y: fy + fh - 4, w: fw, h: 4, paletteIndex: idx.skinMid },
      { type: "rect", x: fx + 2, y: fy + fh, w: fw - 4, h: 1, paletteIndex: idx.skinShade }
    );
  } else {
    // 椭圆
    shapes.push(
      { type: "rect", x: fx + 3, y: fy + fh - 3, w: fw - 6, h: 3, paletteIndex: idx.skinMid }
    );
  }

  // 描边
  shapes.push(
    { type: "rect", x: fx, y: fy, w: 1, h: fh, paletteIndex: idx.outline },
    { type: "rect", x: fx + fw - 1, y: fy, w: 1, h: fh, paletteIndex: idx.outline },
    { type: "rect", x: fx, y: fy, w: fw, h: 1, paletteIndex: idx.outline }
  );

  return { id: "head", z: 2, shapes };
}

function makeHairPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  if (v.hairKind === "bald") {
    return { id: "hair", z: 3, shapes: [] };
  }

  const fx = 48 - Math.floor(v.faceWidth / 2);
  const fw = v.faceWidth;
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  if (v.hairKind === "swept-back") {
    // 梳背
    shapes.push(
      { type: "rect", x: fx - 2, y: 2, w: fw + 4, h: 5, paletteIndex: idx.hair },
      { type: "rect", x: fx, y: 7, w: fw, h: 3, paletteIndex: idx.hair },
      // 高光梳痕
      { type: "rect", x: fx + 4, y: 3, w: fw - 8, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + 6, y: 5, w: fw - 12, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + 6, y: 8, w: fw - 12, h: 1, paletteIndex: idx.hairHi }
    );
  } else if (v.hairKind === "long") {
    // 长发
    shapes.push(
      { type: "rect", x: fx, y: 4, w: fw, h: 8, paletteIndex: idx.hair },
      // 侧鬓延长
      { type: "rect", x: fx - 2, y: 12, w: 4, h: 18, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw - 2, y: 12, w: 4, h: 18, paletteIndex: idx.hair },
      // 高光
      { type: "rect", x: fx + 4, y: 5, w: 6, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + fw - 10, y: 5, w: 6, h: 1, paletteIndex: idx.hairHi },
      // 暗部
      { type: "rect", x: fx - 2, y: 12, w: 1, h: 14, paletteIndex: idx.hairShade },
      { type: "rect", x: fx + fw + 1, y: 12, w: 1, h: 14, paletteIndex: idx.hairShade }
    );
  } else if (v.hairKind === "ponytail") {
    shapes.push(
      { type: "rect", x: fx, y: 4, w: fw, h: 8, paletteIndex: idx.hair },
      // 后脑马尾延出
      { type: "rect", x: fx - 2, y: 12, w: 3, h: 16, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw - 1, y: 12, w: 3, h: 16, paletteIndex: idx.hair },
      // 高光
      { type: "rect", x: fx + 4, y: 5, w: 8, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + fw - 12, y: 5, w: 8, h: 1, paletteIndex: idx.hairHi }
    );
  } else if (v.hairKind === "twin-tail") {
    // 双马尾：头顶 + 两侧长束
    shapes.push(
      { type: "rect", x: fx, y: 4, w: fw, h: 8, paletteIndex: idx.hair },
      // 顶部分缝
      { type: "rect", x: fx + Math.floor(fw / 2) - 1, y: 4, w: 2, h: 8, paletteIndex: idx.hairShade },
      // 左马尾
      { type: "rect", x: fx - 5, y: 12, w: 5, h: 22, paletteIndex: idx.hair },
      { type: "rect", x: fx - 6, y: 32, w: 4, h: 4, paletteIndex: idx.hair },
      // 右马尾
      { type: "rect", x: fx + fw, y: 12, w: 5, h: 22, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw + 2, y: 32, w: 4, h: 4, paletteIndex: idx.hair },
      // 高光
      { type: "rect", x: fx + 4, y: 5, w: 6, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + fw - 10, y: 5, w: 6, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx - 4, y: 14, w: 1, h: 16, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + fw + 1, y: 14, w: 1, h: 16, paletteIndex: idx.hairHi }
    );
  } else if (v.hairKind === "bun") {
    // 盘发：顶部圆形发髻
    shapes.push(
      { type: "rect", x: fx, y: 4, w: fw, h: 8, paletteIndex: idx.hair },
      // 头顶 bun
      { type: "rect", x: fx + Math.floor(fw / 2) - 4, y: -2, w: 8, h: 4, paletteIndex: idx.hair },
      { type: "rect", x: fx + Math.floor(fw / 2) - 5, y: 0, w: 10, h: 4, paletteIndex: idx.hair },
      { type: "rect", x: fx + Math.floor(fw / 2) - 4, y: 4, w: 8, h: 2, paletteIndex: idx.hairShade },
      // 侧鬓
      { type: "rect", x: fx, y: 11, w: 2, h: 8, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw - 2, y: 11, w: 2, h: 8, paletteIndex: idx.hair },
      // 高光
      { type: "rect", x: fx + Math.floor(fw / 2) - 2, y: 1, w: 4, h: 1, paletteIndex: idx.hairHi }
    );
  } else if (v.hairKind === "curly") {
    // 卷发：起伏的边缘
    shapes.push(
      { type: "rect", x: fx, y: 5, w: fw, h: 6, paletteIndex: idx.hair },
      // 上沿不规则
      { type: "rect", x: fx + 2, y: 3, w: 4, h: 2, paletteIndex: idx.hair },
      { type: "rect", x: fx + 8, y: 4, w: 4, h: 1, paletteIndex: idx.hair },
      { type: "rect", x: fx + 14, y: 3, w: 4, h: 2, paletteIndex: idx.hair },
      { type: "rect", x: fx + 20, y: 4, w: 4, h: 1, paletteIndex: idx.hair },
      { type: "rect", x: fx + 26, y: 3, w: 4, h: 2, paletteIndex: idx.hair },
      // 鬓角
      { type: "rect", x: fx, y: 11, w: 2, h: 6, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw - 2, y: 11, w: 2, h: 6, paletteIndex: idx.hair },
      // 高光
      { type: "rect", x: fx + 6, y: 6, w: 4, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + 16, y: 6, w: 4, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + 26, y: 6, w: 4, h: 1, paletteIndex: idx.hairHi }
    );
  } else {
    // short
    shapes.push(
      { type: "rect", x: fx, y: 6, w: fw, h: 6, paletteIndex: idx.hair },
      // 鬓角
      { type: "rect", x: fx, y: 12, w: 2, h: 6, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw - 2, y: 12, w: 2, h: 6, paletteIndex: idx.hair },
      // 高光
      { type: "rect", x: fx + 6, y: 7, w: 8, h: 1, paletteIndex: idx.hairHi },
      { type: "rect", x: fx + fw - 14, y: 7, w: 8, h: 1, paletteIndex: idx.hairHi }
    );
  }

  // 前额发际
  if (v.hairFront === "m-shape") {
    // M 型发际线
    shapes.push(
      { type: "rect", x: fx + 2, y: 12, w: 5, h: 2, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw - 7, y: 12, w: 5, h: 2, paletteIndex: idx.hair },
      { type: "rect", x: fx + 10, y: 12, w: fw - 20, h: 1, paletteIndex: idx.hairShade }
    );
  } else if (v.hairFront === "side-part") {
    shapes.push(
      { type: "rect", x: fx + 2, y: 12, w: fw - 8, h: 3, paletteIndex: idx.hair },
      { type: "rect", x: fx + 2, y: 14, w: 10, h: 2, paletteIndex: idx.hair }
    );
  } else if (v.hairFront === "messy") {
    // 凌乱碎发
    shapes.push(
      { type: "rect", x: fx + 2, y: 12, w: 6, h: 3, paletteIndex: idx.hair },
      { type: "rect", x: fx + 10, y: 12, w: 4, h: 2, paletteIndex: idx.hair },
      { type: "rect", x: fx + 16, y: 12, w: 5, h: 3, paletteIndex: idx.hair },
      { type: "rect", x: fx + 23, y: 12, w: 4, h: 2, paletteIndex: idx.hair },
      { type: "rect", x: fx + fw - 8, y: 12, w: 6, h: 3, paletteIndex: idx.hair }
    );
  } else {
    // 平直发际
    shapes.push({ type: "rect", x: fx + 2, y: 12, w: fw - 4, h: 2, paletteIndex: idx.hair });
  }

  // 头顶描边
  if (v.hairKind === "swept-back") {
    shapes.push({ type: "rect", x: fx - 2, y: 2, w: fw + 4, h: 1, paletteIndex: idx.outline });
  } else {
    shapes.push({ type: "rect", x: fx, y: 4, w: fw, h: 1, paletteIndex: idx.outline });
  }

  return { id: "hair", z: 3, shapes };
}

function makeBrowsPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const fx = 48 - Math.floor(v.faceWidth / 2);
  const fw = v.faceWidth;
  const browY = 18;
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  // 眉毛颜色（与头发同）
  const browColor = idx.hair;
  if (v.expression === "focused" || v.expression === "stern") {
    // 向下倾斜的浓眉
    shapes.push(
      { type: "rect", x: fx + 4, y: browY, w: 9, h: 2, paletteIndex: browColor },
      { type: "rect", x: fx + 10, y: browY - 1, w: 4, h: 1, paletteIndex: browColor },
      { type: "rect", x: fx + fw - 13, y: browY, w: 9, h: 2, paletteIndex: browColor },
      { type: "rect", x: fx + fw - 14, y: browY - 1, w: 4, h: 1, paletteIndex: browColor }
    );
  } else if (v.expression === "smile" || v.expression === "gentle") {
    // 上扬眉 / 温和细眉
    const thickness = v.expression === "gentle" ? 1 : 2;
    shapes.push(
      { type: "rect", x: fx + 4, y: browY, w: 9, h: thickness, paletteIndex: browColor },
      { type: "rect", x: fx + 4, y: browY - 1, w: 4, h: 1, paletteIndex: browColor },
      { type: "rect", x: fx + fw - 13, y: browY, w: 9, h: thickness, paletteIndex: browColor },
      { type: "rect", x: fx + fw - 8, y: browY - 1, w: 4, h: 1, paletteIndex: browColor }
    );
  } else {
    // 平直
    shapes.push(
      { type: "rect", x: fx + 4, y: browY, w: 9, h: 2, paletteIndex: browColor },
      { type: "rect", x: fx + fw - 13, y: browY, w: 9, h: 2, paletteIndex: browColor }
    );
  }

  return { id: "brows", z: 4, shapes };
}

function makeEyesPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const fx = 48 - Math.floor(v.faceWidth / 2);
  const fw = v.faceWidth;
  // chibi 风格眼睛要往下放（脸大，眼睛在下半部分更可爱），shoujo 略低、realistic 维持原位
  const baseY =
    v.animeStyle === "chibi" ? 26 : v.animeStyle === "anime-shoujo" ? 23 : 21;
  const eyeY = baseY + (v.expression === "smile" ? 0 : 0);
  const eyeW = v.eyeWidth;
  const eyeH = v.expression === "smile" ? Math.max(v.eyeHeight, 3) : v.eyeHeight;
  const pupilW = v.pupilWidth;
  const pupilH = Math.min(v.pupilHeight, eyeH);
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  // 边距：从脸左缘 5px 起，右侧对称
  const leftEyeX = fx + Math.max(4, Math.floor((fw - 2 * eyeW - 6) / 2));
  const rightEyeX = fx + fw - leftEyeX + fx - eyeW;
  const eyeXs = [leftEyeX, rightEyeX];

  for (const ex of eyeXs) {
    // 眼白
    shapes.push({
      type: "rect",
      x: ex,
      y: eyeY,
      w: eyeW,
      h: eyeH,
      paletteIndex: idx.skinHi
    });
    // 瞳（彩色）
    const pupilX = ex + Math.floor((eyeW - pupilW) / 2);
    shapes.push({
      type: "rect",
      x: pupilX,
      y: eyeY + Math.max(0, Math.floor((eyeH - pupilH) / 2)),
      w: pupilW,
      h: pupilH,
      paletteIndex: idx.eye
    });
    // 瞳孔暗心（小一圈），加强存在感
    if (pupilW >= 4) {
      shapes.push({
        type: "rect",
        x: pupilX + 1,
        y: eyeY + Math.max(0, Math.floor((eyeH - pupilH) / 2)) + 1,
        w: pupilW - 2,
        h: Math.max(1, pupilH - 2),
        paletteIndex: idx.outline
      });
    }
    // 高光反光
    if (v.hasEyeShine) {
      shapes.push({
        type: "rect",
        x: pupilX + 1,
        y: eyeY,
        w: Math.max(1, Math.floor(pupilW / 2)),
        h: 1,
        paletteIndex: idx.skinHi
      });
    }
    // 上眼睑
    shapes.push({
      type: "rect",
      x: ex,
      y: eyeY - 1,
      w: eyeW,
      h: 1,
      paletteIndex: idx.outline
    });
    // 下睫毛阴影
    shapes.push({
      type: "rect",
      x: ex,
      y: eyeY + eyeH,
      w: eyeW,
      h: 1,
      paletteIndex: idx.skinShade
    });
  }

  // 腮红（chibi / shoujo / 显式标 blush）
  if (v.hasCheek) {
    const cheekY = eyeY + eyeH + 2;
    shapes.push(
      { type: "rect", x: leftEyeX - 1, y: cheekY, w: 4, h: 2, paletteIndex: idx.cheek },
      { type: "rect", x: rightEyeX + eyeW - 3, y: cheekY, w: 4, h: 2, paletteIndex: idx.cheek }
    );
  }

  return { id: "eyes", z: 4, shapes };
}

function makeNosePart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  // 不同脸型不同鼻子高度
  const noseH = v.faceShape === "long" ? 7 : 6;
  return {
    id: "nose",
    z: 4,
    shapes: [
      { type: "rect", x: 46, y: 22, w: 4, h: noseH, paletteIndex: idx.skinMid },
      { type: "rect", x: 46, y: 22 + noseH - 2, w: 4, h: 2, paletteIndex: idx.skinShade },
      { type: "rect", x: 47, y: 24, w: 2, h: noseH - 4, paletteIndex: idx.skinHi }
    ]
  };
}

function makeMouthPart(idx: PaletteIndex, v: CharacterVariant): SpriteDSL["parts"][number] {
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];
  // chibi / shoujo 嘴位置略低
  const my =
    v.animeStyle === "chibi" ? 34 : v.animeStyle === "anime-shoujo" ? 32 : 30;
  if (v.expression === "smile") {
    shapes.push(
      { type: "rect", x: 40, y: my, w: 16, h: 2, paletteIndex: idx.outline },
      { type: "rect", x: 39, y: my + 1, w: 2, h: 1, paletteIndex: idx.outline },
      { type: "rect", x: 55, y: my + 1, w: 2, h: 1, paletteIndex: idx.outline },
      { type: "rect", x: 42, y: my + 1, w: 12, h: 1, paletteIndex: idx.skinHi }
    );
  } else if (v.expression === "gentle") {
    // 温和小弧度（少女漫常用）
    shapes.push(
      { type: "rect", x: 44, y: my, w: 8, h: 1, paletteIndex: idx.outline },
      { type: "rect", x: 43, y: my + 1, w: 1, h: 1, paletteIndex: idx.outline },
      { type: "rect", x: 52, y: my + 1, w: 1, h: 1, paletteIndex: idx.outline }
    );
  } else if (v.expression === "stern" || v.expression === "focused") {
    shapes.push(
      { type: "rect", x: 42, y: my, w: 12, h: 1, paletteIndex: idx.outline },
      { type: "rect", x: 44, y: my + 1, w: 8, h: 1, paletteIndex: idx.skinShade }
    );
  } else {
    shapes.push(
      { type: "rect", x: 43, y: my, w: 10, h: 1, paletteIndex: idx.outline },
      { type: "rect", x: 45, y: my + 1, w: 6, h: 1, paletteIndex: idx.skinShade }
    );
  }
  return { id: "mouth", z: 5, shapes };
}

function makeGlassesPart(idx: PaletteIndex): SpriteDSL["parts"][number] {
  return {
    id: "glasses",
    z: 5,
    shapes: [
      // 左镜框
      { type: "rect", x: 32, y: 20, w: 12, h: 7, paletteIndex: idx.outline },
      { type: "rect", x: 34, y: 22, w: 8, h: 3, paletteIndex: idx.skinHi },
      // 右镜框
      { type: "rect", x: 52, y: 20, w: 12, h: 7, paletteIndex: idx.outline },
      { type: "rect", x: 54, y: 22, w: 8, h: 3, paletteIndex: idx.skinHi },
      // 鼻梁
      { type: "rect", x: 44, y: 22, w: 8, h: 2, paletteIndex: idx.outline }
    ]
  };
}

function makeTiePart(idx: PaletteIndex): SpriteDSL["parts"][number] {
  return {
    id: "tie",
    z: 2,
    shapes: [
      // 领带结
      { type: "rect", x: 44, y: 38, w: 8, h: 3, paletteIndex: idx.signature },
      // 主体
      { type: "rect", x: 44, y: 41, w: 8, h: 16, paletteIndex: idx.signature },
      // 高光
      { type: "rect", x: 45, y: 42, w: 2, h: 12, paletteIndex: idx.skinHi },
      // 领带尖
      { type: "rect", x: 45, y: 57, w: 6, h: 2, paletteIndex: idx.signature },
      { type: "rect", x: 46, y: 59, w: 4, h: 1, paletteIndex: idx.signature },
      // 描边
      { type: "rect", x: 43, y: 38, w: 1, h: 22, paletteIndex: idx.outline },
      { type: "rect", x: 52, y: 38, w: 1, h: 22, paletteIndex: idx.outline }
    ]
  };
}

function makeSignaturePart(
  idx: PaletteIndex,
  v: CharacterVariant
): SpriteDSL["parts"][number] {
  const shapes: SpriteDSL["parts"][number]["shapes"] = [];

  // 优先：symbol 库（翼章 / 蝴蝶结 / 十字 / 胸针 等）
  if (v.signatureSymbol) {
    const sym = v.signatureSymbol;
    let anchorX = 48 - Math.floor(sym.width / 2);
    let anchorY = 46;
    if (v.signatureAnchor === "neck") {
      anchorY = 36;
    } else if (v.signatureAnchor === "head") {
      anchorY = 4;
    }
    const colorMap = [idx.signature, idx.signature2, idx.outline];
    for (const s of sym.shapes) {
      shapes.push({
        type: "rect",
        x: anchorX + s.x,
        y: anchorY + s.y,
        w: s.w,
        h: s.h,
        paletteIndex: colorMap[s.color] ?? idx.signature
      });
    }
    return { id: "signature-mark", z: 2, shapes };
  }

  if (v.hasSignatureNumber) {
    // 双数字方块（简化）
    shapes.push(
      { type: "rect", x: 36, y: 48, w: 8, h: 10, paletteIndex: idx.signature },
      { type: "rect", x: 37, y: 49, w: 6, h: 1, paletteIndex: idx.shirt },
      { type: "rect", x: 37, y: 52, w: 6, h: 1, paletteIndex: idx.shirt },
      { type: "rect", x: 37, y: 56, w: 6, h: 1, paletteIndex: idx.shirt },
      { type: "rect", x: 52, y: 48, w: 8, h: 10, paletteIndex: idx.signature },
      { type: "rect", x: 53, y: 49, w: 1, h: 4, paletteIndex: idx.shirt },
      { type: "rect", x: 58, y: 49, w: 1, h: 9, paletteIndex: idx.shirt },
      { type: "rect", x: 53, y: 53, w: 6, h: 1, paletteIndex: idx.shirt }
    );
  } else if (v.hasSignatureLogo) {
    shapes.push(
      { type: "rect", x: 42, y: 48, w: 12, h: 6, paletteIndex: idx.signature },
      { type: "rect", x: 43, y: 49, w: 10, h: 1, paletteIndex: idx.shirtShade },
      { type: "rect", x: 43, y: 53, w: 10, h: 1, paletteIndex: idx.shirtShade },
      { type: "rect", x: 46, y: 50, w: 2, h: 2, paletteIndex: idx.shirt },
      { type: "rect", x: 48, y: 50, w: 2, h: 2, paletteIndex: idx.shirt }
    );
  }
  return { id: "signature-mark", z: 2, shapes };
}

function makeGearPart(idx: PaletteIndex, side: "left" | "right"): SpriteDSL["parts"][number] {
  const x = side === "left" ? 18 : 74;
  return {
    id: `gear-${side}`,
    z: 1,
    shapes: [
      { type: "rect", x, y: 58, w: 5, h: 14, paletteIndex: idx.outline },
      { type: "rect", x: x + 1, y: 59, w: 3, h: 12, paletteIndex: idx.accent },
      { type: "rect", x: x + 1, y: 60, w: 1, h: 10, paletteIndex: idx.skinHi },
      // 绑带
      { type: "rect", x: x - 2, y: 60, w: 9, h: 2, paletteIndex: idx.shirt },
      { type: "rect", x: x - 2, y: 66, w: 9, h: 2, paletteIndex: idx.shirt }
    ]
  };
}

// =============================================================
// 4. 个性化动画（根据 expression 调节）
// =============================================================

function makeSignatureAnimation(v: CharacterVariant): AnimDef {
  const armBoost = v.expression === "focused" ? -10 : v.expression === "smile" ? -8 : -6;
  return {
    fps: 8,
    loop: false,
    frames: [
      { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }] },
      { duration: 5, transforms: [{ partId: "arms", dy: -3, rotate: -4 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
      { duration: 6, transforms: [{ partId: "arms", dy: -6, rotate: -10 }, { partId: "head", dy: -2 }] },
      { duration: 12, transforms: [{ partId: "arms", dy: armBoost, rotate: -12 }, { partId: "head", dy: -2 }, { partId: "brows", dy: -2 }, { partId: "mouth", scale: 1.3 }] },
      { duration: 5, transforms: [{ partId: "arms", dy: -3, rotate: -5 }, { partId: "head", dy: -1 }] },
      { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "brows", dy: 0 }, { partId: "mouth", scale: 1.0 }] }
    ]
  };
}

function makeFidgetA(): AnimDef {
  return {
    fps: 6,
    loop: false,
    frames: [
      { duration: 4, transforms: [{ partId: "head", dy: 0, rotate: 0 }] },
      { duration: 6, transforms: [{ partId: "head", dy: -1, rotate: -3 }, { partId: "eyes", dy: -1 }] },
      { duration: 10, transforms: [{ partId: "head", dy: -1, rotate: -5 }, { partId: "eyes", dy: -1 }, { partId: "brows", dy: -1 }] },
      { duration: 6, transforms: [{ partId: "head", dy: 0, rotate: -2 }] },
      { duration: 4, transforms: [{ partId: "head", dy: 0, rotate: 0 }, { partId: "eyes", dy: 0 }, { partId: "brows", dy: 0 }] }
    ]
  };
}

function makeFidgetB(): AnimDef {
  return {
    fps: 8,
    loop: false,
    frames: [
      { duration: 4, transforms: [{ partId: "arms", dy: 0 }] },
      { duration: 5, transforms: [{ partId: "arms", dy: -4 }, { partId: "head", dy: -1 }] },
      { duration: 8, transforms: [{ partId: "arms", dy: -6 }, { partId: "head", dy: -1, rotate: 2 }] },
      { duration: 5, transforms: [{ partId: "arms", dy: -3 }, { partId: "head", dy: 0 }] },
      { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", rotate: 0 }] }
    ]
  };
}

// =============================================================
// 5. 颜色工具
// =============================================================

function darken(hex: string, ratio: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const f = 1 - Math.max(0, Math.min(1, ratio));
  return rgbToHex(Math.round(c.r * f), Math.round(c.g * f), Math.round(c.b * f));
}

function lighten(hex: string, ratio: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const f = Math.max(0, Math.min(1, ratio));
  return rgbToHex(
    Math.round(c.r + (255 - c.r) * f),
    Math.round(c.g + (255 - c.g) * f),
    Math.round(c.b + (255 - c.b) * f)
  );
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
