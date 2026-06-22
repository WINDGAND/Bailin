import type { SpriteDSL } from "@bailin/character-protocol";

/**
 * DSL 程序化 sprite 的共用动画 / 状态机 / 影子工厂。
 * sprite-builder 与手写 starter 复用 idle / walk / talk 等通用动作。
 *
 * 设计：96×96 画布下，位移单位是"像素"，所以 dy: -2 = 2px。
 */

type AnimationMap = SpriteDSL["animations"];

interface BaseAnimationOptions {
  bodyId: string;
  headId: string;
  eyesId: string;
  mouthId: string;
}

export function baseAnimations(opts: BaseAnimationOptions): AnimationMap {
  const { bodyId, headId, eyesId, mouthId } = opts;
  return {
    idle: {
      fps: 6,
      loop: true,
      frames: [
        { duration: 8, transforms: [{ partId: bodyId, dy: 0 }, { partId: headId, dy: 0 }] },
        { duration: 8, transforms: [{ partId: bodyId, dy: 0 }, { partId: headId, dy: -1 }] },
        { duration: 10, transforms: [{ partId: bodyId, dy: -1 }, { partId: headId, dy: -2 }] },
        { duration: 8, transforms: [{ partId: bodyId, dy: -1 }, { partId: headId, dy: -1 }] },
        { duration: 8, transforms: [{ partId: bodyId, dy: 0 }, { partId: headId, dy: 0 }] },
        { duration: 8, transforms: [{ partId: bodyId, dy: 1 }, { partId: headId, dy: 0 }] },
        { duration: 10, transforms: [{ partId: bodyId, dy: 1 }, { partId: headId, dy: 1 }] },
        { duration: 8, transforms: [{ partId: bodyId, dy: 0 }, { partId: headId, dy: 0 }] }
      ]
    },
    "idle-blink": {
      fps: 12,
      loop: true,
      frames: [
        { duration: 60, transforms: [{ partId: eyesId, visible: true }] },
        { duration: 3, transforms: [{ partId: eyesId, visible: false }] },
        { duration: 2, transforms: [{ partId: eyesId, visible: true }] },
        { duration: 2, transforms: [{ partId: eyesId, visible: false }] },
        { duration: 90, transforms: [{ partId: eyesId, visible: true }] }
      ]
    },
    "walk-left": {
      fps: 10,
      loop: true,
      frames: [
        { duration: 4, transforms: [{ partId: bodyId, dx: -1, dy: 0 }, { partId: headId, dx: -1 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: -2, dy: -2 }, { partId: headId, dx: -2, dy: -2 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: -2, dy: 0 }, { partId: headId, dx: -2 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: -1, dy: 2 }, { partId: headId, dx: -1 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: 0, dy: 0 }, { partId: headId, dx: 0 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: 1, dy: -2 }, { partId: headId, dx: 1, dy: -2 }] }
      ]
    },
    "walk-right": {
      fps: 10,
      loop: true,
      frames: [
        { duration: 4, transforms: [{ partId: bodyId, dx: 1, dy: 0 }, { partId: headId, dx: 1 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: 2, dy: -2 }, { partId: headId, dx: 2, dy: -2 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: 2, dy: 0 }, { partId: headId, dx: 2 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: 1, dy: 2 }, { partId: headId, dx: 1 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: 0, dy: 0 }, { partId: headId, dx: 0 }] },
        { duration: 4, transforms: [{ partId: bodyId, dx: -1, dy: -2 }, { partId: headId, dx: -1, dy: -2 }] }
      ]
    },
    drag: {
      fps: 8,
      loop: true,
      frames: [
        { duration: 4, transforms: [{ partId: bodyId, dy: -4 }, { partId: headId, dy: -4 }, { partId: eyesId, scale: 1.2 }] },
        { duration: 4, transforms: [{ partId: bodyId, dy: -6 }, { partId: headId, dy: -6 }, { partId: eyesId, dy: -1 }] },
        { duration: 4, transforms: [{ partId: bodyId, dy: -5 }, { partId: headId, dy: -5 }, { partId: eyesId, dy: 0 }] }
      ]
    },
    talk: {
      fps: 12,
      loop: true,
      frames: [
        { duration: 3, transforms: [{ partId: mouthId, scale: 1.0 }, { partId: headId, dy: 0 }] },
        { duration: 3, transforms: [{ partId: mouthId, scale: 1.6 }, { partId: headId, dy: -1 }] },
        { duration: 3, transforms: [{ partId: mouthId, scale: 1.3 }, { partId: headId, dy: 0 }] },
        { duration: 3, transforms: [{ partId: mouthId, scale: 1.0 }, { partId: headId, dy: 1 }] },
        { duration: 3, transforms: [{ partId: mouthId, scale: 1.4 }, { partId: headId, dy: 0 }] }
      ]
    },
    think: {
      fps: 5,
      loop: true,
      frames: [
        { duration: 10, transforms: [{ partId: headId, dy: 0, rotate: 0 }, { partId: eyesId, dy: 0 }] },
        { duration: 10, transforms: [{ partId: headId, dy: -1, rotate: -4 }, { partId: eyesId, dy: -1 }] },
        { duration: 14, transforms: [{ partId: headId, dy: -2, rotate: -6 }, { partId: eyesId, dy: -1 }] },
        { duration: 10, transforms: [{ partId: headId, dy: -1, rotate: -2 }, { partId: eyesId, dy: 0 }] }
      ]
    },
    sleep: {
      fps: 2,
      loop: true,
      frames: [
        { duration: 30, transforms: [{ partId: eyesId, visible: false }, { partId: bodyId, dy: 2 }, { partId: headId, dy: 3, rotate: -8 }] },
        { duration: 30, transforms: [{ partId: eyesId, visible: false }, { partId: bodyId, dy: 1 }, { partId: headId, dy: 2, rotate: -6 }] },
        { duration: 30, transforms: [{ partId: eyesId, visible: false }, { partId: bodyId, dy: 3 }, { partId: headId, dy: 4, rotate: -10 }] }
      ]
    },
    "click-reaction": {
      fps: 14,
      loop: false,
      frames: [
        { duration: 2, transforms: [{ partId: bodyId, dy: -4 }, { partId: headId, dy: -5 }] },
        { duration: 2, transforms: [{ partId: bodyId, dy: -6 }, { partId: headId, dy: -8 }] },
        { duration: 2, transforms: [{ partId: bodyId, dy: -3 }, { partId: headId, dy: -4 }] },
        { duration: 2, transforms: [{ partId: bodyId, dy: 0 }, { partId: headId, dy: -1 }] },
        { duration: 2, transforms: [{ partId: bodyId, dy: 1 }, { partId: headId, dy: 0 }] },
        { duration: 2, transforms: [{ partId: bodyId, dy: 0 }, { partId: headId, dy: 0 }] }
      ]
    }
  };
}

export function standardStateMachine(): SpriteDSL["stateMachine"] {
  return {
    initial: "idle",
    states: {
      idle: {
        animation: "idle",
        transitions: [
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" },
          { on: "dragStart", to: "drag" },
          { on: "screenLock", to: "sleep" },
          { on: "tick", to: "walk", guard: "rand() < 0.006" },
          { on: "tick", to: "fidget", guard: "rand() < 0.003" },
          { on: "tick", to: "sleep", guard: "idleSeconds > 120" }
        ]
      },
      walk: {
        animation: "walk-right",
        transitions: [
          { on: "tick", to: "idle", guard: "arrived()" },
          { on: "tick", to: "idle", guard: "rand() < 0.02" },
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" },
          { on: "dragStart", to: "drag" }
        ]
      },
      click: {
        animation: "click-reaction",
        transitions: [{ on: "tick", to: "idle", guard: "frameDone()" }]
      },
      drag: {
        animation: "drag",
        transitions: [{ on: "dragEnd", to: "idle" }]
      },
      talk: {
        animation: "talk",
        transitions: [
          { on: "chatClose", to: "idle" },
          { on: "responseEnd", to: "idle" }
        ]
      },
      think: {
        animation: "think",
        transitions: [{ on: "responseStart", to: "talk" }]
      },
      sleep: {
        animation: "sleep",
        transitions: [
          { on: "screenUnlock", to: "idle" },
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" }
        ]
      },
      fidget: {
        animation: "fidget-a",
        transitions: [
          { on: "tick", to: "idle", guard: "frameDone()" },
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" },
          { on: "dragStart", to: "drag" }
        ]
      }
    }
  };
}

export function standardShadow(palette: { outlineIndex: number }) {
  return {
    id: "shadow",
    z: -1,
    shapes: [
      { type: "rect" as const, x: 28, y: 88, w: 40, h: 2, paletteIndex: palette.outlineIndex },
      { type: "rect" as const, x: 24, y: 89, w: 48, h: 2, paletteIndex: palette.outlineIndex },
      { type: "rect" as const, x: 30, y: 91, w: 36, h: 1, paletteIndex: palette.outlineIndex }
    ]
  };
}

export function withFidgetVariants(
  sm: ReturnType<typeof standardStateMachine>
): ReturnType<typeof standardStateMachine> {
  return {
    initial: sm.initial,
    states: {
      ...sm.states,
      fidget: {
        animation: "fidget-a",
        transitions: [
          { on: "tick", to: "idle", guard: "frameDone()" },
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" },
          { on: "dragStart", to: "drag" }
        ]
      }
    }
  };
}
