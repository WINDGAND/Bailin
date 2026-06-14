import type { SpriteEvent, SpriteProgram, SpriteState } from "@nuwa-pet/character-protocol";
import { LayeredPet } from "./layered-pet.js";
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
 * 统一桌宠渲染入口：layered-css（方案 B）优先，starter / 旧角色走像素 DSL。
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
  if (program.mode === "layered-css" && program.layered) {
    return (
      <LayeredPet
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
