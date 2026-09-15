import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle } from "./hover.js";
import { ANIMATED_ICON_STROKE, AnimatedIconShell, type AnimatedIconProps } from "./shell.js";

const WIFI_LEVELS = [
  { d: "M12 20h.01", delay: 0 },
  { d: "M8.5 16.429a5 5 0 0 1 7 0", delay: 0.1 },
  { d: "M5 12.859a10 10 0 0 1 14 0", delay: 0.2 },
  { d: "M2 8.82a15 15 0 0 1 20 0", delay: 0.3 }
] as const;

const WifiIcon = forwardRef<AnimatedIconHandle | null, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const controls = useAnimation();
    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        void (async () => {
          await controls.start("fadeOut");
          void controls.start("fadeIn");
        })();
      },
      stopAnimation: () => {
        void controls.start("fadeIn");
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
          {WIFI_LEVELS.map((level, index) => (
            <motion.path
              animate={controls}
              d={level.d}
              initial={{ opacity: 1 }}
              key={level.d}
              variants={{
                fadeOut: {
                  opacity: index === 0 ? 1 : 0,
                  transition: { duration: 0.2 }
                },
                fadeIn: {
                  opacity: 1,
                  transition: {
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    delay: level.delay
                  }
                }
              }}
            />
          ))}
        </svg>
      </AnimatedIconShell>
    );
  }
);

WifiIcon.displayName = "WifiIcon";

export { WifiIcon };
