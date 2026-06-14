import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EmotionKind,
  LayeredPetLayer,
  SpriteEvent,
  SpriteProgram,
  SpriteState
} from "@nuwa-pet/character-protocol";
import { createStateMachine } from "@nuwa-pet/sprite-runtime";
import "./layered-pet.css";

interface LayeredPetProps {
  program: SpriteProgram;
  externalEvent?: { kind: SpriteEvent; nonce: number };
  forceState?: SpriteState;
  hatching?: boolean;
  width?: number;
  height?: number;
}

const EMOTION_MAP: Record<SpriteState, EmotionKind> = {
  idle: "neutral",
  walk: "happy",
  click: "surprised",
  drag: "surprised",
  talk: "excited",
  think: "think",
  sleep: "sleep",
  fidget: "happy"
};

const EMOTION_EMOJI: Partial<Record<EmotionKind, string>> = {
  happy: "✨",
  excited: "💬",
  think: "💭",
  sleep: "💤",
  surprised: "❗",
  love: "💖",
  focused: "🔥"
};

export function LayeredPet({
  program,
  externalEvent,
  forceState,
  hatching,
  width: widthOverride,
  height: heightOverride
}: LayeredPetProps): JSX.Element | null {
  const layered = program.layered;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const machineRef = useRef<ReturnType<typeof createStateMachine> | null>(null);
  const [state, setState] = useState<SpriteState>("idle");
  const [blink, setBlink] = useState(false);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [showSignature, setShowSignature] = useState(false);
  const walkDirRef = useRef<"left" | "right">("right");
  const fidgetActiveRef = useRef(false);

  const scale = program.displayScale;
  const w = widthOverride ?? program.size.width * scale;
  const h = heightOverride ?? program.size.height * scale;
  const scaleFactor = w / (program.size.width * program.displayScale);

  // 状态机
  useEffect(() => {
    if (!layered) return;
    const fakeDsl = {
      parts: [{ id: "root", z: 0, shapes: [] }],
      animations: {},
      stateMachine: layered.stateMachine
    };
    const machine = createStateMachine(fakeDsl);
    machineRef.current = machine;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      machine.step(delta);
      const s = forceState ?? machine.state;
      setState(s as SpriteState);
      if (s === "walk") {
        walkDirRef.current = Math.random() > 0.5 ? "right" : "left";
      }
      if (s === "fidget" && !fidgetActiveRef.current) {
        fidgetActiveRef.current = true;
        setShowSignature(true);
        window.setTimeout(() => {
          setShowSignature(false);
          machine.setFrameDone(true);
          machine.send("tick");
          machine.setFrameDone(false);
          fidgetActiveRef.current = false;
        }, 1200);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      machineRef.current = null;
    };
  }, [layered, forceState]);

  useEffect(() => {
    if (!externalEvent) return;
    machineRef.current?.send(externalEvent.kind);
    if (externalEvent.kind === "click") {
      setShowSignature(false);
      window.setTimeout(() => machineRef.current?.setFrameDone(true), 550);
    }
  }, [externalEvent]);

  // 随机眨眼
  useEffect(() => {
    if (!layered?.rig.blinkEnabled) return;
    let timer: number;
    const schedule = () => {
      const delay = 2200 + Math.random() * 4000;
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => {
          setBlink(false);
          schedule();
        }, 120);
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [layered?.rig.blinkEnabled]);

  // 眼球跟随鼠标
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!layered?.rig.eyeTracking || !rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.38;
      const dx = (e.clientX - cx) / rect.width;
      const dy = (e.clientY - cy) / rect.height;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      setPupilOffset({ x: clamp(dx) * 3, y: clamp(dy) * 2 });
    },
    [layered?.rig.eyeTracking]
  );

  if (!layered) return null;

  const emotion = EMOTION_MAP[state] ?? layered.defaultEmotion;
  const emoji = EMOTION_EMOJI[emotion];
  const signature = showSignature || state === "fidget" ? layered.signature : undefined;

  return (
    <div
      ref={rootRef}
      className={`lp-root${hatching ? " lp-hatch" : ""}`}
      data-state={state}
      data-signature={signature ?? ""}
      data-blink={blink ? "1" : "0"}
      data-walk-dir={state === "walk" ? walkDirRef.current : ""}
      onMouseMove={onMouseMove}
      style={{ width: w, height: h }}
    >
      <div className="lp-stage" style={{ width: w, height: h }}>
        {layered.layers
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((layer) => (
            <LayerView key={layer.id} layer={layer} scale={scale * scaleFactor} />
          ))}

        {layered.rig.leftEye ? (
          <Pupil
            eye={layered.rig.leftEye}
            canvasW={program.size.width}
            canvasH={program.size.height}
            scale={scale * scaleFactor}
            offset={pupilOffset}
            blink={blink}
          />
        ) : null}
        {layered.rig.rightEye ? (
          <Pupil
            eye={layered.rig.rightEye}
            canvasW={program.size.width}
            canvasH={program.size.height}
            scale={scale * scaleFactor}
            offset={pupilOffset}
            blink={blink}
          />
        ) : null}

        {signature === "sparkle"
          ? [0, 1, 2].map((i) => (
              <span
                key={i}
                className="lp-sparkle-particle"
                style={{
                  left: `${30 + i * 20}%`,
                  top: `${15 + i * 8}%`,
                  animationDelay: `${i * 0.2}s`
                }}
              />
            ))
          : null}

        {emoji && state !== "idle" ? (
          <div className={`lp-emotion lp-emotion--${emotion}`}>
            {emotion === "sleep" ? (
              <span className="lp-zzz" style={{ animationDelay: "0s" }}>
                z
              </span>
            ) : (
              emoji
            )}
            {emotion === "sleep" ? (
              <>
                <span className="lp-zzz" style={{ animationDelay: "0.8s", marginLeft: 4 }}>
                  z
                </span>
                <span className="lp-zzz" style={{ animationDelay: "1.6s", marginLeft: 4 }}>
                  z
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LayerView({
  layer,
  scale
}: {
  layer: LayeredPetLayer;
  scale: number;
}): JSX.Element {
  const base: React.CSSProperties = {
    left: layer.x * scale,
    top: layer.y * scale,
    width: layer.width * scale,
    height: layer.height * scale,
    zIndex: layer.z,
    opacity: layer.opacity ?? 1,
    transformOrigin: layer.transformOrigin
      ? `${layer.transformOrigin.x * 100}% ${layer.transformOrigin.y * 100}%`
      : "center center"
  };

  if (layer.type === "image" && layer.imageUrl) {
    const hasBg = layer.imageUrl.startsWith("http") || layer.imageUrl.includes("jpeg");
    const radius =
      layer.shape === "ellipse"
        ? "50%"
        : layer.shape === "rounded-rect"
          ? layer.borderRadius ?? 12
          : 0;
    if (layer.crop) {
      const crop = layer.crop;
      return (
        <div
          className={`lp-layer lp-layer--image lp-layer--crop${hasBg ? " lp-has-bg" : ""}`}
          data-bone={layer.bone}
          style={{
            ...base,
            overflow: "hidden",
            borderRadius: radius,
            boxShadow: layer.boxShadow
          }}
        >
          <div
            className="lp-layer-crop-source"
            style={{
              position: "absolute",
              left: `${-(crop.x / crop.w) * 100}%`,
              top: `${-(crop.y / crop.h) * 100}%`,
              width: `${(1 / crop.w) * 100}%`,
              height: `${(1 / crop.h) * 100}%`,
              backgroundImage: `url("${layer.imageUrl}")`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center"
            }}
          />
        </div>
      );
    }
    return (
      <div
        className={`lp-layer lp-layer--image${hasBg ? " lp-has-bg" : ""}`}
        data-bone={layer.bone}
        style={{
          ...base,
          backgroundImage: `url("${layer.imageUrl}")`,
          backgroundSize: layer.objectFit === "cover" ? "cover" : "contain",
          borderRadius: radius,
          boxShadow: layer.boxShadow
        }}
      />
    );
  }

  const shapeStyle: React.CSSProperties = {
    ...base,
    borderRadius:
      layer.shape === "ellipse"
        ? "50%"
        : layer.shape === "rounded-rect"
          ? layer.borderRadius ?? 8
          : 0,
    background: layer.gradient ?? layer.fill ?? "transparent",
    boxShadow: layer.boxShadow
  };

  return (
    <div
      className="lp-layer"
      data-bone={layer.bone}
      style={shapeStyle}
    />
  );
}

function Pupil({
  eye,
  canvasW,
  canvasH,
  scale,
  offset,
  blink
}: {
  eye: NonNullable<SpriteProgram["layered"]>["rig"]["leftEye"];
  canvasW: number;
  canvasH: number;
  scale: number;
  offset: { x: number; y: number };
  blink: boolean;
}): JSX.Element | null {
  if (!eye) return null;
  const size = eye.size * scale;
  const left = eye.x * canvasW * scale - size / 2;
  const top = eye.y * canvasH * scale - size / 2;
  const pupilSize = size * 0.45;

  return (
    <div
      className="lp-pupil-wrap"
      style={{
        left,
        top,
        width: size,
        height: size * 1.1,
        background: `radial-gradient(circle at 40% 35%, #fff 0%, ${eye.color} 80%)`,
        boxShadow: `inset 0 -1px 3px rgba(0,0,0,0.15)`
      }}
    >
      <div
        className="lp-pupil"
        style={{
          width: pupilSize,
          height: pupilSize,
          left: size / 2 - pupilSize / 2 + offset.x,
          top: size * 0.55 - pupilSize / 2 + offset.y,
          background: eye.pupilColor ?? "#0a0a0a",
          transform: blink ? "scaleY(0.08)" : "scaleY(1)"
        }}
      />
      <span className="lp-pupil-shine" />
    </div>
  );
}
