import { useCallback, useEffect, useRef } from "react";

/**
 * 把高频回调（mousemove / scroll / resize / pointermove 等）节流到下一帧执行。
 *
 * 行为：
 * - 同一帧内多次调用只保留最后一次参数
 * - 下一帧 raf 时用最新参数调一次包装函数
 * - 组件 unmount 时取消尚未执行的 raf
 * - 始终调最新的 fn（用 ref 跟踪），无需把 fn 加 deps
 *
 * 使用场景：
 * - 桌宠拖拽 mousemove
 * - chat resize handle 的 IPC 调用
 * - 任何会触发 React 重渲染的高频事件
 */
export function useRafThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void
): (...args: Args) => void {
  const rafRef = useRef<number | null>(null);
  const fnRef = useRef(fn);
  const argsRef = useRef<Args | null>(null);
  fnRef.current = fn;

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  return useCallback((...args: Args) => {
    argsRef.current = args;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (argsRef.current) {
        fnRef.current(...argsRef.current);
      }
    });
  }, []);
}
