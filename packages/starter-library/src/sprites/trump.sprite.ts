import { SCHEMA_VERSION, type SpriteProgram } from "@nuwa-pet/character-protocol";
import {
  baseAnimations,
  standardShadow,
  standardStateMachine,
  withFidgetVariants
} from "./_common-animations.js";

/**
 * Donald Trump · 96×96 高精度
 *
 * 视觉锚点：
 *   1. 圆胖大头 + 圆下巴（与 Kobe / Musk 形成强烈反差）
 *   2. 金色梳背发型 + 前额一缕 + 后扫尾（最具识别度）
 *   3. 深蓝色西装 + 白衬衫 + 红蓝拼色长领带（拖到腹前）
 *   4. 红润肤色 + 嘴角微抿
 *   5. 短粗手指 + 较壮的身躯
 *
 * 专属动作：
 *   - signature: 强势竖起大拇指 + 头部抬高 + 领带轻摆（标志性"thumbs up + 自信"）
 *   - fidget-a: 双手张开，比划"believe me"
 *   - fidget-b: 紧握拳头敲击空气（"tremendous!"）
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
  suit: 9,
  suitShade: 10,
  shirt: 11,
  tieRed: 12,
  tieRedHi: 13,
  tieBlue: 14,
  eyeWhite: 15
} as const;

export const trumpSprite: SpriteProgram = {
  schemaVersion: SCHEMA_VERSION,
  mode: "dsl",
  size: { width: 96, height: 96 },
  displayScale: 2,
  palette: [
    { name: "outline", hex: "#171717" },
    { name: "shadowDark", hex: "#0a0a0a" },
    { name: "skinHi", hex: "#f8cc94" },
    { name: "skin", hex: "#efb476" },
    { name: "skinMid", hex: "#d09154" },
    { name: "skinShade", hex: "#a16e3a" },
    { name: "hair", hex: "#e2b14a" },
    { name: "hairHi", hex: "#fbe27a" },
    { name: "hairShade", hex: "#a8842e" },
    { name: "suit", hex: "#1c2d57" },
    { name: "suitShade", hex: "#0e1a37" },
    { name: "shirt", hex: "#f5efe2" },
    { name: "tieRed", hex: "#b41e2f" },
    { name: "tieRedHi", hex: "#e23a4a" },
    { name: "tieBlue", hex: "#1c2d57" },
    { name: "eyeWhite", hex: "#ffffff" }
  ],
  dsl: {
    parts: [
      standardShadow({ outlineIndex: C.shadowDark }),

      // ============== 西裤 + 皮鞋 ==============
      {
        id: "legs",
        z: 0,
        shapes: [
          // 西裤
          { type: "rect", x: 32, y: 62, w: 14, h: 22, paletteIndex: C.suit },
          { type: "rect", x: 50, y: 62, w: 14, h: 22, paletteIndex: C.suit },
          // 暗部内侧
          { type: "rect", x: 32, y: 62, w: 3, h: 22, paletteIndex: C.suitShade },
          { type: "rect", x: 50, y: 62, w: 3, h: 22, paletteIndex: C.suitShade },
          // 中缝
          { type: "rect", x: 47, y: 62, w: 2, h: 22, paletteIndex: C.suitShade },
          // 高光
          { type: "rect", x: 44, y: 66, w: 1, h: 14, paletteIndex: C.shirt },
          { type: "rect", x: 62, y: 66, w: 1, h: 14, paletteIndex: C.shirt },
          // 皮鞋
          { type: "rect", x: 30, y: 84, w: 16, h: 5, paletteIndex: C.outline },
          { type: "rect", x: 50, y: 84, w: 16, h: 5, paletteIndex: C.outline },
          { type: "rect", x: 32, y: 85, w: 4, h: 1, paletteIndex: C.shirt }, // 皮鞋反光
          { type: "rect", x: 52, y: 85, w: 4, h: 1, paletteIndex: C.shirt }
        ]
      },

      // ============== 西装外套（宽厚） ==============
      {
        id: "body",
        z: 1,
        shapes: [
          // 西装主体（宽）
          { type: "rect", x: 22, y: 38, w: 52, h: 26, paletteIndex: C.suit },
          // 侧暗
          { type: "rect", x: 22, y: 40, w: 3, h: 22, paletteIndex: C.suitShade },
          { type: "rect", x: 71, y: 40, w: 3, h: 22, paletteIndex: C.suitShade },
          // 底暗
          { type: "rect", x: 22, y: 62, w: 52, h: 2, paletteIndex: C.suitShade },
          // 白衬衫开口（V）
          { type: "rect", x: 40, y: 38, w: 16, h: 14, paletteIndex: C.shirt },
          // 衬衫暗
          { type: "rect", x: 40, y: 38, w: 16, h: 1, paletteIndex: C.skinMid },
          // 翻领（左右两片）
          { type: "rect", x: 32, y: 38, w: 8, h: 14, paletteIndex: C.suitShade },
          { type: "rect", x: 56, y: 38, w: 8, h: 14, paletteIndex: C.suitShade },
          { type: "rect", x: 31, y: 39, w: 1, h: 12, paletteIndex: C.outline },
          { type: "rect", x: 64, y: 39, w: 1, h: 12, paletteIndex: C.outline },
          // 西装扣
          { type: "rect", x: 47, y: 56, w: 2, h: 2, paletteIndex: C.hair },
          // 描边
          { type: "rect", x: 22, y: 38, w: 52, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== signature: 红蓝拼色长领带 ==============
      {
        id: "number",
        z: 2,
        shapes: [
          // 领带结
          { type: "rect", x: 44, y: 38, w: 8, h: 4, paletteIndex: C.tieRed },
          { type: "rect", x: 44, y: 38, w: 8, h: 1, paletteIndex: C.tieRedHi },
          // 上半红
          { type: "rect", x: 43, y: 42, w: 10, h: 10, paletteIndex: C.tieRed },
          // 红色高光
          { type: "rect", x: 44, y: 43, w: 2, h: 8, paletteIndex: C.tieRedHi },
          // 中间过渡
          { type: "rect", x: 43, y: 52, w: 10, h: 2, paletteIndex: C.tieBlue },
          // 下半蓝（拖到腹前）
          { type: "rect", x: 43, y: 54, w: 10, h: 16, paletteIndex: C.tieBlue },
          // 蓝色高光
          { type: "rect", x: 44, y: 56, w: 2, h: 12, paletteIndex: C.suit },
          // 领带尖
          { type: "rect", x: 45, y: 70, w: 6, h: 2, paletteIndex: C.tieBlue },
          { type: "rect", x: 46, y: 72, w: 4, h: 1, paletteIndex: C.tieBlue },
          // 描边
          { type: "rect", x: 42, y: 38, w: 1, h: 34, paletteIndex: C.outline },
          { type: "rect", x: 53, y: 38, w: 1, h: 34, paletteIndex: C.outline }
        ]
      },

      // ============== 手臂（壮硕） ==============
      {
        id: "arms",
        z: 1,
        shapes: [
          // 左大臂（西装袖）
          { type: "rect", x: 16, y: 42, w: 8, h: 18, paletteIndex: C.suit },
          { type: "rect", x: 16, y: 42, w: 2, h: 18, paletteIndex: C.suitShade },
          // 左袖口（白衬衫）
          { type: "rect", x: 16, y: 60, w: 8, h: 2, paletteIndex: C.shirt },
          // 左手（短粗）
          { type: "rect", x: 17, y: 62, w: 6, h: 7, paletteIndex: C.skin },
          { type: "rect", x: 17, y: 62, w: 1, h: 7, paletteIndex: C.skinMid },

          // 右大臂
          { type: "rect", x: 72, y: 42, w: 8, h: 18, paletteIndex: C.suit },
          { type: "rect", x: 78, y: 42, w: 2, h: 18, paletteIndex: C.suitShade },
          // 右袖口
          { type: "rect", x: 72, y: 60, w: 8, h: 2, paletteIndex: C.shirt },
          // 右手
          { type: "rect", x: 73, y: 62, w: 6, h: 7, paletteIndex: C.skin },
          { type: "rect", x: 78, y: 62, w: 1, h: 7, paletteIndex: C.skinMid }
        ]
      },

      // ============== 脖子（粗短） ==============
      {
        id: "neck",
        z: 1,
        shapes: [
          { type: "rect", x: 40, y: 33, w: 16, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 40, y: 36, w: 16, h: 3, paletteIndex: C.skinMid }
        ]
      },

      // ============== 头部（圆胖） ==============
      {
        id: "head",
        z: 2,
        shapes: [
          // 顶
          { type: "rect", x: 30, y: 10, w: 36, h: 4, paletteIndex: C.skin },
          // 主体（圆 + 宽）
          { type: "rect", x: 28, y: 14, w: 40, h: 20, paletteIndex: C.skin },
          // 左暗
          { type: "rect", x: 28, y: 16, w: 4, h: 14, paletteIndex: C.skinMid },
          // 右暗
          { type: "rect", x: 64, y: 16, w: 4, h: 14, paletteIndex: C.skinMid },
          // 脸颊高光（圆润）
          { type: "rect", x: 33, y: 24, w: 5, h: 4, paletteIndex: C.skinHi },
          { type: "rect", x: 58, y: 24, w: 5, h: 4, paletteIndex: C.skinHi },
          // 脸颊红晕（特朗普的标志性气色）
          { type: "rect", x: 34, y: 27, w: 4, h: 2, paletteIndex: C.tieRed },
          { type: "rect", x: 58, y: 27, w: 4, h: 2, paletteIndex: C.tieRed },
          // 下颌（圆下巴）
          { type: "rect", x: 32, y: 30, w: 32, h: 4, paletteIndex: C.skinMid },
          { type: "rect", x: 36, y: 32, w: 24, h: 2, paletteIndex: C.skinShade },
          // 描边
          { type: "rect", x: 28, y: 14, w: 1, h: 20, paletteIndex: C.outline },
          { type: "rect", x: 67, y: 14, w: 1, h: 20, paletteIndex: C.outline },
          { type: "rect", x: 30, y: 10, w: 36, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 32, y: 34, w: 32, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 头发（标志性金色梳背 + 前额一缕） ==============
      {
        id: "hair",
        z: 3,
        shapes: [
          // 后侧蓬松头发（高于头顶）
          { type: "rect", x: 28, y: 2, w: 40, h: 5, paletteIndex: C.hair },
          // 后扫尾
          { type: "rect", x: 26, y: 4, w: 4, h: 10, paletteIndex: C.hair },
          { type: "rect", x: 66, y: 4, w: 4, h: 10, paletteIndex: C.hair },
          // 顶部铺平
          { type: "rect", x: 28, y: 7, w: 40, h: 3, paletteIndex: C.hair },
          // 前额标志一缕（从右往左拨）
          { type: "rect", x: 30, y: 10, w: 36, h: 3, paletteIndex: C.hair },
          { type: "rect", x: 28, y: 13, w: 12, h: 2, paletteIndex: C.hair },
          // 高光（梳痕）
          { type: "rect", x: 32, y: 3, w: 30, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 34, y: 5, w: 26, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 36, y: 8, w: 22, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 36, y: 11, w: 22, h: 1, paletteIndex: C.hairHi },
          // 暗部
          { type: "rect", x: 28, y: 6, w: 3, h: 6, paletteIndex: C.hairShade },
          { type: "rect", x: 65, y: 6, w: 3, h: 6, paletteIndex: C.hairShade },
          // 头顶描边
          { type: "rect", x: 28, y: 2, w: 40, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 眉毛（厚平、淡色） ==============
      {
        id: "brows",
        z: 4,
        shapes: [
          // 左眉（金色，比头发稍浅）
          { type: "rect", x: 34, y: 18, w: 10, h: 2, paletteIndex: C.hairShade },
          { type: "rect", x: 35, y: 17, w: 8, h: 1, paletteIndex: C.hair },
          // 右眉
          { type: "rect", x: 52, y: 18, w: 10, h: 2, paletteIndex: C.hairShade },
          { type: "rect", x: 53, y: 17, w: 8, h: 1, paletteIndex: C.hair }
        ]
      },

      // ============== 眼睛（圆 + 细长，特朗普式眯眼） ==============
      {
        id: "eyes",
        z: 4,
        shapes: [
          // 左眼眼白
          { type: "rect", x: 34, y: 21, w: 9, h: 3, paletteIndex: C.eyeWhite },
          // 左瞳（蓝色）
          { type: "rect", x: 37, y: 21, w: 3, h: 3, paletteIndex: C.tieBlue },
          { type: "rect", x: 38, y: 22, w: 1, h: 1, paletteIndex: C.eyeWhite },
          // 左眼下阴影
          { type: "rect", x: 34, y: 24, w: 9, h: 1, paletteIndex: C.skinShade },
          // 右眼眼白
          { type: "rect", x: 53, y: 21, w: 9, h: 3, paletteIndex: C.eyeWhite },
          // 右瞳
          { type: "rect", x: 56, y: 21, w: 3, h: 3, paletteIndex: C.tieBlue },
          { type: "rect", x: 57, y: 22, w: 1, h: 1, paletteIndex: C.eyeWhite },
          { type: "rect", x: 53, y: 24, w: 9, h: 1, paletteIndex: C.skinShade },
          // 上眼睑
          { type: "rect", x: 34, y: 20, w: 9, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 53, y: 20, w: 9, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 鼻子（宽厚） ==============
      {
        id: "nose",
        z: 4,
        shapes: [
          { type: "rect", x: 45, y: 22, w: 6, h: 7, paletteIndex: C.skinMid },
          { type: "rect", x: 45, y: 27, w: 6, h: 2, paletteIndex: C.skinShade },
          { type: "rect", x: 46, y: 24, w: 4, h: 3, paletteIndex: C.skinHi }
        ]
      },

      // ============== 嘴（撅起，标志性 Trump pout） ==============
      {
        id: "mouth",
        z: 5,
        shapes: [
          { type: "rect", x: 41, y: 30, w: 14, h: 2, paletteIndex: C.outline },
          // 撅起的下唇
          { type: "rect", x: 43, y: 31, w: 10, h: 2, paletteIndex: C.tieRed },
          { type: "rect", x: 44, y: 31, w: 8, h: 1, paletteIndex: C.tieRedHi }
        ]
      }
    ],
    animations: {
      ...baseAnimations({ bodyId: "body", headId: "head", eyesId: "eyes", mouthId: "mouth" }),

      // signature: 强势竖起大拇指 + 头部抬高 + 领带轻摆
      signature: {
        fps: 8,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0 }, { partId: "number", rotate: 0 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -3, rotate: -3 }, { partId: "head", dy: -2 }, { partId: "brows", dy: -1 }, { partId: "number", rotate: -2 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -6, rotate: -8 }, { partId: "head", dy: -3, rotate: -2 }, { partId: "brows", dy: -2 }, { partId: "number", rotate: -4 }] },
          { duration: 14, transforms: [{ partId: "arms", dy: -8, rotate: -10 }, { partId: "head", dy: -3, rotate: -3 }, { partId: "brows", dy: -2 }, { partId: "number", rotate: -4 }, { partId: "mouth", scale: 1.2 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -4, rotate: -5 }, { partId: "head", dy: -1 }, { partId: "number", rotate: -2 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0, rotate: 0 }, { partId: "brows", dy: 0 }, { partId: "number", rotate: 0 } ] }
        ]
      },

      // fidget-a: 双手张开比划"believe me"
      "fidget-a": {
        fps: 6,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -3, rotate: -6 }, { partId: "head", dy: -1 }] },
          { duration: 10, transforms: [{ partId: "arms", dy: -4, rotate: -10 }, { partId: "head", dy: -1, rotate: 1 }, { partId: "mouth", scale: 1.2 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -3, rotate: -6 }, { partId: "head", dy: 0 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", rotate: 0 }] }
        ]
      },

      // fidget-b: 紧握拳头敲击空气
      "fidget-b": {
        fps: 8,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", dy: 0 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: -4 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: 2 }, { partId: "head", dy: 1 }, { partId: "brows", dy: 0 }, { partId: "mouth", scale: 1.3 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: -4 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: 2 }, { partId: "head", dy: 1 }, { partId: "mouth", scale: 1.3 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "head", dy: 0 }, { partId: "brows", dy: 0 }] }
        ]
      },

      // talk: 嘴动 + 头点 + 领带摆动
      talk: {
        fps: 12,
        loop: true,
        frames: [
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.0 }, { partId: "head", dy: 0 }, { partId: "number", rotate: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.6 }, { partId: "head", dy: -1 }, { partId: "number", rotate: -2 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.3 }, { partId: "head", dy: 0 }, { partId: "number", rotate: 2 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.4 }, { partId: "head", dy: -1 }, { partId: "number", rotate: 0 }] }
        ]
      }
    },
    stateMachine: withFidgetVariants(standardStateMachine())
  }
};
