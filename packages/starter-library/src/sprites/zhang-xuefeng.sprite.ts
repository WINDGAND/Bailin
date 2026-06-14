import { SCHEMA_VERSION, type SpriteProgram } from "@nuwa-pet/character-protocol";
import {
  baseAnimations,
  standardShadow,
  standardStateMachine,
  withFidgetVariants
} from "./_common-animations.js";

/**
 * 张雪峰 · 96×96 高精度
 *
 * 视觉锚点：
 *   1. 黑框矩形眼镜（最强识别符号）
 *   2. 黑色西装 + 黑色衬衫（标志性"教学全黑"配色）
 *   3. 中等身材 + 圆短下巴
 *   4. 黑色板寸短发
 *   5. 嘴角微张（讲课中）
 *
 * 专属动作：
 *   - signature: 食指敲桌讲课 + 眼镜反光闪
 *   - fidget-a: 推一下眼镜
 *   - fidget-b: 双手叉腰（教学姿势）
 */

const C = {
  outline: 0,
  shadowDark: 1,
  skinHi: 2,
  skin: 3,
  skinMid: 4,
  skinShade: 5,
  hair: 6,
  hairHi: 7,
  suit: 8,
  suitHi: 9,
  suitShade: 10,
  shirt: 11,
  glassesFrame: 12,
  glassesShine: 13,
  redTie: 14,
  eyeWhite: 15
} as const;

export const zhangXuefengSprite: SpriteProgram = {
  schemaVersion: SCHEMA_VERSION,
  mode: "dsl",
  size: { width: 96, height: 96 },
  displayScale: 2,
  palette: [
    { name: "outline", hex: "#0a0a0a" },
    { name: "shadowDark", hex: "#000000" },
    { name: "skinHi", hex: "#fbdfb8" },
    { name: "skin", hex: "#eec39a" },
    { name: "skinMid", hex: "#cba07a" },
    { name: "skinShade", hex: "#9f7855" },
    { name: "hair", hex: "#0a0a0a" },
    { name: "hairHi", hex: "#2a2620" },
    { name: "suit", hex: "#171717" },
    { name: "suitHi", hex: "#2a2a2a" },
    { name: "suitShade", hex: "#000000" },
    { name: "shirt", hex: "#1f1f1f" },
    { name: "glassesFrame", hex: "#0a0a0a" },
    { name: "glassesShine", hex: "#d8d8d8" },
    { name: "redTie", hex: "#b41e2f" },
    { name: "eyeWhite", hex: "#f5efe2" }
  ],
  dsl: {
    parts: [
      standardShadow({ outlineIndex: C.shadowDark }),

      // ============== 西裤 + 皮鞋 ==============
      {
        id: "legs",
        z: 0,
        shapes: [
          { type: "rect", x: 32, y: 62, w: 14, h: 22, paletteIndex: C.suit },
          { type: "rect", x: 50, y: 62, w: 14, h: 22, paletteIndex: C.suit },
          // 暗
          { type: "rect", x: 32, y: 62, w: 3, h: 22, paletteIndex: C.suitShade },
          { type: "rect", x: 50, y: 62, w: 3, h: 22, paletteIndex: C.suitShade },
          { type: "rect", x: 47, y: 62, w: 2, h: 22, paletteIndex: C.suitShade },
          // 高光（裤缝）
          { type: "rect", x: 44, y: 66, w: 1, h: 14, paletteIndex: C.suitHi },
          { type: "rect", x: 62, y: 66, w: 1, h: 14, paletteIndex: C.suitHi },
          // 皮鞋
          { type: "rect", x: 30, y: 84, w: 16, h: 5, paletteIndex: C.outline },
          { type: "rect", x: 50, y: 84, w: 16, h: 5, paletteIndex: C.outline },
          // 鞋面反光
          { type: "rect", x: 32, y: 85, w: 5, h: 1, paletteIndex: C.suitHi },
          { type: "rect", x: 52, y: 85, w: 5, h: 1, paletteIndex: C.suitHi }
        ]
      },

      // ============== 黑西装外套 ==============
      {
        id: "body",
        z: 1,
        shapes: [
          { type: "rect", x: 24, y: 38, w: 48, h: 26, paletteIndex: C.suit },
          // 侧暗
          { type: "rect", x: 24, y: 40, w: 3, h: 22, paletteIndex: C.suitShade },
          { type: "rect", x: 69, y: 40, w: 3, h: 22, paletteIndex: C.suitShade },
          // 底暗
          { type: "rect", x: 24, y: 62, w: 48, h: 2, paletteIndex: C.suitShade },
          // 高光
          { type: "rect", x: 28, y: 42, w: 1, h: 18, paletteIndex: C.suitHi },
          { type: "rect", x: 67, y: 42, w: 1, h: 18, paletteIndex: C.suitHi },
          // 黑衬衫 V 开口（比西装稍浅）
          { type: "rect", x: 40, y: 38, w: 16, h: 14, paletteIndex: C.shirt },
          // 翻领
          { type: "rect", x: 32, y: 38, w: 8, h: 14, paletteIndex: C.suitShade },
          { type: "rect", x: 56, y: 38, w: 8, h: 14, paletteIndex: C.suitShade },
          { type: "rect", x: 31, y: 39, w: 1, h: 12, paletteIndex: C.outline },
          { type: "rect", x: 64, y: 39, w: 1, h: 12, paletteIndex: C.outline },
          // 西装扣
          { type: "rect", x: 47, y: 56, w: 2, h: 2, paletteIndex: C.glassesShine },
          // 描边
          { type: "rect", x: 24, y: 38, w: 48, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== signature: 红色细领带（醒目对比） ==============
      {
        id: "number",
        z: 2,
        shapes: [
          // 领带结
          { type: "rect", x: 45, y: 38, w: 6, h: 3, paletteIndex: C.redTie },
          // 领带主体
          { type: "rect", x: 45, y: 41, w: 6, h: 18, paletteIndex: C.redTie },
          // 高光
          { type: "rect", x: 46, y: 42, w: 1, h: 14, paletteIndex: C.glassesShine },
          // 领带尖
          { type: "rect", x: 46, y: 59, w: 4, h: 2, paletteIndex: C.redTie },
          // 描边
          { type: "rect", x: 44, y: 38, w: 1, h: 23, paletteIndex: C.outline },
          { type: "rect", x: 51, y: 38, w: 1, h: 23, paletteIndex: C.outline }
        ]
      },

      // ============== 手臂 ==============
      {
        id: "arms",
        z: 1,
        shapes: [
          // 左大臂
          { type: "rect", x: 18, y: 42, w: 7, h: 18, paletteIndex: C.suit },
          { type: "rect", x: 18, y: 42, w: 2, h: 18, paletteIndex: C.suitShade },
          // 左袖口（黑衬衫）
          { type: "rect", x: 18, y: 60, w: 7, h: 2, paletteIndex: C.shirt },
          // 左手
          { type: "rect", x: 19, y: 62, w: 5, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 19, y: 62, w: 1, h: 6, paletteIndex: C.skinMid },

          // 右大臂
          { type: "rect", x: 71, y: 42, w: 7, h: 18, paletteIndex: C.suit },
          { type: "rect", x: 76, y: 42, w: 2, h: 18, paletteIndex: C.suitShade },
          // 右袖口
          { type: "rect", x: 71, y: 60, w: 7, h: 2, paletteIndex: C.shirt },
          // 右手
          { type: "rect", x: 72, y: 62, w: 5, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 76, y: 62, w: 1, h: 6, paletteIndex: C.skinMid }
        ]
      },

      // ============== 脖子 ==============
      {
        id: "neck",
        z: 1,
        shapes: [
          { type: "rect", x: 41, y: 33, w: 14, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 41, y: 36, w: 14, h: 3, paletteIndex: C.skinMid }
        ]
      },

      // ============== 头部（方圆，下颌饱满） ==============
      {
        id: "head",
        z: 2,
        shapes: [
          { type: "rect", x: 32, y: 10, w: 32, h: 4, paletteIndex: C.skin },
          { type: "rect", x: 30, y: 14, w: 36, h: 20, paletteIndex: C.skin },
          // 左暗
          { type: "rect", x: 30, y: 16, w: 3, h: 16, paletteIndex: C.skinMid },
          // 右暗
          { type: "rect", x: 63, y: 16, w: 3, h: 16, paletteIndex: C.skinMid },
          // 颧骨高光
          { type: "rect", x: 35, y: 24, w: 4, h: 3, paletteIndex: C.skinHi },
          { type: "rect", x: 57, y: 24, w: 4, h: 3, paletteIndex: C.skinHi },
          // 下颌
          { type: "rect", x: 33, y: 30, w: 30, h: 4, paletteIndex: C.skinMid },
          { type: "rect", x: 37, y: 32, w: 22, h: 2, paletteIndex: C.skinShade },
          // 描边
          { type: "rect", x: 30, y: 14, w: 1, h: 20, paletteIndex: C.outline },
          { type: "rect", x: 65, y: 14, w: 1, h: 20, paletteIndex: C.outline },
          { type: "rect", x: 30, y: 14, w: 36, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 32, y: 34, w: 32, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 头发（板寸短发） ==============
      {
        id: "hair",
        z: 3,
        shapes: [
          // 顶部
          { type: "rect", x: 30, y: 6, w: 36, h: 6, paletteIndex: C.hair },
          // 鬓角
          { type: "rect", x: 30, y: 12, w: 2, h: 6, paletteIndex: C.hair },
          { type: "rect", x: 64, y: 12, w: 2, h: 6, paletteIndex: C.hair },
          // 前额（平直，无刘海）
          { type: "rect", x: 32, y: 12, w: 32, h: 2, paletteIndex: C.hair },
          // 高光
          { type: "rect", x: 36, y: 7, w: 8, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 52, y: 7, w: 8, h: 1, paletteIndex: C.hairHi },
          // 描边
          { type: "rect", x: 30, y: 6, w: 36, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 眉毛（粗黑） ==============
      {
        id: "brows",
        z: 4,
        shapes: [
          { type: "rect", x: 34, y: 18, w: 9, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 53, y: 18, w: 9, h: 2, paletteIndex: C.hair }
        ]
      },

      // ============== signature: 黑框眼镜 ==============
      {
        id: "glasses",
        z: 5,
        shapes: [
          // 左镜框（厚黑框）
          { type: "rect", x: 33, y: 21, w: 11, h: 7, paletteIndex: C.glassesFrame },
          // 左镜片（白底高光）
          { type: "rect", x: 35, y: 23, w: 7, h: 3, paletteIndex: C.glassesShine },
          // 右镜框
          { type: "rect", x: 52, y: 21, w: 11, h: 7, paletteIndex: C.glassesFrame },
          // 右镜片
          { type: "rect", x: 54, y: 23, w: 7, h: 3, paletteIndex: C.glassesShine },
          // 鼻梁
          { type: "rect", x: 44, y: 23, w: 8, h: 2, paletteIndex: C.glassesFrame },
          // 镜腿
          { type: "rect", x: 30, y: 22, w: 3, h: 1, paletteIndex: C.glassesFrame },
          { type: "rect", x: 63, y: 22, w: 3, h: 1, paletteIndex: C.glassesFrame }
        ]
      },

      // ============== 眼睛（在镜片后） ==============
      {
        id: "eyes",
        z: 4,
        shapes: [
          // 左瞳（穿过镜片）
          { type: "rect", x: 37, y: 24, w: 2, h: 2, paletteIndex: C.outline },
          // 右瞳
          { type: "rect", x: 56, y: 24, w: 2, h: 2, paletteIndex: C.outline }
        ]
      },

      // ============== 鼻子 ==============
      {
        id: "nose",
        z: 4,
        shapes: [
          { type: "rect", x: 46, y: 24, w: 4, h: 6, paletteIndex: C.skinMid },
          { type: "rect", x: 46, y: 28, w: 4, h: 2, paletteIndex: C.skinShade },
          { type: "rect", x: 47, y: 26, w: 2, h: 2, paletteIndex: C.skinHi }
        ]
      },

      // ============== 嘴（讲课中，微张） ==============
      {
        id: "mouth",
        z: 5,
        shapes: [
          { type: "rect", x: 43, y: 31, w: 10, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 45, y: 32, w: 6, h: 1, paletteIndex: C.skinShade }
        ]
      }
    ],
    animations: {
      ...baseAnimations({ bodyId: "body", headId: "head", eyesId: "eyes", mouthId: "mouth" }),

      // signature: 食指敲桌讲课 + 眼镜反光闪
      signature: {
        fps: 10,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "glasses", scale: 1.0 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -4, rotate: -6 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -2, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "glasses", scale: 1.05 }, { partId: "mouth", scale: 1.4 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: -4, rotate: -6 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -2, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "glasses", scale: 1.05 }, { partId: "mouth", scale: 1.4 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "brows", dy: 0 }, { partId: "glasses", scale: 1.0 } ] }
        ]
      },

      // fidget-a: 推眼镜
      "fidget-a": {
        fps: 8,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "glasses", dy: 0 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -4 }, { partId: "head", dy: 0 }, { partId: "glasses", dy: 1 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -6 }, { partId: "head", dy: 0 }, { partId: "glasses", dy: 0 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: -2 }, { partId: "glasses", dy: -1 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "glasses", dy: 0 }] }
        ]
      },

      // fidget-b: 双手叉腰（教学姿势）
      "fidget-b": {
        fps: 6,
        loop: false,
        frames: [
          { duration: 5, transforms: [{ partId: "arms", dy: 0, rotate: 0 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -2, rotate: 10 }, { partId: "head", dy: 0, rotate: 2 }] },
          { duration: 14, transforms: [{ partId: "arms", dy: -2, rotate: 14 }, { partId: "head", dy: 0, rotate: 3 }, { partId: "mouth", scale: 1.2 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -2, rotate: 10 }, { partId: "head", rotate: 1 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", rotate: 0 }] }
        ]
      },

      // talk: 嘴动 + 眼镜偶尔反光
      talk: {
        fps: 12,
        loop: true,
        frames: [
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.0 }, { partId: "head", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.5 }, { partId: "head", dy: -1 }, { partId: "glasses", scale: 1.03 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.2 }, { partId: "head", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.4 }, { partId: "head", dy: -1 }, { partId: "glasses", scale: 1.03 }] }
        ]
      }
    },
    stateMachine: withFidgetVariants(standardStateMachine())
  }
};
