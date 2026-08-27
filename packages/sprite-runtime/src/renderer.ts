/**
 * DSL 像素精灵渲染：按当前动画帧把 `SpriteProgram` 画到 Canvas 2D / OffscreenCanvas。
 *
 * 只处理 `mode === "dsl"` 的程序；atlas 贴图由桌面端其它渲染层负责。
 * 不引用 DOM，Worker 与主线程均可调用。绘制会改写传入的 `ctx`（clear / transform / fill），
 * 用 `save`/`restore` 包一层，避免变换泄漏到调用方。
 */
import type {
  AnimationName,
  PaletteEntry,
  SpriteDSL,
  SpritePart,
  SpriteProgram
} from "@bailin/character-protocol";

/**
 * 单帧绘制入参。
 * `frameIndex` 会对动画帧数取模循环；`scale` 是整数像素放大倍数（关闭图像平滑）。
 */
export interface RenderFrameInput {
  animation: AnimationName;
  frameIndex: number;
  scale: number;
}

/** 某一帧里对单个部件的位移 / 旋转 / 显隐 / 调色板替换。 */
interface AnimatedTransform {
  partId: string;
  dx?: number;
  dy?: number;
  rotate?: number;
  scale?: number;
  visible?: boolean;
  paletteSwap?: number;
}

/**
 * 把 DSL 精灵的一帧绘制到 `ctx`。
 *
 * 非 DSL 程序、缺少 `dsl`、或连 idle 动画都没有时直接返回，不画。
 * 部件按 `z` 升序叠画；当前帧把该部件标成 `visible === false` 则跳过。
 *
 * @param ctx Canvas 2D 或 OffscreenCanvas 上下文；会被清空并绘制，函数结束时 restore
 * @param program 精灵程序；仅 `mode === "dsl"` 且带 `dsl` 时生效
 * @param input 动画名、帧序号与缩放
 * @returns 无返回值；副作用是改写 `ctx` 的像素与变换栈
 */
export function renderSprite(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  program: SpriteProgram,
  input: RenderFrameInput
): void {
  if (program.mode !== "dsl" || !program.dsl) return;
  const dsl = program.dsl;
  // 未知动画名回落到 idle，避免状态机切到未定义 clip 时整帧空白
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

/**
 * 绘制单个部件：先施加锚点变换，再画矢量形状或像素字面量。
 * 内部 `save`/`restore`，不把局部变换留给下一部件。
 */
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
    // 有锚点时绕锚点旋转/缩放，避免部件围着画布原点甩出去
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
        // A–P 映射调色板 0–15；空格是透明。整帧 paletteSwap 会覆盖字母索引。
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

/**
 * 按状态机当前状态取出应对动画名；该状态未配置动画时回落到 `"idle"`。
 *
 * @param dsl 含 `stateMachine` 的 DSL
 * @param state 状态机状态键
 * @returns 动画名；无副作用
 */
export function pickAnimationForState(
  dsl: SpriteDSL,
  state: keyof SpriteDSL["stateMachine"]["states"]
): AnimationName {
  return dsl.stateMachine.states[state]?.animation ?? "idle";
}
