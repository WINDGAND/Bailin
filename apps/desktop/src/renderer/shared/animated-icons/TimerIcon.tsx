import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const HAND_VARIANTS: Variants = {
  normal: {
    rotate: 0,
    originX: "0%",
    originY: "100%",
    transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] }
  },
  animate: {
    rotate: 300,
    originX: "0%",
    originY: "100%",
    transition: { delay: 0.1, duration: 0.6, ease: [0.4, 0, 0.2, 1] }
  }
};

const BUTTON_VARIANTS: Variants = {
  normal: { scale: 1, y: 0 },
  animate: {
    scale: [0.9, 1],
    y: [0, 1, 0],
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
  }
};

const TimerIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          <motion.line
            animate={controls}
            initial="normal"
            variants={BUTTON_VARIANTS}
            x1="10"
            x2="14"
            y1="2"
            y2="2"
          />
          <circle cx="12" cy="14" r="8" />
          <motion.line
            animate={controls}
            initial="normal"
            variants={HAND_VARIANTS}
            x1="12"
            x2="15"
            y1="14"
            y2="11"
          />
        </svg>
      </AnimatedIconShell>
    );
  }
);

TimerIcon.displayName = "TimerIcon";

export { TimerIcon };
