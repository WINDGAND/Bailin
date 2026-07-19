export type StartViewTransition = (update: () => void) => unknown;

/**
 * 将 DOM 更新交给浏览器的 View Transition 管理。
 * 不支持时立即更新，保持 Electron 旧内核的功能正确性。
 */
export function runDetailTransition(
  update: () => void,
  startViewTransition?: StartViewTransition
): void {
  if (startViewTransition) {
    startViewTransition(update);
    return;
  }
  update();
}
