import { SCHEMA_VERSION, type SpriteProgram } from "@nuwa-pet/character-protocol";
import {
  baseAnimations,
  standardShadow,
  standardStateMachine,
  withFidgetVariants
} from "./_common-animations.js";

/**
 * 艾伦·耶格尔 (Eren Yeager) · 96×96 高精度
 *
 * 视觉锚点：
 *   1. 调查兵团米褐色短外套 + 胸前蓝白翼章（最强识别符号）
 *   2. 深棕色中长马尾（动画后期标志性）+ 凌乱碎发
 *   3. 翡翠绿眼睛（最具识别度）+ 锐利眉眼
 *   4. 立体机动装置（腰间金属侧挂）
 *   5. 白色衬衫 + 棕色腰带 + 米白长裤 + 棕色长靴
 *
 * 专属动作：
 *   - signature: 单手敬军礼（右手握拳贴心 + 左手背后，《进击的巨人》调查兵团标志姿势）
 *   - fidget-a: 攥紧拳头（决心姿势）
 *   - fidget-b: 拉一下衣襟（整装）
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
  jacket: 9,
  jacketHi: 10,
  jacketShade: 11,
  shirtWhite: 12,
  pants: 13,
  eyeGreen: 14, // Eren 的标志性翡翠绿眼睛
  wingBlue: 15
} as const;
// 注：bootBrown 复用 hairShade（深棕），腾出 1 槽给翡翠绿眼睛。

export const erenYeagerSprite: SpriteProgram = {
  schemaVersion: SCHEMA_VERSION,
  mode: "dsl",
  size: { width: 96, height: 96 },
  displayScale: 2,
  palette: [
    { name: "outline", hex: "#0c0c0c" },
    { name: "shadowDark", hex: "#000000" },
    { name: "skinHi", hex: "#fcdfbb" },
    { name: "skin", hex: "#f4d4b2" },
    { name: "skinMid", hex: "#cfa680" },
    { name: "skinShade", hex: "#9b7958" },
    { name: "hair", hex: "#3b2a1e" },
    { name: "hairHi", hex: "#5c4530" },
    { name: "hairShade", hex: "#1f1610" },
    { name: "jacket", hex: "#8a6b3a" },
    { name: "jacketHi", hex: "#a88546" },
    { name: "jacketShade", hex: "#5c4624" },
    { name: "shirtWhite", hex: "#f0e8d2" },
    { name: "pants", hex: "#e7e3c8" },
    { name: "eyeGreen", hex: "#2faa66" }, // Eren 标志性翡翠绿眼
    { name: "wingBlue", hex: "#2e6fa3" } // 调查兵团翼章用色
  ],
  dsl: {
    parts: [
      standardShadow({ outlineIndex: C.shadowDark }),

      // ============== 长裤 + 长靴 ==============
      {
        id: "legs",
        z: 0,
        shapes: [
          // 米白长裤
          { type: "rect", x: 33, y: 60, w: 12, h: 16, paletteIndex: C.pants },
          { type: "rect", x: 51, y: 60, w: 12, h: 16, paletteIndex: C.pants },
          // 裤管暗
          { type: "rect", x: 33, y: 60, w: 2, h: 16, paletteIndex: C.skinShade },
          { type: "rect", x: 51, y: 60, w: 2, h: 16, paletteIndex: C.skinShade },
          { type: "rect", x: 43, y: 60, w: 2, h: 16, paletteIndex: C.skinShade },
          // 棕色长靴（高至小腿）
          { type: "rect", x: 31, y: 76, w: 16, h: 13, paletteIndex: C.hairShade },
          { type: "rect", x: 49, y: 76, w: 16, h: 13, paletteIndex: C.hairShade },
          // 靴口（深色翻边）
          { type: "rect", x: 31, y: 76, w: 16, h: 2, paletteIndex: C.hairShade },
          { type: "rect", x: 49, y: 76, w: 16, h: 2, paletteIndex: C.hairShade },
          // 靴面高光
          { type: "rect", x: 33, y: 80, w: 2, h: 6, paletteIndex: C.hair },
          { type: "rect", x: 51, y: 80, w: 2, h: 6, paletteIndex: C.hair },
          // 鞋底
          { type: "rect", x: 31, y: 88, w: 16, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 49, y: 88, w: 16, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 棕色腰带 ==============
      {
        id: "belt",
        z: 1,
        shapes: [
          { type: "rect", x: 26, y: 58, w: 44, h: 4, paletteIndex: C.hairShade },
          { type: "rect", x: 26, y: 60, w: 44, h: 2, paletteIndex: C.hairShade },
          // 腰带扣
          { type: "rect", x: 45, y: 58, w: 6, h: 4, paletteIndex: C.jacketHi },
          { type: "rect", x: 46, y: 59, w: 4, h: 2, paletteIndex: C.hairShade }
        ]
      },

      // ============== 调查兵团短外套 ==============
      {
        id: "body",
        z: 1,
        shapes: [
          // 主体
          { type: "rect", x: 26, y: 38, w: 44, h: 20, paletteIndex: C.jacket },
          // 侧暗
          { type: "rect", x: 26, y: 40, w: 3, h: 18, paletteIndex: C.jacketShade },
          { type: "rect", x: 67, y: 40, w: 3, h: 18, paletteIndex: C.jacketShade },
          // 底暗
          { type: "rect", x: 26, y: 56, w: 44, h: 2, paletteIndex: C.jacketShade },
          // 高光
          { type: "rect", x: 30, y: 42, w: 1, h: 14, paletteIndex: C.jacketHi },
          { type: "rect", x: 65, y: 42, w: 1, h: 14, paletteIndex: C.jacketHi },
          // 衣襟开口（V），露出白衬衫
          { type: "rect", x: 40, y: 38, w: 16, h: 18, paletteIndex: C.shirtWhite },
          // 衬衫暗
          { type: "rect", x: 40, y: 38, w: 16, h: 1, paletteIndex: C.skinMid },
          // 衬衫纽扣条（中线）
          { type: "rect", x: 47, y: 40, w: 2, h: 16, paletteIndex: C.outline },
          { type: "rect", x: 47, y: 43, w: 2, h: 1, paletteIndex: C.hairShade },
          { type: "rect", x: 47, y: 47, w: 2, h: 1, paletteIndex: C.hairShade },
          { type: "rect", x: 47, y: 51, w: 2, h: 1, paletteIndex: C.hairShade },
          // 外衣翻领
          { type: "rect", x: 36, y: 38, w: 4, h: 8, paletteIndex: C.jacketShade },
          { type: "rect", x: 56, y: 38, w: 4, h: 8, paletteIndex: C.jacketShade },
          { type: "rect", x: 35, y: 39, w: 1, h: 6, paletteIndex: C.outline },
          { type: "rect", x: 60, y: 39, w: 1, h: 6, paletteIndex: C.outline },
          // 描边
          { type: "rect", x: 26, y: 38, w: 44, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== signature: 调查兵团翼章（最强识别符号） ==============
      {
        id: "number",
        z: 2,
        shapes: [
          // 翼章底座（白底）
          { type: "rect", x: 36, y: 48, w: 24, h: 8, paletteIndex: C.shirtWhite },
          // 翼章描边
          { type: "rect", x: 35, y: 48, w: 26, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 35, y: 55, w: 26, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 35, y: 48, w: 1, h: 8, paletteIndex: C.outline },
          { type: "rect", x: 60, y: 48, w: 1, h: 8, paletteIndex: C.outline },
          // 左翼（蓝色羽毛）
          { type: "rect", x: 36, y: 50, w: 4, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 36, y: 51, w: 5, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 36, y: 52, w: 6, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 36, y: 53, w: 5, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 37, y: 54, w: 4, h: 1, paletteIndex: C.wingBlue },
          // 右翼（蓝色羽毛）
          { type: "rect", x: 56, y: 50, w: 4, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 55, y: 51, w: 5, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 54, y: 52, w: 6, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 55, y: 53, w: 5, h: 1, paletteIndex: C.wingBlue },
          { type: "rect", x: 55, y: 54, w: 4, h: 1, paletteIndex: C.wingBlue },
          // 中间交叉
          { type: "rect", x: 46, y: 49, w: 4, h: 6, paletteIndex: C.wingBlue },
          { type: "rect", x: 44, y: 51, w: 8, h: 2, paletteIndex: C.wingBlue }
        ]
      },

      // ============== 立体机动装置侧挂（gear） ==============
      {
        id: "gear-left",
        z: 1,
        shapes: [
          // 左侧金属筒
          { type: "rect", x: 16, y: 60, w: 6, h: 14, paletteIndex: C.outline },
          { type: "rect", x: 17, y: 61, w: 4, h: 12, paletteIndex: C.hairShade },
          // 高光条
          { type: "rect", x: 17, y: 62, w: 1, h: 10, paletteIndex: C.jacketHi },
          // 绑带
          { type: "rect", x: 14, y: 62, w: 10, h: 2, paletteIndex: C.jacket },
          { type: "rect", x: 14, y: 68, w: 10, h: 2, paletteIndex: C.jacket },
          // 绑带高光
          { type: "rect", x: 14, y: 62, w: 10, h: 1, paletteIndex: C.jacketHi },
          // 绑带暗
          { type: "rect", x: 14, y: 69, w: 10, h: 1, paletteIndex: C.jacketShade }
        ]
      },
      {
        id: "gear-right",
        z: 1,
        shapes: [
          // 右侧金属筒
          { type: "rect", x: 74, y: 60, w: 6, h: 14, paletteIndex: C.outline },
          { type: "rect", x: 75, y: 61, w: 4, h: 12, paletteIndex: C.hairShade },
          { type: "rect", x: 75, y: 62, w: 1, h: 10, paletteIndex: C.jacketHi },
          // 绑带
          { type: "rect", x: 72, y: 62, w: 10, h: 2, paletteIndex: C.jacket },
          { type: "rect", x: 72, y: 68, w: 10, h: 2, paletteIndex: C.jacket },
          { type: "rect", x: 72, y: 62, w: 10, h: 1, paletteIndex: C.jacketHi },
          { type: "rect", x: 72, y: 69, w: 10, h: 1, paletteIndex: C.jacketShade }
        ]
      },

      // ============== 手臂 ==============
      {
        id: "arms",
        z: 1,
        shapes: [
          // 左大臂（外套袖）
          { type: "rect", x: 21, y: 40, w: 7, h: 14, paletteIndex: C.jacket },
          { type: "rect", x: 21, y: 40, w: 2, h: 14, paletteIndex: C.jacketShade },
          // 左袖口
          { type: "rect", x: 21, y: 54, w: 7, h: 2, paletteIndex: C.jacketShade },
          // 左前臂（皮带绑带）
          { type: "rect", x: 21, y: 56, w: 7, h: 8, paletteIndex: C.jacket },
          { type: "rect", x: 21, y: 58, w: 7, h: 1, paletteIndex: C.hairShade },
          { type: "rect", x: 21, y: 62, w: 7, h: 1, paletteIndex: C.hairShade },
          // 左手
          { type: "rect", x: 22, y: 64, w: 5, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 22, y: 64, w: 1, h: 5, paletteIndex: C.skinMid },

          // 右大臂
          { type: "rect", x: 68, y: 40, w: 7, h: 14, paletteIndex: C.jacket },
          { type: "rect", x: 73, y: 40, w: 2, h: 14, paletteIndex: C.jacketShade },
          { type: "rect", x: 68, y: 54, w: 7, h: 2, paletteIndex: C.jacketShade },
          // 右前臂
          { type: "rect", x: 68, y: 56, w: 7, h: 8, paletteIndex: C.jacket },
          { type: "rect", x: 68, y: 58, w: 7, h: 1, paletteIndex: C.hairShade },
          { type: "rect", x: 68, y: 62, w: 7, h: 1, paletteIndex: C.hairShade },
          // 右手
          { type: "rect", x: 69, y: 64, w: 5, h: 5, paletteIndex: C.skin },
          { type: "rect", x: 73, y: 64, w: 1, h: 5, paletteIndex: C.skinMid }
        ]
      },

      // ============== 脖子（修长） ==============
      {
        id: "neck",
        z: 1,
        shapes: [
          { type: "rect", x: 42, y: 33, w: 12, h: 6, paletteIndex: C.skin },
          { type: "rect", x: 42, y: 36, w: 12, h: 3, paletteIndex: C.skinMid }
        ]
      },

      // ============== 头部（瓜子脸、棱角分明） ==============
      {
        id: "head",
        z: 2,
        shapes: [
          { type: "rect", x: 32, y: 10, w: 32, h: 4, paletteIndex: C.skin },
          { type: "rect", x: 30, y: 14, w: 36, h: 18, paletteIndex: C.skin },
          // 左暗
          { type: "rect", x: 30, y: 16, w: 3, h: 14, paletteIndex: C.skinMid },
          // 右暗
          { type: "rect", x: 63, y: 16, w: 3, h: 14, paletteIndex: C.skinMid },
          // 颧骨高光
          { type: "rect", x: 35, y: 22, w: 3, h: 4, paletteIndex: C.skinHi },
          { type: "rect", x: 58, y: 22, w: 3, h: 4, paletteIndex: C.skinHi },
          // 瓜子脸下颌（向下收窄）
          { type: "rect", x: 34, y: 28, w: 28, h: 3, paletteIndex: C.skinMid },
          { type: "rect", x: 38, y: 30, w: 20, h: 3, paletteIndex: C.skinShade },
          { type: "rect", x: 42, y: 32, w: 12, h: 1, paletteIndex: C.skinShade },
          // 描边
          { type: "rect", x: 30, y: 14, w: 1, h: 16, paletteIndex: C.outline },
          { type: "rect", x: 65, y: 14, w: 1, h: 16, paletteIndex: C.outline },
          { type: "rect", x: 30, y: 14, w: 36, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 36, y: 32, w: 24, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 头发（凌乱中长发 + 后脑马尾） ==============
      {
        id: "hair",
        z: 3,
        shapes: [
          // 顶部主体
          { type: "rect", x: 30, y: 4, w: 36, h: 8, paletteIndex: C.hair },
          // 鬓角（长，伸到下巴）
          { type: "rect", x: 30, y: 12, w: 3, h: 12, paletteIndex: C.hair },
          { type: "rect", x: 63, y: 12, w: 3, h: 12, paletteIndex: C.hair },
          // 凌乱前额碎发（左偏）
          { type: "rect", x: 32, y: 12, w: 8, h: 4, paletteIndex: C.hair },
          { type: "rect", x: 38, y: 15, w: 3, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 42, y: 12, w: 4, h: 3, paletteIndex: C.hair },
          { type: "rect", x: 48, y: 12, w: 4, h: 3, paletteIndex: C.hair },
          { type: "rect", x: 54, y: 12, w: 4, h: 3, paletteIndex: C.hair },
          { type: "rect", x: 58, y: 13, w: 6, h: 4, paletteIndex: C.hair },
          // 后脑长发（探出脖子，像马尾起点）
          { type: "rect", x: 28, y: 24, w: 3, h: 16, paletteIndex: C.hair },
          { type: "rect", x: 65, y: 24, w: 3, h: 16, paletteIndex: C.hair },
          // 高光（油亮的深棕）
          { type: "rect", x: 34, y: 5, w: 8, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 50, y: 5, w: 8, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 36, y: 7, w: 6, h: 1, paletteIndex: C.hairHi },
          { type: "rect", x: 52, y: 7, w: 6, h: 1, paletteIndex: C.hairHi },
          // 暗部
          { type: "rect", x: 30, y: 10, w: 4, h: 2, paletteIndex: C.hairShade },
          { type: "rect", x: 62, y: 10, w: 4, h: 2, paletteIndex: C.hairShade },
          // 头顶描边
          { type: "rect", x: 30, y: 4, w: 36, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 眉毛（粗、向下倾斜，坚定的怒气） ==============
      {
        id: "brows",
        z: 4,
        shapes: [
          // 左眉（外侧向下，内侧向上 → 怒视感）
          { type: "rect", x: 34, y: 18, w: 9, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 41, y: 17, w: 3, h: 1, paletteIndex: C.hair },
          // 右眉
          { type: "rect", x: 53, y: 18, w: 9, h: 2, paletteIndex: C.hair },
          { type: "rect", x: 53, y: 17, w: 3, h: 1, paletteIndex: C.hair }
        ]
      },

      // ============== 眼睛（标志性翡翠绿，锐利） ==============
      {
        id: "eyes",
        z: 4,
        shapes: [
          // 左眼眼白
          { type: "rect", x: 35, y: 21, w: 8, h: 4, paletteIndex: C.shirtWhite },
          // 左瞳（翡翠绿）
          { type: "rect", x: 37, y: 21, w: 4, h: 4, paletteIndex: C.eyeGreen },
          { type: "rect", x: 38, y: 22, w: 2, h: 2, paletteIndex: C.outline },
          { type: "rect", x: 38, y: 22, w: 1, h: 1, paletteIndex: C.shirtWhite },
          // 右眼眼白
          { type: "rect", x: 53, y: 21, w: 8, h: 4, paletteIndex: C.shirtWhite },
          // 右瞳（翡翠绿）
          { type: "rect", x: 55, y: 21, w: 4, h: 4, paletteIndex: C.eyeGreen },
          { type: "rect", x: 56, y: 22, w: 2, h: 2, paletteIndex: C.outline },
          { type: "rect", x: 56, y: 22, w: 1, h: 1, paletteIndex: C.shirtWhite },
          // 下睫毛阴影
          { type: "rect", x: 35, y: 25, w: 8, h: 1, paletteIndex: C.skinShade },
          { type: "rect", x: 53, y: 25, w: 8, h: 1, paletteIndex: C.skinShade },
          // 上眼睑
          { type: "rect", x: 35, y: 20, w: 8, h: 1, paletteIndex: C.outline },
          { type: "rect", x: 53, y: 20, w: 8, h: 1, paletteIndex: C.outline }
        ]
      },

      // ============== 鼻子 ==============
      {
        id: "nose",
        z: 4,
        shapes: [
          { type: "rect", x: 46, y: 22, w: 4, h: 6, paletteIndex: C.skinMid },
          { type: "rect", x: 46, y: 27, w: 4, h: 2, paletteIndex: C.skinShade },
          { type: "rect", x: 47, y: 24, w: 2, h: 3, paletteIndex: C.skinHi }
        ]
      },

      // ============== 嘴（紧抿，决意） ==============
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

      // signature: 单手敬军礼（《进击的巨人》调查兵团仪式动作）
      signature: {
        fps: 8,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0, rotate: 0 }, { partId: "brows", dy: 0 }] },
          { duration: 5, transforms: [{ partId: "arms", dy: -4, rotate: -6 }, { partId: "head", dy: -1 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -8, rotate: -12 }, { partId: "head", dy: -1, rotate: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 14, transforms: [{ partId: "arms", dy: -10, rotate: -15 }, { partId: "head", dy: -1, rotate: -1 }, { partId: "brows", dy: -1 }, { partId: "number", scale: 1.05 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -8, rotate: -12 }, { partId: "head", dy: -1 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, rotate: 0 }, { partId: "head", dy: 0, rotate: 0 }, { partId: "brows", dy: 0 }, { partId: "number", scale: 1.0 } ] }
        ]
      },

      // fidget-a: 攥紧拳头（决心姿势）
      "fidget-a": {
        fps: 8,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -3 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 14, transforms: [{ partId: "arms", dy: -4, scale: 1.05 }, { partId: "head", dy: -1, rotate: -1 }, { partId: "brows", dy: -2 }, { partId: "mouth", scale: 0.9 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -2 }, { partId: "head", dy: 0 }, { partId: "brows", dy: -1 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0, scale: 1.0 }, { partId: "head", rotate: 0 }, { partId: "brows", dy: 0 }, { partId: "mouth", scale: 1.0 }] }
        ]
      },

      // fidget-b: 整理衣襟
      "fidget-b": {
        fps: 6,
        loop: false,
        frames: [
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -2 }, { partId: "body", dy: -1 }] },
          { duration: 10, transforms: [{ partId: "arms", dy: -4 }, { partId: "body", dy: 0 }, { partId: "number", scale: 1.05 }] },
          { duration: 6, transforms: [{ partId: "arms", dy: -2 }, { partId: "body", dy: 0 }] },
          { duration: 4, transforms: [{ partId: "arms", dy: 0 }, { partId: "number", scale: 1.0 }] }
        ]
      },

      // talk: 嘴动 + 头点 + 眉毛偶尔皱
      talk: {
        fps: 11,
        loop: true,
        frames: [
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.0 }, { partId: "head", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.5 }, { partId: "head", dy: -1 }, { partId: "brows", dy: -1 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.3 }, { partId: "head", dy: 0 }, { partId: "brows", dy: 0 }] },
          { duration: 3, transforms: [{ partId: "mouth", scale: 1.4 }, { partId: "head", dy: -1 }] }
        ]
      }
    },
    stateMachine: withFidgetVariants(standardStateMachine())
  }
};
