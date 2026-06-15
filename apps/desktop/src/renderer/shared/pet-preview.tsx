import type { SpriteProgram } from "@nuwa-pet/character-protocol";
import { SpriteCanvas } from "./sprite-canvas.js";

interface PetPreviewProps {
  program: SpriteProgram;
  width: number;
  height: number;
  className?: string;
}

/**
 * 专用于列表 / 详情页缩略图。
 *
 * `AtlasPet` 是动画播放器，容器会按传入尺寸缩放整格 cell；缩略图场景如果给了
 * 非 cell 比例（如 44×44），CSS background 容易露出下一行动作。这里直接用
 * atlas 第一行第一帧做固定裁切，保证预览永远是一只完整的 idle 桌宠。
 */
export function PetPreview({
  program,
  width,
  height,
  className
}: PetPreviewProps): JSX.Element {
  if (program.mode === "atlas" && program.atlas) {
    const atlas = program.atlas;
    const cellW = atlas.cell.width;
    const cellH = atlas.cell.height;
    const sheetW = atlas.cell.width * atlas.grid.columns;
    const sheetH = atlas.cell.height * atlas.grid.rows;
    const scale = Math.min(width / cellW, height / cellH);
    const w = cellW * scale;
    const h = cellH * scale;

    return (
      <div
        className={className}
        style={{
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden"
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: w,
            height: h,
            backgroundImage: `url("${atlas.spritesheetUrl}")`,
            backgroundPosition: "0px 0px",
            backgroundSize: `${sheetW * scale}px ${sheetH * scale}px`,
            backgroundRepeat: "no-repeat",
            imageRendering: "auto",
            filter: "drop-shadow(0 6px 12px rgba(20, 24, 40, 0.16))"
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width,
        height,
        display: "grid",
        placeItems: "center",
        overflow: "hidden"
      }}
    >
      <SpriteCanvas program={program} width={width} height={height} />
    </div>
  );
}
