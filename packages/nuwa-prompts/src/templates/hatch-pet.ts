import type { AppearanceSpec, HatchPetRowState } from "@nuwa-pet/character-protocol";

/**
 * Hatch-pet prompt 模板。
 *
 * 与 [openai/skills hatch-pet SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)
 * 对齐：单条 prompt 简洁、状态相关、生产取向，把策略 / QA 规则集中在工具脚本里，
 * 不在每条 prompt 中重复展开。
 *
 * 三类 prompt：
 *   1. base   生成 canonical 主立绘（chibi 正面全身），是后续 9 行的身份锚定
 *   2. row    9 个状态的一行 strip prompt
 *   3. style  把 AppearanceSpec → 可复用的视觉描述（base / row 都用）
 */

export interface HatchPetBaseInput {
  characterName: string;
  appearance: AppearanceSpec;
  /** 用户原始 hint / 视觉素材描述，用以补全 appearance 中可能缺失的细节。 */
  userHint?: string;
  /** 偏好风格 preset；默认 auto。 */
  stylePreset?:
    | "auto"
    | "pixel"
    | "plush"
    | "clay"
    | "sticker"
    | "flat-vector"
    | "3d-toy"
    | "painterly";
  /** chroma key 颜色，模型必须画在这个底色之上，便于后处理 alpha 去背景。 */
  chromaKey?: { r: number; g: number; b: number };
}

export interface HatchPetRowInput {
  characterName: string;
  appearance: AppearanceSpec;
  rowState: HatchPetRowState;
  frameCount: number;
  cell: { width: number; height: number };
  stylePreset?: HatchPetBaseInput["stylePreset"];
  chromaKey?: { r: number; g: number; b: number };
}

const ROW_DESCRIPTIONS: Record<HatchPetRowState, string> = {
  idle: "subtle breathing, tiny blink, gentle body bob; pose must vary visibly across frames without major gestures",
  "running-right": "side-view directional walk to the right; pumping arms and alternating strides, facing right",
  "running-left": "mirror of running-right; side-view walk to the left, facing left",
  waving:
    "waving hand or paw greeting; expressive arm motion through limb pose only, no motion lines",
  jumping:
    "vertical jump showing body lift then landing; no dust, shadows, or impact bursts",
  failed:
    "subdued downcast expression with optional attached small tears; no red X marks, floating symbols",
  waiting:
    "expectant asking pose with slight tilt or paw raise, distinct from idle and review",
  running:
    "focused task work — gentle typing/scanning/thinking gesture; not literal foot running",
  review:
    "focused inspection pose with lean, blink, head tilt or paw at chin; do not add magnifiers or papers unless already part of base identity"
};

function describeAppearance(a: AppearanceSpec): string {
  const palette = (a.palette ?? [])
    .slice(0, 6)
    .map((p) => `${p.role}=${p.hex}`)
    .join(", ");
  const top = a.outfit?.top;
  const bottom = a.outfit?.bottom;
  const outfit = top
    ? `top=${top.name}(${top.color.hex})${bottom ? `, bottom=${bottom.name}(${bottom.color.hex})` : ""}`
    : "";
  const acc = (a.outfit?.accessories ?? [])
    .filter((x) => x.signature)
    .map((x) => x.name)
    .join("、");
  const gear = (a.gear ?? []).map((g) => g.name).join("、");
  const hair = a.hair ? `${a.hair.style}(${a.hair.color.hex})` : "";
  const skin = a.skinTone?.hex ?? "#f3d3b1";
  const eyes = a.eyes
    ? `${a.eyes.shape}/${a.eyes.color.hex}, ${a.eyes.expression}`
    : "";
  const segments = [
    `skin=${skin}`,
    `eyes: ${eyes}`,
    `hair: ${hair}`,
    `outfit: ${outfit}`,
    acc ? `signature: ${acc}` : "",
    gear ? `gear: ${gear}` : "",
    palette ? `palette: ${palette}` : ""
  ].filter(Boolean);
  return segments.join(" | ");
}

function styleClause(preset: HatchPetBaseInput["stylePreset"]): string {
  if (!preset || preset === "auto") {
    return "Choose a single coherent pet-safe style suitable for desktop companion sprites (clay/plush/sticker/flat-vector/3d-toy). Lock that style across every frame.";
  }
  return `Render in ${preset} style; lock the style across every frame.`;
}

function chromaClause(c?: HatchPetBaseInput["chromaKey"]): string {
  if (!c) {
    return "Background must be fully transparent.";
  }
  return `Background must be a flat solid RGB(${c.r},${c.g},${c.b}) chroma key area, with no gradient or noise, so it can be cleanly removed afterwards.`;
}

/**
 * base prompt：单张 chibi 正面全身立绘，cell 尺寸预算 192×208。
 */
export function buildHatchPetBasePrompt(input: HatchPetBaseInput): string {
  const desc = describeAppearance(input.appearance);
  const lines = [
    `A friendly chibi-style desktop companion sprite of ${input.characterName}, front-facing, full body, centered, compact silhouette.`,
    desc,
    input.userHint ? `Extra identity cues: ${input.userHint}` : "",
    styleClause(input.stylePreset),
    chromaClause(input.chromaKey),
    "Single character only; no text, no logos, no UI elements, no scenery, no shadows beyond the body silhouette.",
    "Crop must fit within a 192×208 cell with ~12px safe margin on all sides.",
    "This image is the canonical reference. It must read clearly at small sizes, with strong color separation between head, body, and accessories."
  ];
  return lines.filter(Boolean).join(" \n");
}

/**
 * row prompt：一行多帧 strip，宽度 = cell.w × frameCount。
 */
export function buildHatchPetRowPrompt(input: HatchPetRowInput): string {
  const desc = describeAppearance(input.appearance);
  const stripWidth = input.cell.width * input.frameCount;
  const action = ROW_DESCRIPTIONS[input.rowState];
  const lines = [
    `A horizontal animation strip of ${input.frameCount} frames showing ${input.characterName} performing the action: "${input.rowState}". Identity must match the canonical base.`,
    `Strip canvas: ${stripWidth} × ${input.cell.height} px; cleanly divisible into ${input.frameCount} equal-width frames.`,
    `Frame-by-frame action: ${action}.`,
    "Cadence must visibly alternate across the loop — do not repeat one nearly-static frame.",
    desc,
    styleClause(input.stylePreset),
    chromaClause(input.chromaKey),
    "Each frame must contain the entire pet sprite, centered, with consistent silhouette, props, palette and lighting.",
    "Do not draw motion lines, speed lines, dust, shadows, floating sparkles, text, labels, or any decorative effect outside the body.",
    `Mentally divide the canvas into ${input.frameCount} equal vertical slots; each slot is one animation frame. Do not draw visible borders, guides, numbers, or labels.`,
    "Background must be pure chroma key (or transparent if natively supported)."
  ];
  return lines.filter(Boolean).join(" \n");
}
