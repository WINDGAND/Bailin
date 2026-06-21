import { useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useNuwa } from "../shared/use-nuwa.js";
import { useRafThrottle } from "../shared/use-raf-throttle.js";

type ResizeEdge = "e" | "s" | "se";

interface DragState {
  edge: ResizeEdge;
  startScreenX: number;
  startScreenY: number;
  startWidth: number;
  startHeight: number;
}

const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

/**
 * 无边框聊天窗的边缘缩放把手（右 / 下 / 右下角）。
 * 尺寸变更走主进程 setContentBounds + 内存中的 chatWindowSize，避免 DPI 漂移。
 */
export function ChatResizeHandles(): JSX.Element {
  const nuwa = useNuwa();
  const dragRef = useRef<DragState | null>(null);

  // rAF 节流 IPC 调用：高频 pointermove（每秒 60+）只发最后一帧的尺寸。
  // 拖完时再发一次 final（onPointerEnd 内调），保证最终尺寸落地。
  const resizeIpc = useRafThrottle((width: number, height: number) => {
    void nuwa.chat.resize({ width, height });
  });

  const onPointerDown = useCallback(
    (edge: ResizeEdge, e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      void nuwa.chat.getSize().then(({ width, height }) => {
        dragRef.current = {
          edge,
          startScreenX: e.screenX,
          startScreenY: e.screenY,
          startWidth: width,
          startHeight: height
        };
      });
    },
    [nuwa]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = dragRef.current;
      if (!s) return;
      let width = s.startWidth;
      let height = s.startHeight;
      if (s.edge === "e" || s.edge === "se") {
        width = s.startWidth + (e.screenX - s.startScreenX);
      }
      if (s.edge === "s" || s.edge === "se") {
        height = s.startHeight + (e.screenY - s.startScreenY);
      }
      resizeIpc(width, height);
    },
    [resizeIpc]
  );

  const onPointerEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // useRafThrottle 会在下一帧把最后一次参数 flush 给 IPC，
    // 组件挂载期间无需额外手动 flush。
    dragRef.current = null;
  }, []);

  const edgeBase: CSSProperties = {
    position: "absolute",
    zIndex: 20,
    touchAction: "none",
    ...NO_DRAG
  };

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          ...edgeBase,
          top: 8,
          right: 0,
          width: 8,
          bottom: 8,
          cursor: "ew-resize"
        }}
        onPointerDown={(e) => onPointerDown("e", e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
      <div
        aria-hidden="true"
        style={{
          ...edgeBase,
          left: 8,
          right: 8,
          bottom: 0,
          height: 8,
          cursor: "ns-resize"
        }}
        onPointerDown={(e) => onPointerDown("s", e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
      <div
        aria-hidden="true"
        style={{
          ...edgeBase,
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: "nwse-resize"
        }}
        onPointerDown={(e) => onPointerDown("se", e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
    </>
  );
}
