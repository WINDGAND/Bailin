import { useCallback, useRef, type RefObject } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { playAnimatedIcon, stopAnimatedIcon } from "./hover.js";

export function useHostedAnimatedIcon(reducedMotion: boolean): {
  ref: RefObject<AnimatedIconHandle | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const ref = useRef<AnimatedIconHandle | null>(null);
  const onMouseEnter = useCallback(() => {
    playAnimatedIcon(ref.current, reducedMotion);
  }, [reducedMotion]);
  const onMouseLeave = useCallback(() => {
    stopAnimatedIcon(ref.current);
  }, []);
  return { ref, onMouseEnter, onMouseLeave };
}
