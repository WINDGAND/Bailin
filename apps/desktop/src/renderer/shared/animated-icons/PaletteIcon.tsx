import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const DASH_LENGTH = 70;
const DRAW_DURATION = 0.45;
const DOT_STAGGER = 0.08;

const DOTS = [
  { cx: 6.5, cy: 12.5 },
  { cx: 8.5, cy: 7.5 },
  { cx: 13.5, cy: 6.5 },
  { cx: 17.5, cy: 10.5 }
] as const;

const OUTLINE_VARIANTS: Variants = {
  normal: { strokeDashoffset: 0 },
  animate: {
    strokeDashoffset: [DASH_LENGTH, 0],
    transition: {
      duration: DRAW_DURATION,
      ease: [0.65, 0, 0.35, 1]
    }
  }
};

const DOTS_GROUP_VARIANTS: Variants = {
  normal: {},
  animate: {
    transition: {
      delayChildren: DRAW_DURATION,
      staggerChildren: DOT_STAGGER
    }
  }
};

const DOT_VARIANTS: Variants = {
  normal: { scale: 1, transition: { duration: 0.2 } },
  animate: {
    scale: [0, 1],
    transition: { damping: 10, stiffness: 300, type: "spring" }
  }
};

const PaletteIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const controls = useAnimation();
    const isAnimatingRef = useRef(false);

    const startAnimation = useCallback(async () => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      try {
        await controls.start("animate");
      } finally {
        isAnimatingRef.current = false;
      }
    }, [controls]);

    const stopAnimation = useCallback(async () => {
      isAnimatingRef.current = false;
      await controls.start("normal");
    }, [controls]);

    useImperativeHandle(ref, () => ({ startAnimation, stopAnimation }));

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
            d="M12 2a1 1 0 0 0 0 20l.25 0a1.75 1.75 0 0 0 1.4-2.8l-.3-.4a1.75 1.75 0 0 1 1.4-2.8h2.25a5 5 0 0 0 5-5 10 9 0 0 0-10-9z"
            initial="normal"
            strokeDasharray={DASH_LENGTH}
            variants={OUTLINE_VARIANTS}
          />
          <motion.g animate={controls} initial="normal" variants={DOTS_GROUP_VARIANTS}>
            {DOTS.map((dot) => (
              <motion.circle
                cx={dot.cx}
                cy={dot.cy}
                fill="currentColor"
                key={`${dot.cx}-${dot.cy}`}
                r=".5"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
                variants={DOT_VARIANTS}
              />
            ))}
          </motion.g>
        </svg>
      </AnimatedIconShell>
    );
  }
);

PaletteIcon.displayName = "PaletteIcon";

export { PaletteIcon };
