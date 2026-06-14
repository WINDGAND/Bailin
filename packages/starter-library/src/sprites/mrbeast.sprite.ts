import { SCHEMA_VERSION, type SpriteProgram } from "@nuwa-pet/character-protocol";
import {
  baseAnimations,
  standardShadow,
  standardStateMachine,
  withFidgetVariants
} from "./_common-animations.js";

/**
 * MrBeast (Jimmy Donaldson) · 96×96 高精度
 *
 * 视觉锚点：
 *   1. 蓝色 T 恤 + 中间黄色 "Beast" 标志（最具识别度）
 *   2. 棕色短发 + 微卷
 *   3. 圆脸 + 大眼 + 灿烂笑容
 *   4. 浅肤色 + 略红润
 *   5. 牛仔短裤 + 白色球鞋
 *
 * 专属动作：
 *   - signature: 大拇指竖起 + 张嘴大笑（"crazy!" 招牌动作）
 *   - fidget-a: 双手张开（讲个 challenge）
 *   - fidget-b: 摸头（"that was insane"）
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
  hairShade: 8,
  shirtBlue: 9,
  shirtBlueHi: 10,
  shirtBlueShade: 11,
  logoYellow: 12,
  jeans: 13,
  shoeWhite: 14,
  eyeWhite: 15
} as const;

export const mrBeastSprite: SpriteProgram = {
  schemaVersion: SCHEMA_VERSION,
  mode: "dsl",
  size: { width: 96, height: 96 },
  displayScale: 2,
  palette: [
    { name: "outline", hex: "#0a0a0a" },
    { name: "shadowDark", hex: "#000000" },
    { name: "skinHi", hex: "#fbe4c4" },
    { name: "skin", hex: "#f0caa0" },
    { name: "skinMid", hex: "#d4a378" },
    { name: "skinShade", hex: "#a17a52" },
    { name: "hair", hex: "#3d2c1c" },
    { name: "hairHi", hex: "#5a4128" },
    { name: "hairShade", hex: "#241a10" },
    { name: "shirtBlue", hex: "#1f6dd1" },
    { name: "shirtBlueHi", hex: "#3a90f5" },
    { name: "shirtBlueShade", hex: "#0e4a9c" },
    { name: "logoYellow", hex: "#f5cc1f" },
    { name: "jeans", hex: "#36537e" },
    { name: "shoeWhite", hex: "#f5efe2" },
    { name: "eyeWhite", hex: "#f5efe2" }
  ],
  dsl: {
    parts: [
      standardShadow({ outlineIndex: C.shadowDark }),

      // ============== 长裤 + 球鞋 ==============
      {
        id: "legs",
        z: 0,
        shapes: [
          { type: "rect", x: 33, y: 62, w: 12, h: 22, paletteIndex: C.jeans },
          { type: "rect", x: 51, y: 62, w: 12, h: 22, paletteIndex: C.jeans },
          { type: "rect", x: 33, y: 62, w: 3, h: 22, paletteIndex: C.shirtBlueShade },
          { type: "rect", x: 51, y: 62, w: 3, h: 22, paletteIndex: C.shirtBlueShade },
          { type: "rect", x: 43, y: 62, w: 2, h: 22, paletteIndex: C.shirtBlueShade },
          // 牛仔高光
          { type: "rect", x: 34, y: 66, w: 1, h: 14, paletteIndex: C.shirtBlueHi },
          { type: "rect", x: 61, y: 66, w: 1, h: 14, paletteIndex: C.shirtBlueHi },
          // 球鞋
          { type: "rect", x: 31, y: 84, w: 14, h: 5, paletteIndex: C.shoeWhite },
          { type: "rect", x: 51, y: 84, w: 14, h: 5, paletteIndex: C.shoeWhite },
          { type: "rect", x: 31, y: 89, w: 14, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 51, y: 89, w: 14, h: 1, paletteIndex: C.outline },
          // 鞋头红条
          { type: "rect", x: 31, y: 86, w: 14, h: 1, paletteIndex: C.shirtBlue },
          { type: "rect", x: 51, y: 86, w: 14, h: 1, paletteIndex: C.shirtBlue }
        ]
      },

      // ============== 蓝色 T 恤 ==============
      {
        id: "body",
        z: 1,
        shapes: [
          { type: "rect", x: 26, y: 38, w: 44, h: 24, paletteIndex: C.shirtBlue },
          // 侧暗
          { type: "rect", x: 26, y: 40, w: 3, h: 20, paletteIndex: C.shirtBlueShade },
          { type: "rect", x: 67, y: 40, w: 3, h: 20, paletteIndex: C.shirtBlueShade },
          // 底暗
          { type: "rect", x: 26, y: 60, w: 44, h: 2, paletteIndex: C.shirtBlueShade },
          // 高光
          { type: "rect", x: 30, y: 42, w: 2, h: 14, paletteIndex: C.shirtBlueHi },
          { type: "rect", x: 64, y: 42, w: 2, h: 14, paletteIndex: C.shirtBlueHi },
          // 圆领
          { type: "rect", x: 42, y: 38, w: 12, h: 4, paletteIndex: C.skin },
          { type: "rect", x: 42, y: 38, w: 12, h: 1, paletteIndex: C.skinMid },
          { type: "rect", x: 42, y: 42, w: 12, h: 1, paletteIndex: C.outline },
          // 外描边
          { type: "rect", x: 26, y: 38, w: 44, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== signature: Beast logo（黄色野兽爪印 + Beast 字样） ==============
      {
        id: "number",
        z: 2,
        shapes: [
          // 爪印（4 个小圆点）
          { type: "rect", x: 38, y: 48, w: 3, h: 3, paletteIndex: C.logoYellow },
          { type: "rect", x: 44, y: 46, w: 3, h: 3, paletteIndex: C.logoYellow },
          { type: "rect", x: 50, y: 48, w: 3, h: 3, paletteIndex: C.logoYellow },
          { type: "rect", x: 56, y: 48, w: 3, h: 3, paletteIndex: C.logoYellow },
          // 爪印主体（弧形）
          { type: "rect", x: 41, y: 51, w: 15, h: 4, paletteIndex: C.logoYellow },
          { type: "rect", x: 43, y: 55, w: 11, h: 2, paletteIndex: C.logoYellow },
          // 黄色描边
          { type: "rect", x: 41, y: 51, w: 15, h: 1, paletteIndex: C.shirtBlueShade }
        ]
      },

      // ============== 手臂 ==============
      {
        id: "arms",
        z: 1,
        shapes: [
          // 左大臂（穿蓝 T）
          { type: "rect", x: 20, y: 40, w: 7, h: 12, paletteIndex: C.shirtBlue },
          { type: "rect", x: 20, y: 40, w: 2, h: 12, paletteIndex: C.shirtBlueShade },
          // 左前臂（露出）
          { type: "rect", x: 20, y: 52, w: 7, h: 12, paletteIndex: C.skin },
          { type: "rect", x: 20, y: 52, w: 2, h: 12, paletteIndex: C.skinMid },
          { type: "rect", x: 25, y: 54, w: 1, h: 8, paletteIndex: C.skinHi },
          // 左手
          { type: "rect", x: 21, y: 64, w: 5, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 21, y: 64, w: 1, h: 5, paletteIndex: C.skinMid },

          // 右大臂
          { type: "rect", x: 69, y: 40, w: 7, h: 12, paletteIndex: C.shirtBlue },
          { type: "rect", x: 74, y: 40, w: 2, h: 12, paletteIndex: C.shirtBlueShade },
          // 右前臂
          { type: "rect", x: 69, y: 52, w: 7, h: 12, paletteIndex: C.skin },
          { type: "rect", x: 74, y: 52, w: 2, h: 12, paletteIndex: C.skinMid },
          { type: "rect", x: 70, y: 54, w: 1, h: 8, paletteIndex: C.skinHi },
          // 右手
          { type: "rect", x: 70, y: 64, w: 5, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 74, y: 64, w: 1, h: 5, paletteIndex: C.skinMid }
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

      // ============== 头部（圆 + 略宽，年轻感） ==============
      {
        id: "head",
        z: 2,
        shapes: [
          { type: "rect", x: 31, y: 10, w: 34, h: 4, paletteIndex: C.skin },
          { type: "rect", x: 29, y: 14, w: 38, h: 20, paletteIndex: C.skin },
          // 暗
          { type: "rect", x: 29, y: 16, w: 3, h: 16, paletteIndex: C.skinMid },
          { type: "rect", x: 64, y: 16, w: 3, h: 16, paletteIndex: C.skinMid },
          // 颧骨高光（活泼）
          { type: "rect", x: 34, y: 23, w: 5, h: 4, paletteIndex: C.skinHi },
          { type: "rect", x: 57, y: 23, w: 5, h: 4, paletteIndex: C.skinHi },
          // 脸颊红晕（年轻 / 兴奋感）
          { type: "rect", x: 35, y: 27, w: 4, h: 2, paletteIndex: C.shirtBlue },
          { type: "rect", x: 57, y: 27, w: 4, h: 2, paletteIndex: C.shirtBlue },
          // 下颌
          { type: "rect", x: 32, y: 30, w: 32, h: 4, paletteIndex: C.skinMid },
          { type: "rect", x: 36, y: 32, w: 24, h: 2, paletteIndex: C.skinShade },
          // 描边
          { type: "rect", x: 29, y: 14, w: 1, h: 20, paletteIndex: C.outline },
          { type: "rect", x: 66, y: 14, w: 1, h: 20, paletteIndex: C.outline },
          { type: "rect", x: 29, y: 14, w: 38, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 32, y: 34, w: 32, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 头发（棕色微卷短发） ==============
      {
        id: "hair",
        z: 3,
        shapes: [
          // 顶部蓬松
          { type: "rect", x: 29, y: 4, w: 38, h: 7, paletteIndex: C.hair },
          // 鬓角（短）
          { type: "rect", x: 29, y: 11, w: 3, h: 5, paletteIndex: C.hair },
          { type: "rect", x: 64, y: 11, w: 3, h: 5, paletteIndex: C.hair },
          // 不规则发际（前额碎发）
          { type: "rect", x: 31, y: 11, w: 6, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 38, y: 12, w: 4, h: 1, paletteIndex: C.hair },
          { type: "rect", x: 45, y: 11, w: 4, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 52, y: 12, w: 4, h: 1, paletteIndex: C.hair },
          { type: "rect", x: 58, y: 11, w: 6, h: 2, paletteIndex: C.hair },
          // 高光（顶部）
          { type: "rect", x: 33, y: 5, w: 8, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 47, y: 5, w: 8, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 35, y: 7, w: 6, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 50, y: 7, w: 6, h: 1, paletteIndex: C.hairHi },
          // 暗部
          { type: "rect", x: 29, y: 10, w: 3, h: 2, paletteIndex: C.hairShade },
          { type: "rect", x: 64, y: 10, w: 3, h: 2, paletteIndex: C.hairShade },
          // 头顶描边
          { type: "rect", x: 29, y: 4, w: 38, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 眉毛（略上扬，兴奋感） ==============
      {
        id: "brows",
        z: 4,
        shapes: [
          { type: "rect", x: 34, y: 18, w: 9, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 34, y: 17, w: 4, h: 1, paletteIndex: C.hair }, // 左眉外侧上扬
          { type: "rect", x: 53, y: 18, w: 9, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 58, y: 17, w: 4, h: 1, paletteIndex: C.hair } // 右眉外侧上扬
        ]
      },

      // ============== 眼睛（大、明亮） ==============
      {
        id: "eyes",
        z: 4,
        shapes: [
          // 左眼眼白（大）
          { type: "rect", x: 34, y: 21, w: 9, h: 5, paletteIndex: C.eyeWhite },
          // 左瞳（蓝色，明亮）
          { type: "rect", x: 37, y: 21, w: 4, h: 5, paletteIndex: C.shirtBlue },
          { type: "rect", x: 38, y: 22, w: 2, h: 2, paletteIndex: C.outline },
          { type: "rect", x: 38, y: 22, w: 1, h: 1, paletteIndex: C.eyeWhite }, // 反光
          // 右眼眼白
          { type: "rect", x: 53, y: 21, w: 9, h: 5, paletteIndex: C.eyeWhite },
          // 右瞳
          { type: "rect", x: 56, y: 21, w: 4, h: 5, paletteIndex: C.shirtBlue },
          { type: "rect", x: 57, y: 22, w: 2, h: 2, paletteIndex: C.outline },
          { type: "rect", x: 57, y: 22, w: 1, h: 1, paletteIndex: C.eyeWhite },
          // 上眼睑
          { type: "rect", x: 34, y: 20, w: 9, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 53, y: 20, w: 9, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 鼻子（小巧） ==============
      {
        id: "nose",
        z: 4,
        shapes: [
          { type: "rect", x: 46, y: 24, w: 4, h: 5, paletteIndex: C.skinMid },
          { type: "rect", x: 46, y: 27, w: 4, h: 2, paletteIndex: C.skinShade }
        ]
      },

      // ============== 嘴（灿烂笑容） ==============
      {
        id: "mouth",
        z: 5,
        shapes: [
          // 大笑（嘴角上扬）
          { type: "rect", x: 39, y: 30, w: 18, h: 2, paletteIndex: C.outline },
          // 嘴角
          { type: "rect", x: 38, y: 31, w: 2, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 56, y: 31, w: 2, h: 1, paletteIndex: C.outline },
          // 牙齿（白色）
          { type: "rect", x: 41, y: 31, w: 14, h: 2, paletteIndex: C.shoeWhite }
        ]
      }
    ],
    animations: {
      ...baseAnimations({ bodyId: "body", headId: "head", eyesId: "eyes", mouthId: "mouth" }),

      // signature: 大拇指 + 张嘴大笑
      signature: {
        fps: 9,
        loop: false,
        frames: [
          { duration: 3, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", dy: 0 }, { partId: "mouth", scale: 1.0 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: -4 }, { partId: "head", dy: -2 }, { partId: "mouth", scale: 1.4 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -8, rotate: -15 }, { partId: "head", dy: -3 }, { partId: "mouth", scale: 1.6 }, { partId: "eyes", scale: 0.9 }] },
          { duration: 12, transforms: [{ partId: "arms", dy: -10, rotate: -20 }, { partId: "head", dy: -3 }, { partId: "mouth", scale: 1.8 }, { partId: "eyes", scale: 0.85 }, { partId: "number", scale: 1.15 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -6, rotate: -10 }, { partId: "head", dy: -2 }, { partId: "mouth", scale: 1.5 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "mouth", scale: 1.0 }, { partId: "eyes", scale: 1.0 } ] }
        ]
      },

      // fidget-a: 双手张开（讲个 challenge）
      "fidget-a": {
        fps: 7,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -3, rotate: -8 }, { partId: "head", dy: 0 }] },
          { duration: 10, transforms: [{ partId: "arms", dy: -5, rotate: -15 }, { partId: "head", dy: -1 }, { partId: "mouth", scale: 1.5 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -5, rotate: -10 }, { partId: "head", dy: -1 }, { partId: "mouth", scale: 1.3 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "mouth", scale: 1.0 }] }
        ]
      },

      // fidget-b: 摸头（"that was insane"）
      "fidget-b": {
        fps: 6,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -6 }, { partId: "head", rotate: 3 }] },
          { duration: 10, transforms: [{ partId: "arms", dy: -10 }, { partId: "hair", dy: -1 }, { partId: "head", rotate: 5 }, { partId: "mouth", scale: 1.3 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -6 }, { partId: "head", rotate: 2 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", rotate: 0 }, { partId: "hair", dy: 0 }] }
        ]
      },

      // talk: 嘴动 + 头点 + logo 偶尔强调
      talk: {
        fps: 13,
        loop: true,
        frames: [
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.0 }, { partId: "head", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.7 }, { partId: "head", dy: -1 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.3 }, { partId: "head", dy: 0 }, { partId: "number", scale: 1.1 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.5 }, { partId: "head", dy: -1 }] }
        ]
      }
    },
    stateMachine: withFidgetVariants(standardStateMachine())
  }
};
