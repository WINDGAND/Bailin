import { useEffect, useState } from "react";

/**
 * 监听 prefers-reduced-motion 系统设置；可在组件渲染时直接拿到当前值，
 * 用户切换系统设置时会自动更新。
 *
 * 使用场景：
 * - 用 setTimeout 锁定 UI 状态时（如桌宠 hatch 800ms），需要 reduce 用户立即解锁
 * - 入场动画依赖时序（aria-live region 出现时），需要按 reduce 用户跳过动画
 * - 自动消失计时器（toast / proactive bubble），reduce 用户需要更长阅读时间
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
