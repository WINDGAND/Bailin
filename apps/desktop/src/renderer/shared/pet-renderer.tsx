import type { SpriteEvent, SpriteProgram, SpriteState } from "@nuwa-pet/character-protocol";
import { AtlasPet } from "./atlas-pet.js";
import { SpriteCanvas } from "./sprite-canvas.js";

interface PetRendererProps {
  program: SpriteProgram;
  forceState?: SpriteState;
  externalEvent?: { kind: SpriteEvent; nonce: number };
  hatching?: boolean;
  onClick?: () => void;
  width?: number;
  height?: number;
}

/**
 * 统一桌宠渲染入口：
 *   atlas         → hatch-pet 兼容精灵图集（首选高质量路径）
 *   dsl / sandbox → starter / 旧角色走像素 DSL Canvas
 */
export function PetRenderer({
  program,
  forceState,
  externalEvent,
  hatching,
  onClick,
  width,
  height
}: PetRendererProps): JSX.Element {
  if (program.mode === "atlas" && program.atlas) {
    return (
      <AtlasPet
        program={program}
        forceState={forceState}
        externalEvent={externalEvent}
        hatching={hatching}
        width={width}
        height={height}
      />
    );
  }
  return (
    <SpriteCanvas
      program={program}
      forceState={forceState}
      externalEvent={externalEvent}
      onClick={onClick}
      width={width}
      height={height}
    />
  );
}
