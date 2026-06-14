import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AtlasPet as AtlasPetDSL,
  AtlasStateBinding,
  SpriteEvent,
  SpriteProgram,
  SpriteState
} from "@nuwa-pet/character-protocol";
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

  // 渲染尺寸：每帧大小默认就是 cell；如果上层指定 width/height，按宽度等比例缩放
  const display = useMemo(() => {
    if (!atlas) return { w: 96, h: 96, scale: 1 };
    const cellW = atlas.cell.width;
    const cellH = atlas.cell.height;
    const w = widthOverride ?? cellW;
    const h = heightOverride ?? cellH;
    const scale = w / cellW;
    return { w, h, scale };
  }, [atlas, widthOverride, heightOverride]);

  // 状态机：复用 sprite-runtime；atlas 的 stateMachine 直接满足 StateMachineHost
  useEffect(() => {
    if (!atlas) return;
    const machine = createStateMachine({ stateMachine: atlas.stateMachine });
    machineRef.current = machine;

    let raf = 0;
    let last = performance.now();
    let frameLast = performance.now();
    let localFrame = 0;
    let prevState: SpriteState = machine.state as SpriteState;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      machine.step(delta);

      const next = forceState ?? (machine.state as SpriteState);
      if (next !== prevState) {
        prevState = next;
        localFrame = 0;
        frameLast = now;
        setFrameIndex(0);
        setState(next);
      } else if (next !== state) {
        setState(next);
      }

      const binding =
        atlas.states[next] ?? atlas.states.idle ?? FALLBACK_BINDING;
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
    // 故意只在 atlas / forceState 改变时重建；state 是它的输出，不放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, forceState]);

  // 外部事件接入
  useEffect(() => {
    if (!externalEvent) return;
    machineRef.current?.send(externalEvent.kind);
  }, [externalEvent]);

  if (!atlas) return null;

  const binding = atlas.states[state] ?? atlas.states.idle ?? FALLBACK_BINDING;
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
