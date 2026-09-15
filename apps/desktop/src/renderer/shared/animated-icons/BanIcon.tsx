import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const CIRCLE_VARIANTS: Variants = {
  normal: { opacity: 1, pathLength: 1 },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: { duration: 0.4, opacity: { duration: 0.1 } }
  }
};

const LINE_VARIANTS: Variants = {
  normal: { opacity: 1, pathLength: 1 },
  slash: {
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: { duration: 0.4, opacity: { duration: 0.1 } }
  }
};

const BanIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const controls = useAnimation();
    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        void controls.start("animate");
        void controls.start("slash", { delay: 0.5 });
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
          <motion.circle
            animate={controls}
            cx="12"
            cy="12"
            initial="normal"
            r="10"
            variants={CIRCLE_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="m4.9 4.9 14.2 14.2"
            initial="normal"
            variants={LINE_VARIANTS}
          />
        </svg>
      </AnimatedIconShell>
    );
  }
);

BanIcon.displayName = "BanIcon";

export { BanIcon };
