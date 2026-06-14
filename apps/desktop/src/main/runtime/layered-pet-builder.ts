import {
  SCHEMA_VERSION,
  type AppearanceSpec,
  type LayeredPetDSL,
  type LayeredPetLayer,
  type LayeredRigHints,
  type PaletteEntry,
  type SignatureMotion,
  type SpriteProgram
} from "@nuwa-pet/character-protocol";
import {
  standardStateMachine,
  withFidgetVariants
} from "@nuwa-pet/starter-library";

const CANVAS_W = 160;
const CANVAS_H = 200;

export interface ReferenceImageInput {
  url: string;
  source: "user-upload" | "web";
  role?: "primary" | "reference";
  notes?: string;
}

export interface BuildLayeredPetInput {
  appearance: AppearanceSpec;
  referenceImages?: ReferenceImageInput[];
  characterName: string;
  rigHints?: LayeredRigHints | null;
}

/**
 * 方案 B 主入口：参考图分层 + CSS 骨骼桌宠。
 * 有参考图 → 以图为视觉主体（解决「不像本人」）；
 * 无参考图 → 从 AppearanceSpec 生成精致 CSS 插画层（优于旧像素模板）。
 */
export function buildLayeredPetFromAppearance(
  input: BuildLayeredPetInput
): SpriteProgram {
  const refs = collectReferences(input.appearance, input.referenceImages);
  const primary = pickPrimaryReference(refs);
  const palette = buildPaletteFromAppearance(input.appearance);
  const signature = input.rigHints?.signature ?? inferSignatureMotion(input.appearance);

  const layered: LayeredPetDSL = primary
    ? buildReferenceLayers(primary.url, input.appearance, input.rigHints, signature)
    : buildCssIllustratedLayers(input.appearance, signature);

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "layered-css",
    size: { width: CANVAS_W, height: CANVAS_H },
    displayScale: 2,
    palette,
    layered
  };
}

function collectReferences(
  appearance: AppearanceSpec,
  extra?: ReferenceImageInput[]
): ReferenceImageInput[] {
  const fromSpec = (appearance.referenceImages ?? []).map((r) => ({
    url: r.url,
    source: r.source,
    role: r.role,
    notes: r.notes
  }));
  const merged = [...(extra ?? []), ...fromSpec];
  const seen = new Set<string>();
  return merged.filter((r) => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

function pickPrimaryReference(
  refs: ReferenceImageInput[]
): ReferenceImageInput | null {
  if (refs.length === 0) return null;
  const primary = refs.find((r) => r.role === "primary");
  if (primary) return primary;
  const user = refs.find((r) => r.source === "user-upload");
  return user ?? refs[0] ?? null;
}

function buildPaletteFromAppearance(a: AppearanceSpec): PaletteEntry[] {
  const entries = (a.palette ?? []).map((p) => ({
    name: p.role,
    hex: p.hex
  }));
  if (entries.length >= 2) return entries.slice(0, 16);
  return [
    { name: "outline", hex: "#1a1a2e" },
    { name: "skin", hex: a.skinTone?.hex ?? "#f3d3b1" },
    { name: "hair", hex: a.hair?.color?.hex ?? "#2a2a2a" },
    { name: "shirt", hex: a.outfit?.top?.color?.hex ?? "#3d5a80" },
    { name: "pants", hex: a.outfit?.bottom?.color?.hex ?? "#4a4a4a" },
    { name: "eye", hex: a.eyes?.color?.hex ?? "#3b2614" },
    { name: "accent", hex: "#d94f70" },
    { name: "signature", hex: "#ffd166" }
  ];
}

function inferSignatureMotion(a: AppearanceSpec): SignatureMotion {
  const tokens = [
    ...(a.styleTokens ?? []),
    a.outfit.top.name,
    ...(a.outfit.accessories ?? []).map((x) => x.name),
    ...(a.gear ?? []).map((x) => x.name)
  ]
    .join(" ")
    .toLowerCase();

  if (/球衣|篮球|运动|jersey|sport/.test(tokens)) return "bounce";
  if (/军装|军|调查兵团|military|制服/.test(tokens)) return "salute";
  if (/健身|肌肉|muscular|kobe|科比/.test(tokens)) return "flex";
  if (/魔法|sparkle|偶像|idol|miku|初音/.test(tokens)) return "sparkle";
  if (/严肃|庄重|ceo|西装|suit/.test(tokens)) return "nod";
  return "wave";
}

function defaultEyes(
  a: AppearanceSpec,
  hints?: LayeredRigHints | null
): LayeredPetDSL["rig"] {
  const eyeHex = a.eyes?.color?.hex ?? "#3b2614";
  const isFemale = a.gender === "female";
  const isChibi = a.animeStyle === "chibi";
  const yBase = isChibi ? 0.34 : isFemale ? 0.36 : 0.38;
  const spread = isChibi ? 0.12 : 0.1;

  const left = hints?.leftEye ?? { x: 0.5 - spread, y: yBase, size: isChibi ? 12 : 9 };
  const right = hints?.rightEye ?? { x: 0.5 + spread, y: yBase, size: isChibi ? 12 : 9 };

  return {
    eyeTracking: true,
    blinkEnabled: true,
    leftEye: {
      x: left.x,
      y: left.y,
      size: left.size ?? 9,
      color: eyeHex,
      pupilColor: "#0a0a0a"
    },
    rightEye: {
      x: right.x,
      y: right.y,
      size: right.size ?? 9,
      color: eyeHex,
      pupilColor: "#0a0a0a"
    },
    characterBounds: hints?.characterBounds ?? { x: 0.05, y: 0.02, w: 0.9, h: 0.94 },
    hasTransparentBg: hints?.hasTransparentBg
  };
}

function buildReferenceLayers(
  imageUrl: string,
  appearance: AppearanceSpec,
  rigHints: LayeredRigHints | null | undefined,
  signature: SignatureMotion
): LayeredPetDSL {
  const bounds = rigHints?.characterBounds ?? { x: 0.05, y: 0.02, w: 0.9, h: 0.94 };
  const headCrop = cropWithin(bounds, 0.18, 0.02, 0.64, 0.34);
  const hairCrop = cropWithin(bounds, 0.08, 0, 0.84, 0.36);
  const bodyCrop = cropWithin(bounds, 0.17, 0.31, 0.66, 0.5);
  const outfitCrop = cropWithin(bounds, 0.2, 0.42, 0.6, 0.42);
  const gearCrop = cropWithin(bounds, 0, 0.34, 1, 0.46);
  const layers: LayeredPetLayer[] = [
    {
      id: "ambient-glow",
      bone: "root",
      z: 0,
      type: "css-shape",
      x: CANVAS_W * 0.15,
      y: CANVAS_H * 0.55,
      width: CANVAS_W * 0.7,
      height: CANVAS_H * 0.35,
      shape: "ellipse",
      gradient:
        "radial-gradient(ellipse, rgba(255,220,180,0.18) 0%, transparent 70%)",
      opacity: 0.9
    },
    {
      id: "shadow",
      bone: "shadow",
      z: 1,
      type: "css-shape",
      x: CANVAS_W * 0.22,
      y: CANVAS_H * 0.9,
      width: CANVAS_W * 0.56,
      height: 10,
      shape: "ellipse",
      fill: "rgba(20, 24, 40, 0.22)",
      opacity: 0.85
    },
    refImageLayer("ref-body", "body", imageUrl, bodyCrop, 10, "rounded-rect"),
    refImageLayer("ref-outfit", "outfit", imageUrl, outfitCrop, 13, "rounded-rect"),
    refImageLayer("ref-head", "head", imageUrl, headCrop, 20, "ellipse"),
    refImageLayer("ref-hair-front", "hair-front", imageUrl, hairCrop, 24, "ellipse")
  ];

  if ((appearance.gear ?? []).length > 0) {
    layers.push(refImageLayer("ref-gear", "gear-l", imageUrl, gearCrop, 12, "rounded-rect"));
  }
  addAccessoryOverlays(layers, appearance);

  return {
    canvas: { width: CANVAS_W, height: CANVAS_H },
    primarySource: "reference",
    layers,
    rig: defaultEyes(appearance, rigHints),
    signature,
    defaultEmotion: inferDefaultEmotion(appearance),
    stateMachine: withFidgetVariants(standardStateMachine())
  };
}

function cropWithin(
  bounds: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: clamp(bounds.x + bounds.w * x, 0, 0.98),
    y: clamp(bounds.y + bounds.h * y, 0, 0.98),
    w: clamp(bounds.w * w, 0.02, 1),
    h: clamp(bounds.h * h, 0.02, 1)
  };
}

function refImageLayer(
  id: string,
  bone: LayeredPetLayer["bone"],
  imageUrl: string,
  crop: { x: number; y: number; w: number; h: number },
  z: number,
  shape: "ellipse" | "rounded-rect"
): LayeredPetLayer {
  return {
    id,
    bone,
    z,
    type: "image",
    imageUrl,
    x: crop.x * CANVAS_W,
    y: crop.y * CANVAS_H,
    width: crop.w * CANVAS_W,
    height: crop.h * CANVAS_H,
    objectFit: "cover",
    crop,
    shape,
    borderRadius: shape === "ellipse" ? 999 : 18,
    transformOrigin: { x: 0.5, y: bone === "head" || bone === "hair-front" ? 0.82 : 0.2 },
    boxShadow: bone === "head" ? "0 6px 18px rgba(0,0,0,0.12)" : undefined
  };
}

function addAccessoryOverlays(
  layers: LayeredPetLayer[],
  a: AppearanceSpec
): void {
  const sig = (a.outfit.accessories ?? []).find((x) => x.signature);
  if (!sig) return;
  const accent = sig.color?.hex ?? "#ffd166";
  layers.push({
    id: "sig-badge",
    bone: "accessory",
    z: 30,
    type: "overlay",
    x: CANVAS_W * 0.38,
    y: CANVAS_H * 0.52,
    width: 28,
    height: 28,
    shape: "rounded-rect",
    fill: accent,
    borderRadius: 14,
    boxShadow: `0 2px 8px ${accent}66`,
    opacity: 0.92
  });
}

function buildCssIllustratedLayers(
  a: AppearanceSpec,
  signature: SignatureMotion
): LayeredPetDSL {
  const skin = a.skinTone?.hex ?? "#f3d3b1";
  const hair = a.hair?.color?.hex ?? "#2a2a2a";
  const shirt = a.outfit.top?.color?.hex ?? "#3d5a80";
  const pants = a.outfit.bottom?.color?.hex ?? "#4a4a4a";
  const eye = a.eyes?.color?.hex ?? "#3b2614";
  const isFemale = a.gender === "female";
  const isChibi = a.animeStyle === "chibi";
  const headR = isChibi ? 38 : isFemale ? 32 : 30;
  const headCx = CANVAS_W / 2;
  const headCy = isChibi ? 72 : 64;
  const bodyW = isFemale ? 52 : isChibi ? 48 : 56;
  const bodyH = isChibi ? 44 : 52;
  const bodyY = headCy + headR - 8;

  const layers: LayeredPetLayer[] = [
    glowLayer(),
    shadowLayer(),
    // 后发
    {
      id: "hair-back",
      bone: "hair-back",
      z: 5,
      type: "css-shape",
      x: headCx - headR - 6,
      y: headCy - headR - 4,
      width: (headR + 6) * 2,
      height: headR + 20,
      shape: "ellipse",
      fill: hair,
      transformOrigin: { x: 0.5, y: 0.3 }
    },
    // 腿
    legLayer("leg-l", headCx - 14, bodyY + bodyH - 4, pants),
    legLayer("leg-r", headCx + 4, bodyY + bodyH - 4, pants),
    // 身体
    {
      id: "torso",
      bone: "body",
      z: 12,
      type: "css-shape",
      x: headCx - bodyW / 2,
      y: bodyY,
      width: bodyW,
      height: bodyH,
      shape: "rounded-rect",
      fill: shirt,
      borderRadius: isFemale ? 18 : 12,
      boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.08)",
      transformOrigin: { x: 0.5, y: 0.2 }
    },
    // 手臂
    armLayer("arm-l", headCx - bodyW / 2 - 10, bodyY + 8, skin),
    armLayer("arm-r", headCx + bodyW / 2 - 2, bodyY + 8, skin),
    // 头
    {
      id: "head",
      bone: "head",
      z: 20,
      type: "css-shape",
      x: headCx - headR,
      y: headCy - headR,
      width: headR * 2,
      height: headR * 2,
      shape: "ellipse",
      fill: skin,
      gradient: `radial-gradient(circle at 35% 30%, ${lighten(skin, 12)} 0%, ${skin} 55%, ${darken(skin, 8)} 100%)`,
      boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
      transformOrigin: { x: 0.5, y: 0.85 }
    },
    // 前发
    hairFrontLayer(a, headCx, headCy, headR, hair),
    // 眼睛
    eyeLayer("eye-l", headCx - (isChibi ? 16 : 13), headCy - 2, eye, isChibi),
    eyeLayer("eye-r", headCx + (isChibi ? 8 : 5), headCy - 2, eye, isChibi),
    // 嘴
    mouthLayer(a, headCx, headCy + (isChibi ? 14 : 12)),
    // 腮红（少女）
    ...(isFemale || a.animeStyle === "anime-shoujo"
      ? [blushLayer("blush-l", headCx - 22, headCy + 6), blushLayer("blush-r", headCx + 10, headCy + 6)]
      : []),
    // 眼镜
    ...(hasGlasses(a) ? glassesLayers(headCx, headCy, headR) : []),
    // 领带
    ...(hasTie(a) ? [tieLayer(headCx, bodyY + 4, a)] : [])
  ];

  addGearLayers(layers, a, headCx, bodyY, bodyW);
  addAccessoryOverlays(layers, a);

  return {
    canvas: { width: CANVAS_W, height: CANVAS_H },
    primarySource: "css-generated",
    layers,
    rig: defaultEyes(a, null),
    signature,
    defaultEmotion: inferDefaultEmotion(a),
    stateMachine: withFidgetVariants(standardStateMachine())
  };
}

function glowLayer(): LayeredPetLayer {
  return {
    id: "ambient-glow",
    bone: "root",
    z: 0,
    type: "css-shape",
    x: CANVAS_W * 0.1,
    y: CANVAS_H * 0.5,
    width: CANVAS_W * 0.8,
    height: CANVAS_H * 0.4,
    shape: "ellipse",
    gradient:
      "radial-gradient(ellipse, rgba(255,200,150,0.15) 0%, transparent 72%)",
    opacity: 0.85
  };
}

function shadowLayer(): LayeredPetLayer {
  return {
    id: "shadow",
    bone: "shadow",
    z: 1,
    type: "css-shape",
    x: CANVAS_W * 0.24,
    y: CANVAS_H * 0.9,
    width: CANVAS_W * 0.52,
    height: 10,
    shape: "ellipse",
    fill: "rgba(20, 24, 40, 0.2)"
  };
}

function legLayer(id: string, x: number, y: number, color: string): LayeredPetLayer {
  return {
    id,
    bone: "body",
    z: 8,
    type: "css-shape",
    x,
    y,
    width: 14,
    height: 36,
    shape: "rounded-rect",
    fill: color,
    borderRadius: 6,
    transformOrigin: { x: 0.5, y: 0 }
  };
}

function armLayer(id: string, x: number, y: number, color: string): LayeredPetLayer {
  return {
    id,
    bone: "body",
    z: 11,
    type: "css-shape",
    x,
    y,
    width: 12,
    height: 28,
    shape: "rounded-rect",
    fill: color,
    borderRadius: 6,
    transformOrigin: { x: 0.5, y: 0.15 }
  };
}

function hairFrontLayer(
  a: AppearanceSpec,
  cx: number,
  cy: number,
  r: number,
  color: string
): LayeredPetLayer {
  const style = a.hair.style.toLowerCase();
  const isLong = /长|long|马尾|ponytail|双马尾|twin/.test(style);
  const w = isLong ? r * 2.2 : r * 1.8;
  const h = isLong ? r * 1.1 : r * 0.75;
  return {
    id: "hair-front",
    bone: "hair-front",
    z: 22,
    type: "css-shape",
    x: cx - w / 2,
    y: cy - r - 2,
    width: w,
    height: h,
    shape: "ellipse",
    fill: color,
    gradient: `linear-gradient(180deg, ${lighten(color, 8)} 0%, ${color} 100%)`,
    transformOrigin: { x: 0.5, y: 0.2 }
  };
}

function eyeLayer(
  id: string,
  x: number,
  y: number,
  color: string,
  chibi: boolean
): LayeredPetLayer {
  const sz = chibi ? 14 : 10;
  return {
    id,
    bone: "eyes",
    z: 24,
    type: "css-shape",
    x,
    y,
    width: sz,
    height: chibi ? sz * 1.15 : sz,
    shape: "ellipse",
    fill: "#ffffff",
    gradient: `radial-gradient(circle at 40% 35%, #fff 0%, ${color} 85%)`,
    boxShadow: `inset 0 -1px 2px ${darken(color, 20)}44`,
    transformOrigin: { x: 0.5, y: 0.5 }
  };
}

function mouthLayer(a: AppearanceSpec, cx: number, cy: number): LayeredPetLayer {
  const expr = a.eyes.expression.toLowerCase();
  const smile = /笑|温和|gentle|smile|开心/.test(expr);
  return {
    id: "mouth",
    bone: "mouth",
    z: 25,
    type: "css-shape",
    x: cx - (smile ? 8 : 6),
    y: cy,
    width: smile ? 16 : 12,
    height: smile ? 6 : 3,
    shape: "rounded-rect",
    fill: smile ? "#c45c6a" : "#b07070",
    borderRadius: smile ? 8 : 2,
    transformOrigin: { x: 0.5, y: 0.5 }
  };
}

function blushLayer(id: string, x: number, y: number): LayeredPetLayer {
  return {
    id,
    bone: "face",
    z: 23,
    type: "css-shape",
    x,
    y,
    width: 12,
    height: 7,
    shape: "ellipse",
    fill: "rgba(255, 140, 160, 0.35)",
    opacity: 0.8
  };
}

function glassesLayers(cx: number, cy: number, r: number): LayeredPetLayer[] {
  return [
    {
      id: "glasses",
      bone: "accessory",
      z: 26,
      type: "overlay",
      x: cx - r + 4,
      y: cy - 6,
      width: r * 2 - 8,
      height: 18,
      shape: "rounded-rect",
      fill: "transparent",
      borderRadius: 4,
      boxShadow: `inset 0 0 0 2px #1a1a1a, inset 14px 0 0 0 transparent`
    }
  ];
}

function tieLayer(cx: number, y: number, a: AppearanceSpec): LayeredPetLayer {
  const tie = (a.outfit.accessories ?? []).find((x) =>
    /领带|tie/i.test(x.name)
  );
  const color = tie?.color?.hex ?? "#b41e2f";
  return {
    id: "tie",
    bone: "accessory",
    z: 18,
    type: "css-shape",
    x: cx - 5,
    y,
    width: 10,
    height: 32,
    shape: "rounded-rect",
    fill: color,
    borderRadius: 2,
    transformOrigin: { x: 0.5, y: 0 }
  };
}

function addGearLayers(
  layers: LayeredPetLayer[],
  a: AppearanceSpec,
  cx: number,
  bodyY: number,
  bodyW: number
): void {
  const gear = a.gear ?? [];
  if (gear.length >= 1) {
    layers.push({
      id: "gear-l",
      bone: "gear-l",
      z: 14,
      type: "css-shape",
      x: cx - bodyW / 2 - 14,
      y: bodyY + 16,
      width: 12,
      height: 28,
      shape: "rounded-rect",
      fill: "#6b7280",
      borderRadius: 3,
      transformOrigin: { x: 0.5, y: 0.5 }
    });
  }
  if (gear.length >= 2) {
    layers.push({
      id: "gear-r",
      bone: "gear-r",
      z: 14,
      type: "css-shape",
      x: cx + bodyW / 2 + 2,
      y: bodyY + 16,
      width: 12,
      height: 28,
      shape: "rounded-rect",
      fill: "#6b7280",
      borderRadius: 3,
      transformOrigin: { x: 0.5, y: 0.5 }
    });
  }
}

function hasGlasses(a: AppearanceSpec): boolean {
  const feats = [...(a.facialFeatures ?? []), ...(a.outfit.accessories ?? []).map((x) => x.name)]
    .join(" ")
    .toLowerCase();
  return /眼镜|glasses|镜框/.test(feats);
}

function hasTie(a: AppearanceSpec): boolean {
  const acc = (a.outfit.accessories ?? []).map((x) => x.name).join(" ").toLowerCase();
  return /领带|tie|bow/.test(acc) || /西装|suit/.test(a.outfit.top.name.toLowerCase());
}

function inferDefaultEmotion(
  a: AppearanceSpec
): LayeredPetDSL["defaultEmotion"] {
  const expr = a.eyes.expression.toLowerCase();
  if (/笑|开心|happy|温和|gentle/.test(expr)) return "happy";
  if (/专注|锐利|focused|坚定/.test(expr)) return "focused";
  if (/怒|angry|严肃|stern/.test(expr)) return "focused";
  return "neutral";
}

function lighten(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + pct);
  const g = Math.min(255, ((n >> 8) & 0xff) + pct);
  const b = Math.min(255, (n & 0xff) + pct);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function darken(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - pct);
  const g = Math.max(0, ((n >> 8) & 0xff) - pct);
  const b = Math.max(0, (n & 0xff) - pct);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
