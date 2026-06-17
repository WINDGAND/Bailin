import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AtlasStateBinding,
  SpriteEvent,
  SpriteProgram,
  SpriteState
} from "@nuwa-pet/character-protocol";
import { atlasWalkLeftBinding } from "@nuwa-pet/character-protocol";
import { createStateMachine } from "@nuwa-pet/sprite-runtime";
import "./atlas-pet.css";

/**
 * AtlasPet：消费 SpriteProgram.atlas 的图集型桌宠渲染器。
 *
 * 兼容 hatch-pet / Codex Pet Contract：图集 1536×1872 / 8×9 / 单格 192×208。
 * 渲染策略：把 spritesheet 作为 `background-image`，按当前 SpriteState 对应的
 * row 偏移 `background-position`，用 RAF + fps 推进帧索引。
 */

interface AtlasPetProps {
  program: SpriteProgram;
  externalEvent?: { kind: SpriteEvent; nonce: number };
  forceState?: SpriteState;
  /** 拖行时根据水平方向选 running-right / running-left 行。 */
  runDirection?: "left" | "right";
  /** 与 runDirection 同步；RAF 每帧读取，保证快速左右拖曳时方向跟手。 */
  runDirectionRef?: React.RefObject<"left" | "right">;
  hatching?: boolean;
  width?: number;
  height?: number;
}

const FALLBACK_BINDING: AtlasStateBinding = {
  row: 0,
  frameCount: 1,
  fps: 4,
  loop: true
};

export function AtlasPet({
  program,
  externalEvent,
  forceState,
  runDirection = "right",
  runDirectionRef,
  hatching,
  width: widthOverride,
  height: heightOverride
}: AtlasPetProps): JSX.Element | null {
  const atlas = program.atlas;
  const machineRef = useRef<ReturnType<typeof createStateMachine> | null>(null);
  const [state, setState] = useState<SpriteState>(
    atlas?.stateMachine.initial ?? "idle"
  );
  const [frameIndex, setFrameIndex] = useState(0);

  const walkLeftBinding = useMemo(
    () => (atlas ? atlasWalkLeftBinding() : null),
    [atlas]
  );

  const currentRunDirection = (): "left" | "right" =>
    runDirectionRef?.current ?? runDirection;

  const resolveBinding = (spriteState: SpriteState): AtlasStateBinding => {
    if (!atlas) return FALLBACK_BINDING;
    if (spriteState === "drag" && currentRunDirection() === "left" && walkLeftBinding) {
      return walkLeftBinding;
    }
    return atlas.states[spriteState] ?? atlas.states.idle ?? FALLBACK_BINDING;
  };

  const display = useMemo(() => {
    if (!atlas) return { w: 96, h: 96, scale: 1 };
    const cellW = atlas.cell.width;
    const cellH = atlas.cell.height;
    const w = widthOverride ?? cellW;
    const h = heightOverride ?? cellH;
    const scale = w / cellW;
    return { w, h, scale };
  }, [atlas, widthOverride, heightOverride]);

  useEffect(() => {
    if (!atlas) return;
    const machine = createStateMachine({ stateMachine: atlas.stateMachine });
    machineRef.current = machine;

    let raf = 0;
    let last = performance.now();
    let frameLast = performance.now();
    let localFrame = 0;
    let prevState: SpriteState = machine.state as SpriteState;
    let prevDragDir: "left" | "right" | null = null;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      machine.step(delta);

      const next = forceState ?? (machine.state as SpriteState);
      if (next === "drag") {
        const dir = currentRunDirection();
        if (dir !== prevDragDir) {
          prevDragDir = dir;
          localFrame = 0;
          frameLast = now;
          setFrameIndex(0);
        }
      } else {
        prevDragDir = null;
      }
      if (next !== prevState) {
        prevState = next;
        localFrame = 0;
        frameLast = now;
        setFrameIndex(0);
        setState(next);
      } else if (next !== state) {
        setState(next);
      }

      const binding = resolveBinding(next);
      const frameDuration = 1000 / Math.max(1, binding.fps);
      if (now - frameLast >= frameDuration) {
        frameLast = now;
        const total = Math.max(1, binding.frameCount);
        const nextFrame = localFrame + 1;
        if (nextFrame >= total) {
          if (binding.loop) {
            localFrame = 0;
          } else {
            localFrame = total - 1;
            machine.setFrameDone(true);
            machine.send("tick");
            machine.setFrameDone(false);
          }
        } else {
          localFrame = nextFrame;
        }
        setFrameIndex(localFrame);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      machineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, forceState]);

  useEffect(() => {
    if (!externalEvent) return;
    machineRef.current?.send(externalEvent.kind);
  }, [externalEvent]);

  if (!atlas) return null;

  const binding = resolveBinding(state);
  const cellW = atlas.cell.width;
  const cellH = atlas.cell.height;
  const sheetW = cellW * atlas.grid.columns;
  const sheetH = cellH * atlas.grid.rows;
  const safeFrame = Math.min(frameIndex, Math.max(0, binding.frameCount - 1));
  const bgX = -safeFrame * cellW * display.scale;
  const bgY = -binding.row * cellH * display.scale;
  const bgW = sheetW * display.scale;
  const bgH = sheetH * display.scale;

  return (
    <div
      className={`atlas-pet${hatching ? " atlas-pet--hatch" : ""}`}
      data-state={state}
      data-run-direction={state === "drag" ? currentRunDirection() : undefined}
      style={{
        width: display.w,
        height: display.h
      }}
    >
      <div
        className="atlas-pet__frame"
        style={{
          width: display.w,
          height: display.h,
          backgroundImage: `url("${atlas.spritesheetUrl}")`,
          backgroundPosition: `${bgX}px ${bgY}px`,
          backgroundSize: `${bgW}px ${bgH}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "auto"
        }}
      />
    </div>
  );
}
