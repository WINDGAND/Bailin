import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const PATH_VARIANT: Variants = {
  normal: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0]
  }
};

const CIRCLE_VARIANT: Variants = {
  normal: {
    pathLength: 1,
    pathOffset: 0,
    scale: 1
  },
  animate: {
    pathLength: [0, 1],
    pathOffset: [1, 0],
    scale: [0.5, 1]
  }
};

const UserIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          <motion.circle
            animate={controls}
            cx="12"
            cy="8"
            initial="normal"
            r="5"
            variants={CIRCLE_VARIANT}
          />
          <motion.path
            animate={controls}
            d="M20 21a8 8 0 0 0-16 0"
            initial="normal"
            transition={{ delay: 0.2, duration: 0.4 }}
            variants={PATH_VARIANT}
          />
        </svg>
      </AnimatedIconShell>
    );
  }
);

UserIcon.displayName = "UserIcon";

export { UserIcon };
