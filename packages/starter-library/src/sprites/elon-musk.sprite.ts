import { SCHEMA_VERSION, type SpriteProgram } from "@nuwa-pet/character-protocol";
import {
  baseAnimations,
  standardShadow,
  standardStateMachine,
  withFidgetVariants
} from "./_common-animations.js";

/**
 * Elon Musk · 96×96 高精度
 *
 * 视觉锚点：
 *   1. 长脸 + 突出下颌（比 kobe 窄、比 trump 长）
 *   2. 黑色素 T 恤 + 胸前红色 X logo（标志性）
 *   3. 深棕色短发 + 不平整发际线（轻微秃顶）
 *   4. 浅褐肤色 + 偶尔的"工程师式眯眼"
 *   5. 深蓝牛仔裤 + 黑短靴
 *
 * 专属动作：
 *   - signature: 双手在身前比划，模拟"在白板讲第一性原理"
 *   - fidget-a: 单肩 shrug（"obvious"动作）
 *   - fidget-b: 摸下巴思考（与 Kobe 的不同 —— Musk 是单手）
 */

const C = {
  outline: 0,
  shadowDark: 1,
  skinHi: 2,
  skin: 3,
  skinMid: 4,
  skinShade: 5,
  hair: 6,
  hairMid: 7,
  hairHi: 8,
  shirt: 9,
  shirtHi: 10,
  jeans: 11,
  jeansShade: 12,
  shoe: 13,
  xRed: 14,
  eyeWhite: 15
} as const;

export const elonMuskSprite: SpriteProgram = {
  schemaVersion: SCHEMA_VERSION,
  mode: "dsl",
  size: { width: 96, height: 96 },
  displayScale: 2,
  palette: [
    { name: "outline", hex: "#0a0a0a" },
    { name: "shadowDark", hex: "#000000" },
    { name: "skinHi", hex: "#f3d6b8" },
    { name: "skin", hex: "#ead0b8" },
    { name: "skinMid", hex: "#c9a988" },
    { name: "skinShade", hex: "#a78060" },
    { name: "hair", hex: "#2d2018" },
    { name: "hairMid", hex: "#3d2e22" },
    { name: "hairHi", hex: "#4d3a2a" },
    { name: "shirt", hex: "#0e0e10" },
    { name: "shirtHi", hex: "#1c1c20" },
    { name: "jeans", hex: "#324a6e" },
    { name: "jeansShade", hex: "#1c2d48" },
    { name: "shoe", hex: "#0a0a0a" },
    { name: "xRed", hex: "#e02929" },
    { name: "eyeWhite", hex: "#f5efe2" }
  ],
  dsl: {
    parts: [
      standardShadow({ outlineIndex: C.shadowDark }),

      // ============== 长裤 + 短靴 ==============
      {
        id: "legs",
        z: 0,
        shapes: [
          // 牛仔裤
          { type: "rect", x: 34, y: 60, w: 12, h: 24, paletteIndex: C.jeans },
          { type: "rect", x: 50, y: 60, w: 12, h: 24, paletteIndex: C.jeans },
          // 暗部（裤管内侧）
          { type: "rect", x: 44, y: 60, w: 2, h: 24, paletteIndex: C.jeansShade },
          { type: "rect", x: 50, y: 60, w: 2, h: 24, paletteIndex: C.jeansShade },
          // 高光（外侧）
          { type: "rect", x: 35, y: 64, w: 1, h: 16, paletteIndex: C.eyeWhite },
          { type: "rect", x: 60, y: 64, w: 1, h: 16, paletteIndex: C.eyeWhite },
          // 膝盖暗
          { type: "rect", x: 35, y: 72, w: 10, h: 1, paletteIndex: C.jeansShade },
          { type: "rect", x: 51, y: 72, w: 10, h: 1, paletteIndex: C.jeansShade },
          // 短靴
          { type: "rect", x: 32, y: 84, w: 14, h: 5, paletteIndex: C.shoe },
          { type: "rect", x: 50, y: 84, w: 14, h: 5, paletteIndex: C.shoe },
          { type: "rect", x: 32, y: 89, w: 14, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 50, y: 89, w: 14, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 黑 T 恤 ==============
      {
        id: "body",
        z: 1,
        shapes: [
          // 主体
          { type: "rect", x: 28, y: 38, w: 40, h: 24, paletteIndex: C.shirt },
          // 侧高光
          { type: "rect", x: 28, y: 40, w: 1, h: 18, paletteIndex: C.shirtHi },
          { type: "rect", x: 67, y: 40, w: 1, h: 18, paletteIndex: C.shirtHi },
          // 胸前阴影
          { type: "rect", x: 30, y: 55, w: 36, h: 5, paletteIndex: C.shadowDark },
          // 圆领领口
          { type: "rect", x: 42, y: 38, w: 12, h: 4, paletteIndex: C.skin },
          { type: "rect", x: 42, y: 38, w: 12, h: 1, paletteIndex: C.skinMid },
          // 领口描边
          { type: "rect", x: 42, y: 42, w: 12, h: 1, paletteIndex: C.outline },
          // 外轮廓
          { type: "rect", x: 28, y: 38, w: 40, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== signature: X logo（胸前左侧）==============
      {
        id: "number",
        z: 2,
        shapes: [
          // X 由两个对角矩形组成
          { type: "rect", x: 36, y: 48, w: 2, h: 2, paletteIndex: C.xRed },
          { type: "rect", x: 38, y: 50, w: 2, h: 2, paletteIndex: C.xRed },
          { type: "rect", x: 40, y: 52, w: 2, h: 2, paletteIndex: C.xRed },
          { type: "rect", x: 42, y: 50, w: 2, h: 2, paletteIndex: C.xRed },
          { type: "rect", x: 44, y: 48, w: 2, h: 2, paletteIndex: C.xRed },
          { type: "rect", x: 40, y: 50, w: 2, h: 2, paletteIndex: C.xRed }, // 中心
          { type: "rect", x: 42, y: 52, w: 2, h: 2, paletteIndex: C.xRed },
          { type: "rect", x: 38, y: 48, w: 2, h: 2, paletteIndex: C.xRed }, // 右上反对角
          { type: "rect", x: 44, y: 52, w: 2, h: 2, paletteIndex: C.xRed }
        ]
      },

      // ============== 手臂 ==============
      {
        id: "arms",
        z: 1,
        shapes: [
          // 左大臂（穿在 T 恤里）
          { type: "rect", x: 22, y: 40, w: 7, h: 14, paletteIndex: C.shirt },
          { type: "rect", x: 22, y: 40, w: 1, h: 14, paletteIndex: C.shirtHi },
          // 左前臂（露出皮肤）
          { type: "rect", x: 22, y: 54, w: 7, h: 12, paletteIndex: C.skin },
          { type: "rect", x: 22, y: 54, w: 2, h: 12, paletteIndex: C.skinMid },
          { type: "rect", x: 27, y: 56, w: 1, h: 8, paletteIndex: C.skinHi },
          // 左手
          { type: "rect", x: 23, y: 66, w: 5, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 23, y: 66, w: 1, h: 5, paletteIndex: C.skinMid },

          // 右大臂
          { type: "rect", x: 67, y: 40, w: 7, h: 14, paletteIndex: C.shirt },
          { type: "rect", x: 73, y: 40, w: 1, h: 14, paletteIndex: C.shirtHi },
          // 右前臂
          { type: "rect", x: 67, y: 54, w: 7, h: 12, paletteIndex: C.skin },
          { type: "rect", x: 72, y: 54, w: 2, h: 12, paletteIndex: C.skinMid },
          { type: "rect", x: 68, y: 56, w: 1, h: 8, paletteIndex: C.skinHi },
          // 右手
          { type: "rect", x: 68, y: 66, w: 5, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 72, y: 66, w: 1, h: 5, paletteIndex: C.skinMid }
        ]
      },

      // ============== 脖子（细长） ==============
      {
        id: "neck",
        z: 1,
        shapes: [
          { type: "rect", x: 42, y: 33, w: 12, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 42, y: 36, w: 12, h: 3, paletteIndex: C.skinMid },
          { type: "rect", x: 42, y: 33, w: 1, h: 6, paletteIndex: C.outline },
          { type: "rect", x: 53, y: 33, w: 1, h: 6, paletteIndex: C.outline }
        ]
      },

      // ============== 头（长脸） ==============
      {
        id: "head",
        z: 2,
        shapes: [
          // 颅顶（窄）
          { type: "rect", x: 34, y: 10, w: 28, h: 4, paletteIndex: C.skin },
          // 主体脸部（长 + 略窄）
          { type: "rect", x: 32, y: 14, w: 32, h: 20, paletteIndex: C.skin },
          // 左侧暗
          { type: "rect", x: 32, y: 16, w: 3, h: 16, paletteIndex: C.skinMid },
          // 右侧暗
          { type: "rect", x: 61, y: 16, w: 3, h: 16, paletteIndex: C.skinMid },
          // 颧骨高光（窄）
          { type: "rect", x: 37, y: 22, w: 3, h: 4, paletteIndex: C.skinHi },
          { type: "rect", x: 56, y: 22, w: 3, h: 4, paletteIndex: C.skinHi },
          // 长下颌（向下延伸）
          { type: "rect", x: 36, y: 30, w: 24, h: 3, paletteIndex: C.skinMid },
          { type: "rect", x: 38, y: 33, w: 20, h: 2, paletteIndex: C.skinShade },
          // 描边
          { type: "rect", x: 32, y: 14, w: 1, h: 21, paletteIndex: C.outline },
          { type: "rect", x: 63, y: 14, w: 1, h: 21, paletteIndex: C.outline },
          { type: "rect", x: 32, y: 14, w: 32, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 36, y: 35, w: 24, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 头发（深棕短发 + 微秃发际） ==============
      {
        id: "hair",
        z: 3,
        shapes: [
          // 顶部（更薄，模拟微秃）
          { type: "rect", x: 34, y: 8, w: 28, h: 3, paletteIndex: C.hair },
          // 鬓角
          { type: "rect", x: 32, y: 11, w: 3, h: 7, paletteIndex: C.hair },
          { type: "rect", x: 61, y: 11, w: 3, h: 7, paletteIndex: C.hair },
          // 后脑顶部
          { type: "rect", x: 34, y: 6, w: 28, h: 3, paletteIndex: C.hairMid },
          // 不平整发际（M 型）
          { type: "rect", x: 34, y: 11, w: 4, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 58, y: 11, w: 4, h: 2, paletteIndex: C.hair },
          // 中间稀疏的发际
          { type: "rect", x: 42, y: 11, w: 12, h: 1, paletteIndex: C.hairMid },
          // 高光
          { type: "rect", x: 40, y: 7, w: 6, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 50, y: 7, w: 6, h: 1, paletteIndex: C.hairHi }
        ]
      },

      // ============== 眉毛（粗、平直、深邃） ==============
      {
        id: "brows",
        z: 4,
        shapes: [
          // 左眉
          { type: "rect", x: 36, y: 18, w: 8, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 37, y: 17, w: 6, h: 1, paletteIndex: C.hairMid },
          // 右眉
          { type: "rect", x: 52, y: 18, w: 8, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 53, y: 17, w: 6, h: 1, paletteIndex: C.hairMid }
        ]
      },

      // ============== 眼睛（细长，专注） ==============
      {
        id: "eyes",
        z: 4,
        shapes: [
          // 左眼眼白
          { type: "rect", x: 36, y: 21, w: 8, h: 3, paletteIndex: C.eyeWhite },
          // 左瞳孔
          { type: "rect", x: 38, y: 21, w: 3, h: 3, paletteIndex: C.outline },
          { type: "rect", x: 39, y: 22, w: 1, h: 1, paletteIndex: C.eyeWhite },
          // 左眼下阴影
          { type: "rect", x: 36, y: 24, w: 8, h: 1, paletteIndex: C.skinShade },
          // 右眼眼白
          { type: "rect", x: 52, y: 21, w: 8, h: 3, paletteIndex: C.eyeWhite },
          // 右瞳孔
          { type: "rect", x: 54, y: 21, w: 3, h: 3, paletteIndex: C.outline },
          { type: "rect", x: 55, y: 22, w: 1, h: 1, paletteIndex: C.eyeWhite },
          // 右眼下阴影
          { type: "rect", x: 52, y: 24, w: 8, h: 1, paletteIndex: C.skinShade },
          // 眼角上描边
          { type: "rect", x: 36, y: 20, w: 8, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 52, y: 20, w: 8, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 鼻子（长直） ==============
      {
        id: "nose",
        z: 4,
        shapes: [
          { type: "rect", x: 46, y: 21, w: 4, h: 7, paletteIndex: C.skinMid },
          { type: "rect", x: 46, y: 27, w: 4, h: 2, paletteIndex: C.skinShade },
          { type: "rect", x: 47, y: 23, w: 2, h: 4, paletteIndex: C.skinHi }
        ]
      },

      // ============== 嘴（薄且紧抿） ==============
      {
        id: "mouth",
        z: 5,
        shapes: [
          { type: "rect", x: 42, y: 30, w: 12, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 44, y: 31, w: 8, h: 1, paletteIndex: C.skinShade }
        ]
      }
    ],
    animations: {
      ...baseAnimations({ bodyId: "body", headId: "head", eyesId: "eyes", mouthId: "mouth" }),

      // signature: 两手张开 + 头部抬高，模拟"白板上讲第一性原理"
      signature: {
        fps: 8,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", dy: 0 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -2, rotate: -3 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -4, rotate: -8 }, { partId: "head", dy: -2 }, { partId: "brows", dy: -1 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -5, rotate: -10 }, { partId: "head", dy: -2 }, { partId: "brows", dy: -2 }, { partId: "mouth", scale: 1.4 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -3, rotate: -5 }, { partId: "head", dy: -1 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "brows", dy: 0 }] }
        ]
      },

      // fidget-a: 单肩 shrug（耸肩）+ 嘴角下撇
      "fidget-a": {
        fps: 6,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", dy: 0 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -3 }, { partId: "head", dy: 1 }, { partId: "mouth", dy: 1 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -5 }, { partId: "head", dy: 1, rotate: 2 }, { partId: "mouth", dy: 1 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -3 }, { partId: "head", dy: 0 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", dy: 0, rotate: 0 }, { partId: "mouth", dy: 0 }] }
        ]
      },

      // fidget-b: 摸下巴
      "fidget-b": {
        fps: 6,
        loop: false,
        frames: [
          { duration: 5, transforms: [{ partId: "arms", dy: -2 }, { partId: "head", dy: 0 }] },
          { duration: 8, transforms: [{ partId: "arms", dy: -6 }, { partId: "head", dy: -1, rotate: -3 }, { partId: "brows", dy: -1 }] },
          { duration: 12, transforms: [{ partId: "arms", dy: -7 }, { partId: "head", dy: -1, rotate: -4 }, { partId: "brows", dy: -2 }, { partId: "eyes", dy: -1 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -3 }, { partId: "head", dy: 0 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", rotate: 0 }, { partId: "brows", dy: 0 }, { partId: "eyes", dy: 0 }] }
        ]
      },

      // talk: 嘴动 + X logo 偶尔强调
      talk: {
        fps: 11,
        loop: true,
        frames: [
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.0 }, { partId: "head", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.5 }, { partId: "head", dy: -1 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.2 }, { partId: "head", dy: 0 }, { partId: "number", scale: 1.1 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.3 }, { partId: "head", dy: -1 }] }
        ]
      }
    },
    stateMachine: withFidgetVariants(standardStateMachine())
  }
};
