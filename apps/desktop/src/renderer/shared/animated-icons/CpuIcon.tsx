import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const TRANSITION: Transition = {
  duration: 0.5,
  ease: "easeInOut",
  repeat: 1
};

const PIN_STYLE = { transformBox: "fill-box" as const, transformOrigin: "center" };

const Y_VARIANTS: Variants = {
  normal: {
    scale: 1,
    rotate: 0,
    opacity: 1
  },
  animate: {
    scaleY: [1, 1.5, 1],
    opacity: [1, 0.8, 1]
  }
};

const X_VARIANTS: Variants = {
  normal: {
    scale: 1,
    rotate: 0,
    opacity: 1
  },
  animate: {
    scaleX: [1, 1.5, 1],
    opacity: [1, 0.8, 1]
  }
};

const CpuIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          <rect height="16" rx="2" width="16" x="4" y="4" />
          <rect height="6" rx="1" width="6" x="9" y="9" />
          <motion.path
            animate={controls}
            d="M15 2v2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M15 20v2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M2 15h2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M2 9h2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M20 15h2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M20 9h2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M9 2v2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M9 20v2"
            initial="normal"
            style={PIN_STYLE}
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
        </svg>
      </AnimatedIconShell>
    );
  }
);

CpuIcon.displayName = "CpuIcon";

export { CpuIcon };
