import type { Transition } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const NEEDLE_TRANSITION: Transition = {
  type: "spring",
  stiffness: 160,
  damping: 17,
  mass: 1
};

const GaugeIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          <motion.path
            animate={controls}
            d="m12 14 4-4"
            initial="normal"
            transition={NEEDLE_TRANSITION}
            variants={{
              normal: { translateX: 0, translateY: 0, rotate: 0 },
              animate: { translateX: 0.5, translateY: 3, rotate: 72 }
            }}
          />
          <path d="M3.34 19a10 10 0 1 1 17.32 0" />
        </svg>
      </AnimatedIconShell>
    );
  }
);

GaugeIcon.displayName = "GaugeIcon";

export { GaugeIcon };
