import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const LockOpenIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          variants={{
            normal: { rotate: 0, scale: 1 },
            animate: {
              rotate: [2, 4, -2, 0],
              scale: [1.05, 0.95, 1.02, 1]
            }
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect height="11" rx="2" ry="2" width="18" x="3" y="11" />
          <motion.path
            animate={controls}
            d="M7 11V7a5 5 0 0 1 9.9-1"
            initial="normal"
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            variants={{
              normal: { pathLength: 0.8 },
              animate: { pathLength: 1 }
            }}
          />
        </motion.svg>
      </AnimatedIconShell>
    );
  }
);

LockOpenIcon.displayName = "LockOpenIcon";

export { LockOpenIcon };
