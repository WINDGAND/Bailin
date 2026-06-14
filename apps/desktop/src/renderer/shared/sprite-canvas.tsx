import { useEffect, useRef } from "react";
import type {
  SpriteEvent,
  SpriteProgram,
  SpriteState
} from "@nuwa-pet/character-protocol";
import { createStateMachine, pickAnimationForState, renderSprite } from "@nuwa-pet/sprite-runtime";

interface SpriteCanvasProps {
  program: SpriteProgram;
  /** 强制状态（绕过状态机），用于展示某只角色的特定动作。 */
  forceState?: SpriteState;
  /** 外部事件计数器：每次递增就向内部状态机派一次该事件。 */
  externalEvent?: { kind: SpriteEvent; nonce: number };
  width?: number;
  height?: number;
  onClick?: () => void;
}

export function SpriteCanvas({
  program,
  forceState,
  externalEvent,
  width,
  height,
  onClick
}: SpriteCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const machineRef = useRef<ReturnType<typeof createStateMachine> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (program.mode !== "dsl" || !program.dsl) return;

    const dsl = program.dsl;
    const scale = program.displayScale;
    canvas.width = program.size.width * scale;
    canvas.height = program.size.height * scale;

    const machine = createStateMachine(dsl);
    machineRef.current = machine;
    let frameIndex = 0;
    let lastFrameAt = performance.now();
    let last = performance.now();

    function tick(now: number) {
      const delta = now - last;
      last = now;
      machine.step(delta);
      const stateKey = forceState ?? (machine.state as SpriteState);
      const anim = pickAnimationForState(dsl, stateKey);
      const animation = dsl.animations[anim] ?? dsl.animations.idle;
      if (animation) {
        const frame = animation.frames[frameIndex % animation.frames.length];
        const frameDuration = (frame?.duration ?? 4) * (1000 / Math.max(1, animation.fps));
        if (now - lastFrameAt > frameDuration) {
          frameIndex += 1;
          lastFrameAt = now;
          if (!animation.loop && frameIndex >= animation.frames.length) {
            machine.setFrameDone(true);
            machine.send("tick");
            frameIndex = 0;
            machine.setFrameDone(false);
          }
        }
      }
      renderSprite(ctx!, program, { animation: anim, frameIndex, scale });
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      machineRef.current = null;
    };
  }, [program, forceState]);

  // 外部事件分发：父组件通过递增 nonce 来"派"一次事件给内部状态机。
  useEffect(() => {
    if (!externalEvent) return;
    machineRef.current?.send(externalEvent.kind);
  }, [externalEvent]);

  return (
    <canvas
      ref={canvasRef}
      className="pixel-canvas"
      onClick={onClick}
      style={{
        width: width ?? program.size.width * program.displayScale,
        height: height ?? program.size.height * program.displayScale,
        cursor: onClick ? "pointer" : "default",
        background: "transparent"
      }}
    />
  );
}
