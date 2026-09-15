import type { Transition } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 100,
  damping: 12,
  mass: 0.4
};

const SlidersHorizontalIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { x2: 14 }, animate: { x2: 10 } }}
            x1="21"
            x2="14"
            y1="4"
            y2="4"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { x1: 10 }, animate: { x1: 5 } }}
            x1="10"
            x2="3"
            y1="4"
            y2="4"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { x2: 12 }, animate: { x2: 18 } }}
            x1="21"
            x2="12"
            y1="12"
            y2="12"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { x1: 8 }, animate: { x1: 13 } }}
            x1="8"
            x2="3"
            y1="12"
            y2="12"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { x2: 12 }, animate: { x2: 4 } }}
            x1="3"
            x2="12"
            y1="20"
            y2="20"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { x1: 16 }, animate: { x1: 8 } }}
            x1="16"
            x2="21"
            y1="20"
            y2="20"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x1: 14, x2: 14 },
              animate: { x1: 9, x2: 9 }
            }}
            x1="14"
            x2="14"
            y1="2"
            y2="6"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x1: 8, x2: 8 },
              animate: { x1: 14, x2: 14 }
            }}
            x1="8"
            x2="8"
            y1="10"
            y2="14"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x1: 16, x2: 16 },
              animate: { x1: 8, x2: 8 }
            }}
            x1="16"
            x2="16"
            y1="18"
            y2="22"
          />
        </svg>
      </AnimatedIconShell>
    );
  }
);

SlidersHorizontalIcon.displayName = "SlidersHorizontalIcon";

export { SlidersHorizontalIcon };
