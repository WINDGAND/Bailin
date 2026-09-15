import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const KEYS = [
  "M10 8h.01",
  "M12 12h.01",
  "M14 8h.01",
  "M16 12h.01",
  "M18 8h.01",
  "M6 8h.01",
  "M7 16h10",
  "M8 12h.01"
] as const;

const KEY_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: (i: number) => ({
    opacity: [1, 0.2, 1],
    transition: {
      duration: 0.9,
      delay: i * 0.08,
      ease: "easeInOut"
    }
  })
};

const KeyboardIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          <rect height="16" rx="2" width="20" x="2" y="4" />
          {KEYS.map((d, index) => (
            <motion.path
              animate={controls}
              custom={index}
              d={d}
              initial="normal"
              key={d}
              variants={KEY_VARIANTS}
            />
          ))}
        </svg>
      </AnimatedIconShell>
    );
  }
);

KeyboardIcon.displayName = "KeyboardIcon";

export { KeyboardIcon };
