import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const RAYS = [
  "M12 2v2",
  "M12 20v2",
  "m4.9 4.9 1.4 1.4",
  "m17.7 17.7 1.4 1.4",
  "M2 12h2",
  "M20 12h2",
  "m6.3 17.7-1.4 1.4",
  "m19.1 4.9-1.4 1.4"
] as const;

const SUN_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, -5, 5, -2, 2, 0],
    transition: {
      duration: 1.5,
      ease: "easeInOut"
    }
  }
};

const RAY_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: (i: number) => ({
    opacity: [0, 1],
    transition: { delay: i * 0.1, duration: 0.3 }
  })
};

const SunMoonIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const sunControls = useAnimation();
    const rayControls = useAnimation();
    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        void sunControls.start("animate");
        void rayControls.start("animate");
      },
      stopAnimation: () => {
        void sunControls.start("normal");
        void rayControls.start("normal");
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
          <motion.g animate={sunControls} initial="normal" variants={SUN_VARIANTS}>
            <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
          </motion.g>
          {RAYS.map((d, index) => (
            <motion.path
              animate={rayControls}
              custom={index + 1}
              d={d}
              initial="normal"
              key={d}
              variants={RAY_VARIANTS}
            />
          ))}
        </svg>
      </AnimatedIconShell>
    );
  }
);

SunMoonIcon.displayName = "SunMoonIcon";

export { SunMoonIcon };
