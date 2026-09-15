import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const EyeIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
            d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
            initial="normal"
            style={{ originY: "50%" }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            variants={{
              normal: { scaleY: 1, opacity: 1 },
              animate: { scaleY: [1, 0.1, 1], opacity: [1, 0.3, 1] }
            }}
          />
          <motion.circle
            animate={controls}
            cx="12"
            cy="12"
            initial="normal"
            r="3"
            transition={{ duration: 0.4, ease: "easeInOut" }}
            variants={{
              normal: { scale: 1, opacity: 1 },
              animate: { scale: [1, 0.3, 1], opacity: [1, 0.3, 1] }
            }}
          />
        </svg>
      </AnimatedIconShell>
    );
  }
);

EyeIcon.displayName = "EyeIcon";

export { EyeIcon };
