import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const PATH_VARIANTS: Variants = {
  normal: { y: 0, opacity: 1 },
  animate: (custom: number) => ({
    y: [0, -3, 0],
    opacity: [1, 0.35, 1],
    transition: {
      duration: 0.9,
      ease: "easeInOut",
      delay: 0.15 * custom
    }
  })
};

const CoffeeIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          style={{ overflow: "visible" }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path animate={controls} custom={2} d="M10 2v2" initial="normal" variants={PATH_VARIANTS} />
          <motion.path animate={controls} custom={4} d="M14 2v2" initial="normal" variants={PATH_VARIANTS} />
          <motion.path animate={controls} custom={0} d="M6 2v2" initial="normal" variants={PATH_VARIANTS} />
          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        </svg>
      </AnimatedIconShell>
    );
  }
);

CoffeeIcon.displayName = "CoffeeIcon";

export { CoffeeIcon };
