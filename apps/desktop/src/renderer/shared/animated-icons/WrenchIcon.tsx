import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const ICON_VARIANTS: Variants = {
  normal: {
    rotate: 0,
    transition: { duration: 0.25, ease: "easeOut" }
  },
  animate: {
    rotate: [0, 12, -14, 4, 0],
    transition: {
      duration: 1.05,
      times: [0, 0.42, 0.68, 0.88, 1],
      ease: ["easeInOut", "easeInOut", "easeOut", "easeOut"]
    }
  }
};

const WrenchIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          initial="normal"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={ANIMATED_ICON_STROKE}
          style={{ transformOrigin: "90% 10%", transformBox: "fill-box" }}
          variants={ICON_VARIANTS}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </motion.svg>
      </AnimatedIconShell>
    );
  }
);

WrenchIcon.displayName = "WrenchIcon";

export { WrenchIcon };
