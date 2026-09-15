export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/** Hover 触发动画；系统开了减少动态效果时保持静止。 */
export function playAnimatedIcon(
  handle: AnimatedIconHandle | null | undefined,
  reducedMotion: boolean
): void {
  if (!handle || reducedMotion) return;
  handle.startAnimation();
}

export function stopAnimatedIcon(
  handle: AnimatedIconHandle | null | undefined
): void {
  handle?.stopAnimation();
}
