import type {
  AnimationName,
  PaletteEntry,
  SpriteDSL,
  SpritePart,
  SpriteProgram
} from "@nuwa-pet/character-protocol";

/**
 * 像素渲染器：把 DSL + 当前动画帧绘制到 OffscreenCanvas / Canvas 2D 上下文。
 * 不引用 DOM；可在 Worker / 主线程通用。
 */

export interface RenderFrameInput {
  animation: AnimationName;
  frameIndex: number;
  scale: number;
}

interface AnimatedTransform {
  partId: string;
  dx?: number;
  dy?: number;
  rotate?: number;
  scale?: number;
  visible?: boolean;
  paletteSwap?: number;
}

export function renderSprite(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  program: SpriteProgram,
  input: RenderFrameInput
): void {
  if (program.mode !== "dsl" || !program.dsl) return;
  const dsl = program.dsl;
  const animation = dsl.animations[input.animation] ?? dsl.animations.idle;
  if (!animation) return;

  const frame = animation.frames[input.frameIndex % animation.frames.length];
  const transformsByPart = new Map<string, AnimatedTransform>();
  if (frame) {
    for (const t of frame.transforms) {
      transformsByPart.set(t.partId, t);
    }
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, program.size.width * input.scale, program.size.height * input.scale);
  ctx.scale(input.scale, input.scale);

  const sortedParts = [...dsl.parts].sort((a, b) => a.z - b.z);
  for (const part of sortedParts) {
    const tr = transformsByPart.get(part.id);
    if (tr?.visible === false) continue;
    drawPart(ctx, part, program.palette, tr);
  }
  ctx.restore();
}

function drawPart(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  part: SpritePart,
  palette: PaletteEntry[],
  transform: AnimatedTransform | undefined
): void {
  ctx.save();
  const dx = transform?.dx ?? 0;
  const dy = transform?.dy ?? 0;
  const rotate = transform?.rotate ?? 0;
  const scale = transform?.scale ?? 1;
  if (part.anchor) {
    ctx.translate(part.anchor.x + dx, part.anchor.y + dy);
    if (rotate !== 0) ctx.rotate((rotate * Math.PI) / 180);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.translate(-part.anchor.x, -part.anchor.y);
  } else {
    ctx.translate(dx, dy);
    if (rotate !== 0) ctx.rotate((rotate * Math.PI) / 180);
    if (scale !== 1) ctx.scale(scale, scale);
  }

  if (part.shapes) {
    for (const shape of part.shapes) {
      const paletteIndex = transform?.paletteSwap ?? shape.paletteIndex;
      const color = palette[paletteIndex]?.hex ?? "#000";
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      switch (shape.type) {
        case "rect":
          if (shape.w != null && shape.h != null) {
            ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
          }
          break;
        case "circle":
          if (shape.r != null) {
            ctx.beginPath();
            ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case "pixel":
          ctx.fillRect(shape.x, shape.y, 1, 1);
          break;
        case "line":
          if (shape.x2 != null && shape.y2 != null) {
            ctx.beginPath();
            ctx.moveTo(shape.x, shape.y);
            ctx.lineTo(shape.x2, shape.y2);
            ctx.stroke();
          }
          break;
      }
    }
  }

  if (part.pixels) {
    const basePaletteIndex = part.paletteIndex ?? 0;
    const fallbackColor = palette[basePaletteIndex]?.hex ?? "#000";
    for (let y = 0; y < part.pixels.length; y += 1) {
      const row = part.pixels[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x];
        if (!ch || ch === " ") continue;
        const idx = "ABCDEFGHIJKLMNOP".indexOf(ch);
        const swap = transform?.paletteSwap;
        const color =
          swap != null
            ? palette[swap]?.hex ?? fallbackColor
            : idx >= 0
            ? palette[idx]?.hex ?? fallbackColor
            : fallbackColor;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.restore();
}

export function pickAnimationForState(
  dsl: SpriteDSL,
  state: keyof SpriteDSL["stateMachine"]["states"]
): AnimationName {
  return dsl.stateMachine.states[state]?.animation ?? "idle";
}
