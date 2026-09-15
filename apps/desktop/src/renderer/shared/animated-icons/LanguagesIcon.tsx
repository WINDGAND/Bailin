import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const PATH_VARIANTS: Variants = {
  normal: { opacity: 1, pathLength: 1, pathOffset: 0 },
  animate: (custom: number) => ({
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: {
      opacity: { duration: 0.01, delay: custom * 0.1 },
      pathLength: {
        type: "spring",
        duration: 0.5,
        bounce: 0,
        delay: custom * 0.1
      }
    }
  })
};

const STROKES = [
  { d: "M7 2h1", custom: 0 },
  { d: "M2 5h12", custom: 1 },
  { d: "m4 14 6-6 3-3", custom: 2 },
  { d: "m5 8 6 6", custom: 3 },
  { d: "m22 22-5-10-5 10", custom: 3 },
  { d: "M14 18h6", custom: 3 }
] as const;

const LanguagesIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const controls = useAnimation();
    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        void controls.start("animate");
      },
      stopAnimation: () => {
        void controls.start("normal");
      }
    }));

    return (
      <AnimatedIconShell className={className} size={size} {...props}>
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={ANIMATED_ICON_STROKE}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          {STROKES.map((stroke) => (
            <motion.path
              animate={controls}
              custom={stroke.custom}
              d={stroke.d}
              initial="normal"
              key={stroke.d}
              variants={PATH_VARIANTS}
            />
          ))}
        </svg>
      </AnimatedIconShell>
    );
  }
);

LanguagesIcon.displayName = "LanguagesIcon";

export { LanguagesIcon };
