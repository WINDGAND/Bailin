import { SCHEMA_VERSION, type SpriteProgram } from "@nuwa-pet/character-protocol";
import {
  baseAnimations,
  standardShadow,
  standardStateMachine,
  withFidgetVariants
} from "./_common-animations.js";

/**
 * Kobe Bryant · 96×96 高精度
 *
 * 视觉锚点（一眼识别）：
 *   1. 湖人 24 号紫金球衣（标志性）
 *   2. 深褐肤色 + 锋利下颌
 *   3. 短卷黑发 + 干净额头
 *   4. 黑色腕带（曼巴标志）
 *   5. 专注 / 锐利的眼神
 *
 * 专属动作：
 *   - signature: mamba-pose（一只手指叉腰，另一只手指 #1，模拟"GOAT"姿势）
 *   - fidget-a: 转动手腕活动护腕
 *   - fidget-b: 抹一把下巴（专注 / 思考）
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
  jersey: 8,
  jerseyHi: 9,
  jerseyShade: 10,
  shortsHi: 11,
  shoeWhite: 12,
  shoeAccent: 13,
  goldNumber: 14,
  eyeWhite: 15
} as const;

export const kobeBryantSprite: SpriteProgram = {
  schemaVersion: SCHEMA_VERSION,
  mode: "dsl",
  size: { width: 96, height: 96 },
  displayScale: 2,
  palette: [
    { name: "outline", hex: "#0a0608" },
    { name: "shadowDark", hex: "#000000" },
    { name: "skinHi", hex: "#b88154" },
    { name: "skin", hex: "#9c6a3e" },
    { name: "skinMid", hex: "#7f5430" },
    { name: "skinShade", hex: "#5b3a20" },
    { name: "hair", hex: "#0a0608" },
    { name: "hairHi", hex: "#241814" },
    { name: "jersey", hex: "#552583" },
    { name: "jerseyHi", hex: "#6c2fa0" },
    { name: "jerseyShade", hex: "#371557" },
    { name: "shortsHi", hex: "#6c2fa0" },
    { name: "shoeWhite", hex: "#f5efe2" },
    { name: "shoeAccent", hex: "#552583" },
    { name: "goldNumber", hex: "#fdb927" },
    { name: "eyeWhite", hex: "#f5efe2" }
  ],
  dsl: {
    parts: [
      standardShadow({ outlineIndex: C.shadowDark }),

      // ============== 腿 + 短裤 + 鞋 ==============
      {
        id: "legs",
        z: 0,
        shapes: [
          // 紫色短裤主体
          { type: "rect", x: 32, y: 60, w: 14, h: 14, paletteIndex: C.jersey },
          { type: "rect", x: 50, y: 60, w: 14, h: 14, paletteIndex: C.jersey },
          // 短裤暗部
          { type: "rect", x: 32, y: 70, w: 14, h: 4, paletteIndex: C.jerseyShade },
          { type: "rect", x: 50, y: 70, w: 14, h: 4, paletteIndex: C.jerseyShade },
          // 短裤高光
          { type: "rect", x: 33, y: 62, w: 2, h: 6, paletteIndex: C.shortsHi },
          { type: "rect", x: 51, y: 62, w: 2, h: 6, paletteIndex: C.shortsHi },
          // 短裤中缝
          { type: "rect", x: 47, y: 60, w: 2, h: 12, paletteIndex: C.jerseyShade },
          // 大腿肌肉
          { type: "rect", x: 34, y: 74, w: 10, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 52, y: 74, w: 10, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 34, y: 74, w: 2, h: 6, paletteIndex: C.skinMid },
          { type: "rect", x: 52, y: 74, w: 2, h: 6, paletteIndex: C.skinMid },
          { type: "rect", x: 42, y: 76, w: 2, h: 4, paletteIndex: C.skinHi },
          { type: "rect", x: 60, y: 76, w: 2, h: 4, paletteIndex: C.skinHi },
          // 小腿
          { type: "rect", x: 35, y: 80, w: 8, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 53, y: 80, w: 8, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 35, y: 80, w: 2, h: 5, paletteIndex: C.skinMid },
          { type: "rect", x: 53, y: 80, w: 2, h: 5, paletteIndex: C.skinMid },
          // 球鞋
          { type: "rect", x: 33, y: 85, w: 12, h: 3, paletteIndex: C.shoeWhite },
          { type: "rect", x: 51, y: 85, w: 12, h: 3, paletteIndex: C.shoeWhite },
          { type: "rect", x: 33, y: 88, w: 12, h: 1, paletteIndex: C.shoeAccent },
          { type: "rect", x: 51, y: 88, w: 12, h: 1, paletteIndex: C.shoeAccent },
          // 鞋底描边
          { type: "rect", x: 32, y: 88, w: 14, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 50, y: 88, w: 14, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 背心球衣 ==============
      {
        id: "body",
        z: 1,
        shapes: [
          // 主体
          { type: "rect", x: 26, y: 40, w: 44, h: 22, paletteIndex: C.jersey },
          // 侧暗
          { type: "rect", x: 26, y: 41, w: 2, h: 20, paletteIndex: C.jerseyShade },
          { type: "rect", x: 68, y: 41, w: 2, h: 20, paletteIndex: C.jerseyShade },
          // 底暗
          { type: "rect", x: 26, y: 60, w: 44, h: 2, paletteIndex: C.jerseyShade },
          // 高光
          { type: "rect", x: 28, y: 42, w: 2, h: 12, paletteIndex: C.jerseyHi },
          { type: "rect", x: 64, y: 42, w: 2, h: 12, paletteIndex: C.jerseyHi },
          // 描边
          { type: "rect", x: 26, y: 40, w: 44, h: 1, paletteIndex: C.outline },
          // V 领（露出脖子和肌肉）
          { type: "rect", x: 42, y: 40, w: 12, h: 10, paletteIndex: C.skin },
          { type: "rect", x: 42, y: 40, w: 12, h: 2, paletteIndex: C.skinMid },
          // 领口左右描边
          { type: "rect", x: 41, y: 40, w: 1, h: 10, paletteIndex: C.outline },
          { type: "rect", x: 54, y: 40, w: 1, h: 10, paletteIndex: C.outline },
          // 肩袖镂空（背心款）露肩肌
          { type: "rect", x: 26, y: 40, w: 6, h: 4, paletteIndex: C.skin },
          { type: "rect", x: 64, y: 40, w: 6, h: 4, paletteIndex: C.skin },
          { type: "rect", x: 26, y: 40, w: 6, h: 1, paletteIndex: C.skinMid },
          { type: "rect", x: 64, y: 40, w: 6, h: 1, paletteIndex: C.skinMid }
        ]
      },

      // ============== signature: 大号 "24" ==============
      {
        id: "number",
        z: 2,
        shapes: [
          // 数字 "2"（左）
          { type: "rect", x: 32, y: 48, w: 8, h: 2, paletteIndex: C.goldNumber },
          { type: "rect", x: 38, y: 50, w: 2, h: 3, paletteIndex: C.goldNumber },
          { type: "rect", x: 32, y: 53, w: 8, h: 2, paletteIndex: C.goldNumber },
          { type: "rect", x: 32, y: 55, w: 2, h: 3, paletteIndex: C.goldNumber },
          { type: "rect", x: 32, y: 58, w: 8, h: 2, paletteIndex: C.goldNumber },
          // 数字 "4"（右）
          { type: "rect", x: 56, y: 48, w: 2, h: 7, paletteIndex: C.goldNumber },
          { type: "rect", x: 62, y: 48, w: 2, h: 12, paletteIndex: C.goldNumber },
          { type: "rect", x: 56, y: 53, w: 8, h: 2, paletteIndex: C.goldNumber }
        ]
      },

      // ============== 手臂 + 护腕（黑曼巴标识）==============
      {
        id: "arms",
        z: 1,
        shapes: [
          // 左大臂
          { type: "rect", x: 20, y: 42, w: 7, h: 14, paletteIndex: C.skin },
          { type: "rect", x: 20, y: 42, w: 2, h: 14, paletteIndex: C.skinMid },
          { type: "rect", x: 25, y: 44, w: 2, h: 8, paletteIndex: C.skinHi },
          // 左小臂
          { type: "rect", x: 18, y: 56, w: 7, h: 12, paletteIndex: C.skin },
          { type: "rect", x: 18, y: 56, w: 2, h: 12, paletteIndex: C.skinMid },
          // 左护腕（黑色）
          { type: "rect", x: 18, y: 60, w: 7, h: 3, paletteIndex: C.outline },
          { type: "rect", x: 18, y: 60, w: 7, h: 1, paletteIndex: C.hairHi },
          // 左手
          { type: "rect", x: 19, y: 68, w: 5, h: 4, paletteIndex: C.skin },

          // 右大臂
          { type: "rect", x: 69, y: 42, w: 7, h: 14, paletteIndex: C.skin },
          { type: "rect", x: 74, y: 42, w: 2, h: 14, paletteIndex: C.skinMid },
          { type: "rect", x: 70, y: 44, w: 2, h: 8, paletteIndex: C.skinHi },
          // 右小臂
          { type: "rect", x: 71, y: 56, w: 7, h: 12, paletteIndex: C.skin },
          { type: "rect", x: 76, y: 56, w: 2, h: 12, paletteIndex: C.skinMid },
          // 右护腕
          { type: "rect", x: 71, y: 60, w: 7, h: 3, paletteIndex: C.outline },
          { type: "rect", x: 71, y: 60, w: 7, h: 1, paletteIndex: C.hairHi },
          // 右手
          { type: "rect", x: 72, y: 68, w: 5, h: 4, paletteIndex: C.skin }
        ]
      },

      // ============== 脖子（粗壮） ==============
      {
        id: "neck",
        z: 1,
        shapes: [
          { type: "rect", x: 41, y: 36, w: 14, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 41, y: 39, w: 14, h: 2, paletteIndex: C.skinMid },
          { type: "rect", x: 41, y: 36, w: 1, h: 5, paletteIndex: C.outline },
          { type: "rect", x: 54, y: 36, w: 1, h: 5, paletteIndex: C.outline }
        ]
      },

      // ============== 头部（棱角分明的下颌） ==============
      {
        id: "head",
        z: 2,
        shapes: [
          // 头顶 / 颅骨
          { type: "rect", x: 32, y: 10, w: 32, h: 4, paletteIndex: C.skin },
          // 主体脸部
          { type: "rect", x: 30, y: 14, w: 36, h: 22, paletteIndex: C.skin },
          // 左侧暗
          { type: "rect", x: 30, y: 16, w: 3, h: 18, paletteIndex: C.skinMid },
          // 右侧暗
          { type: "rect", x: 63, y: 16, w: 3, h: 18, paletteIndex: C.skinMid },
          // 颧骨高光
          { type: "rect", x: 35, y: 22, w: 4, h: 3, paletteIndex: C.skinHi },
          { type: "rect", x: 57, y: 22, w: 4, h: 3, paletteIndex: C.skinHi },
          // 下颌阴影（锋利的曼巴下颌线）
          { type: "rect", x: 32, y: 32, w: 32, h: 2, paletteIndex: C.skinMid },
          { type: "rect", x: 34, y: 34, w: 28, h: 2, paletteIndex: C.skinShade },
          // 描边（脸轮廓）
          { type: "rect", x: 30, y: 14, w: 1, h: 22, paletteIndex: C.outline },
          { type: "rect", x: 65, y: 14, w: 1, h: 22, paletteIndex: C.outline },
          { type: "rect", x: 30, y: 14, w: 36, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 32, y: 36, w: 32, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 头发（短黑卷发） ==============
      {
        id: "hair",
        z: 3,
        shapes: [
          // 顶发主体
          { type: "rect", x: 30, y: 6, w: 36, h: 6, paletteIndex: C.hair },
          // 鬓角
          { type: "rect", x: 30, y: 12, w: 2, h: 8, paletteIndex: C.hair },
          { type: "rect", x: 64, y: 12, w: 2, h: 8, paletteIndex: C.hair },
          // 前额发际线（不平整，更真实）
          { type: "rect", x: 32, y: 12, w: 5, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 40, y: 12, w: 4, h: 1, paletteIndex: C.hair },
          { type: "rect", x: 48, y: 12, w: 4, h: 1, paletteIndex: C.hair },
          { type: "rect", x: 56, y: 12, w: 4, h: 2, paletteIndex: C.hair },
          // 高光（顶部反光）
          { type: "rect", x: 36, y: 7, w: 8, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 52, y: 7, w: 8, h: 1, paletteIndex: C.hairHi },
          // 头顶描边
          { type: "rect", x: 30, y: 6, w: 36, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 眉毛（锐利） ==============
      {
        id: "brows",
        z: 4,
        shapes: [
          // 左眉（向下倾斜，专注感）
          { type: "rect", x: 35, y: 19, w: 8, h: 2, paletteIndex: C.outline },
          { type: "rect", x: 37, y: 18, w: 4, h: 1, paletteIndex: C.outline },
          // 右眉
          { type: "rect", x: 53, y: 19, w: 8, h: 2, paletteIndex: C.outline },
          { type: "rect", x: 55, y: 18, w: 4, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 眼睛 ==============
      {
        id: "eyes",
        z: 4,
        shapes: [
          // 左眼眼白
          { type: "rect", x: 35, y: 22, w: 7, h: 4, paletteIndex: C.eyeWhite },
          // 左瞳孔
          { type: "rect", x: 37, y: 22, w: 3, h: 4, paletteIndex: C.outline },
          { type: "rect", x: 38, y: 23, w: 1, h: 1, paletteIndex: C.eyeWhite },
          // 左眼下睫毛阴影
          { type: "rect", x: 35, y: 26, w: 7, h: 1, paletteIndex: C.skinMid },
          // 右眼眼白
          { type: "rect", x: 54, y: 22, w: 7, h: 4, paletteIndex: C.eyeWhite },
          // 右瞳孔
          { type: "rect", x: 56, y: 22, w: 3, h: 4, paletteIndex: C.outline },
          { type: "rect", x: 57, y: 23, w: 1, h: 1, paletteIndex: C.eyeWhite },
          // 右眼下睫毛阴影
          { type: "rect", x: 54, y: 26, w: 7, h: 1, paletteIndex: C.skinMid },
          // 眼角描边
          { type: "rect", x: 35, y: 22, w: 7, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 54, y: 22, w: 7, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 鼻子 ==============
      {
        id: "nose",
        z: 4,
        shapes: [
          { type: "rect", x: 46, y: 23, w: 4, h: 6, paletteIndex: C.skinMid },
          { type: "rect", x: 46, y: 28, w: 4, h: 2, paletteIndex: C.skinShade },
          { type: "rect", x: 47, y: 25, w: 2, h: 3, paletteIndex: C.skinHi }
        ]
      },

      // ============== 嘴（紧抿，专注的曼巴脸） ==============
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

      // signature: Mamba pose —— 头微抬 + 单手指 #1 + 眉毛上扬
      signature: {
        fps: 8,
        loop: false,
        frames: [
          { duration: 6, transforms: [{ partId: "head", dy: -2, rotate: -3 }, { partId: "brows", dy: -1 }, { partId: "arms", dy: -3, rotate: -5 }, { partId: "number", scale: 1.1 }] },
          { duration: 8, transforms: [{ partId: "head", dy: -3, rotate: -3 }, { partId: "brows", dy: -2 }, { partId: "arms", dy: -5, rotate: -8 }, { partId: "number", scale: 1.2 }] },
          { duration: 12, transforms: [{ partId: "head", dy: -3, rotate: -3 }, { partId: "brows", dy: -2 }, { partId: "arms", dy: -6, rotate: -8 }, { partId: "number", scale: 1.2 }] },
          { duration: 6, transforms: [{ partId: "head", dy: -2, rotate: -1 }, { partId: "brows", dy: -1 }, { partId: "arms", dy: -3, rotate: -4 }, { partId: "number", scale: 1.1 }] },
          { duration: 4, transforms: [{ partId: "head", dy: 0, rotate: 0 }, { partId: "brows", dy: 0 }, { partId: "arms", dy: 0, rotate: 0 }, { partId: "number", scale: 1.0 }] }
        ]
      },

      // fidget-a: 转手腕（活动护腕）
      "fidget-a": {
        fps: 8,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", rotate: 0 }] },
          { duration: 6, transforms: [{ partId: "arms", rotate: 8 }] },
          { duration: 6, transforms: [{ partId: "arms", rotate: -8 }] },
          { duration: 6, transforms: [{ partId: "arms", rotate: 4 }] },
          { duration: 4, transforms: [{ partId: "arms", rotate: 0 }] }
        ]
      },

      // fidget-b: 抹下巴（思考）
      "fidget-b": {
        fps: 6,
        loop: false,
        frames: [
          { duration: 6, transforms: [{ partId: "arms", dy: -2 }, { partId: "head", dy: -1 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -4 }, { partId: "head", dy: -2, rotate: -2 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -4 }, { partId: "head", dy: -2, rotate: 2 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -2 }, { partId: "head", dy: -1 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", dy: 0, rotate: 0 }] }
        ]
      },

      // talk: 头点 + 嘴动 + 数字闪
      talk: {
        fps: 12,
        loop: true,
        frames: [
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.0 }, { partId: "head", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.6 }, { partId: "head", dy: -1 }, { partId: "number", scale: 1.05 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.3 }, { partId: "head", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.4 }, { partId: "head", dy: -1 }, { partId: "number", scale: 1.05 }] }
        ]
      }
    },
    stateMachine: withFidgetVariants(standardStateMachine())
  }
};
