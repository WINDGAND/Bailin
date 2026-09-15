import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const RAYS = [
  "M12 2v2",
  "m19.07 4.93-1.41 1.41",
  "M20 12h2",
  "m17.66 17.66 1.41 1.41",
  "M12 20v2",
  "m6.34 17.66-1.41 1.41",
  "M2 12h2",
  "m4.93 4.93 1.41 1.41"
] as const;

const PATH_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: (i: number) => ({
    opacity: [0, 1],
    transition: { delay: i * 0.1, duration: 0.3 }
  })
};

const SunIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          <circle cx="12" cy="12" r="4" />
          {RAYS.map((d, index) => (
            <motion.path
              animate={controls}
              custom={index + 1}
              d={d}
              initial="normal"
              key={d}
              variants={PATH_VARIANTS}
            />
          ))}
        </svg>
      </AnimatedIconShell>
    );
  }
);

SunIcon.displayName = "SunIcon";

export { SunIcon };
