import type { SpriteDSL } from "@nuwa-pet/character-protocol";

/**
 * 共用动画 / 状态机工厂。各 starter sprite 通过 baseAnimations / standardStateMachine
 * 复用 idle 呼吸 / 眨眼 / walk / drag / sleep 等通用动作；signature 动作各角色单独覆盖。
 *
 * 设计：96×96 画布下，位移单位是"像素"，所以 dy: -2 = 2px。
 * 与旧版 48×48 相比，所有位移幅度都加大了一倍，使动作更明显。
 */

type AnimationMap = SpriteDSL["animations"];

interface BaseAnimationOptions {
  /** 身体 part id（用于呼吸 / 走路上下浮动） */
  bodyId: string;
  /** 头部 part id（用于呼吸缩放 / 思考歪头） */
  headId: string;
  /** 眼睛 part id（用于眨眼） */
  eyesId: string;
  /** 嘴 part id（用于 talk 动作） */
  mouthId: string;
}

/**
 * 标准基础动画包：idle / idle-blink / walk-left / walk-right / drag / talk / think / sleep / click-reaction。
 * 每个动画都至少 6 帧；通用动作不那么单调。
 */
export function baseAnimations(opts: BaseAnimationOptions): AnimationMap {
  const { bodyId, headId, eyesId, mouthId } = opts;
  return {
    // 8 帧呼吸：胸口起伏 + 头部跟随 + 微微左右晃
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
    // 不规则眨眼（避免节拍感）：长睁 → 闭 → 半睁 → 闭 → 长睁
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
    // 走路：上下抖动 + 头部摆动
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
    // 说话：嘴动 + 头部点头节奏
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
    // 思考：头微歪 + 眼向上
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
    // 睡眠：低头 + 闭眼 + 整体下沉
    sleep: {
      fps: 2,
      loop: true,
      frames: [
        { duration: 30, transforms: [{ partId: eyesId, visible: false }, { partId: bodyId, dy: 2 }, { partId: headId, dy: 3, rotate: -8 }] },
        { duration: 30, transforms: [{ partId: eyesId, visible: false }, { partId: bodyId, dy: 1 }, { partId: headId, dy: 2, rotate: -6 }] },
        { duration: 30, transforms: [{ partId: eyesId, visible: false }, { partId: bodyId, dy: 3 }, { partId: headId, dy: 4, rotate: -10 }] }
      ]
    },
    // 点击反弹：扎实的弹跳节奏
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

/**
 * 标准状态机：所有 starter 共用核心跳转规则。
 *
 * 关键：idle 上加 rand() guard 让桌宠**自发走动 / 触发 fidget**——
 * 这是"像活物"感的来源。
 */
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
          // 自发触发：每 tick 0.6% 概率走动；约每 ~3 秒尝试一次走动
          { on: "tick", to: "walk", guard: "rand() < 0.006" },
          // 自发触发：每 tick 0.3% 概率做一个个性化小动作
          { on: "tick", to: "fidget", guard: "rand() < 0.003" },
          // 长时间无人理：进入打瞌睡
          { on: "tick", to: "sleep", guard: "idleSeconds > 120" }
        ]
      },
      walk: {
        animation: "walk-right",
        transitions: [
          { on: "tick", to: "idle", guard: "arrived()" },
          // 走 ~2 秒后停下
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
        // 默认 fidget-a；角色没覆盖时退回 idle
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

/** 96×96 标准影子：脚下椭圆 */
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

/**
 * 在 standardStateMachine 上覆盖 fidget 的动画为 fidget-a。
 * 各角色定义自己的 fidget-a / fidget-b / signature 动画后调用一下即可。
 */
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
