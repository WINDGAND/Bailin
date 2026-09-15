import { cubicBezier, motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const CUSTOM_EASING = cubicBezier(0.25, 0.1, 0.25, 1);

const UndoIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
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
            d="M3 7v6h6"
            initial="normal"
            transition={{ duration: 0.6, ease: CUSTOM_EASING }}
            variants={{
              normal: { translateX: 0, translateY: 0, rotate: 0 },
              animate: {
                translateX: [0, 2.1, 0],
                translateY: [0, -1.4, 0],
                rotate: [0, 12, 0]
              }
            }}
          />
          <motion.path
            animate={controls}
            d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
            initial="normal"
            transition={{ duration: 0.6, ease: CUSTOM_EASING }}
            variants={{
              normal: { pathLength: 1 },
              animate: { pathLength: [1, 0.8, 1] }
            }}
          />
        </svg>
      </AnimatedIconShell>
    );
  }
);

UndoIcon.displayName = "UndoIcon";

export { UndoIcon };
