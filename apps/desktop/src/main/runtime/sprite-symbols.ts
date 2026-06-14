/**
 * Sprite symbol library: 抽象的 8×8 / 12×8 像素图案，给标志性配饰 / 翼章 / 项链等用。
 *
 * 每个 symbol 是 rect 列表（相对 anchor 的局部坐标，从 (0,0) 开始）。
 * 调用方传入 anchor 坐标 + 主色 idx + 副色 idx，转换为绝对坐标的 SpriteDSL shape。
 *
 * 为什么单列：sprite-builder.ts 已经很长；把"图形资产"和"骨架几何"解耦后，
 * 未来加新角色 logo 只要在这里加一个 pattern，不动主流程。
 */

export interface SymbolShape {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 = 主色 (signature) / 1 = 副色 (signature2 / accent) / 2 = outline */
  color: 0 | 1 | 2;
}

export interface SymbolPattern {
  /** 设计的画布尺寸，用于居中布局 */
  width: number;
  height: number;
  /** rect 列表（相对左上角 (0,0)） */
  shapes: SymbolShape[];
}

/** 调查兵团双翼翼章（薇尔莉特用法：蓝白翼章；艾伦：白底蓝翼）。 */
const WINGS: SymbolPattern = {
  width: 14,
  height: 8,
  shapes: [
    // 左翼上沿
    { x: 0, y: 1, w: 4, h: 1, color: 0 },
    { x: 1, y: 0, w: 2, h: 1, color: 0 },
    // 左翼主体
    { x: 0, y: 2, w: 5, h: 2, color: 0 },
    { x: 1, y: 4, w: 4, h: 1, color: 0 },
    // 左翼羽尖
    { x: 0, y: 5, w: 2, h: 1, color: 0 },
    { x: 2, y: 5, w: 2, h: 1, color: 1 },
    // 中央
    { x: 6, y: 2, w: 2, h: 4, color: 2 },
    // 右翼镜像
    { x: 10, y: 1, w: 4, h: 1, color: 0 },
    { x: 11, y: 0, w: 2, h: 1, color: 0 },
    { x: 9, y: 2, w: 5, h: 2, color: 0 },
    { x: 9, y: 4, w: 4, h: 1, color: 0 },
    { x: 12, y: 5, w: 2, h: 1, color: 0 },
    { x: 10, y: 5, w: 2, h: 1, color: 1 }
  ]
};

/** 十字项链 / 教会十字。 */
const CROSS: SymbolPattern = {
  width: 6,
  height: 8,
  shapes: [
    { x: 2, y: 0, w: 2, h: 8, color: 0 },
    { x: 0, y: 3, w: 6, h: 2, color: 0 },
    // 高光
    { x: 2, y: 0, w: 1, h: 8, color: 1 },
    { x: 0, y: 3, w: 6, h: 1, color: 1 }
  ]
};

/** 蝴蝶结。 */
const BOW: SymbolPattern = {
  width: 12,
  height: 6,
  shapes: [
    // 左翼
    { x: 0, y: 1, w: 4, h: 4, color: 0 },
    { x: 1, y: 0, w: 2, h: 1, color: 0 },
    { x: 1, y: 5, w: 2, h: 1, color: 0 },
    // 中央结
    { x: 4, y: 1, w: 4, h: 4, color: 1 },
    { x: 5, y: 0, w: 2, h: 6, color: 0 },
    // 右翼
    { x: 8, y: 1, w: 4, h: 4, color: 0 },
    { x: 9, y: 0, w: 2, h: 1, color: 0 },
    { x: 9, y: 5, w: 2, h: 1, color: 0 }
  ]
};

/** 圆形宝石 / 胸针（如薇尔莉特的翡翠胸针）。 */
const BROOCH_GEM: SymbolPattern = {
  width: 6,
  height: 6,
  shapes: [
    // 圆形外圈（4×4 + 圆角）
    { x: 1, y: 0, w: 4, h: 1, color: 1 },
    { x: 0, y: 1, w: 6, h: 4, color: 1 },
    { x: 1, y: 5, w: 4, h: 1, color: 1 },
    // 宝石中心
    { x: 1, y: 1, w: 4, h: 4, color: 0 },
    // 高光
    { x: 1, y: 1, w: 2, h: 1, color: 1 }
  ]
};

/** 圆形 logo 徽章。 */
const ROUND_LOGO: SymbolPattern = {
  width: 8,
  height: 8,
  shapes: [
    { x: 1, y: 0, w: 6, h: 1, color: 2 },
    { x: 0, y: 1, w: 8, h: 6, color: 0 },
    { x: 1, y: 7, w: 6, h: 1, color: 2 },
    { x: 2, y: 2, w: 4, h: 4, color: 1 }
  ]
};

/** 数字 24 / 8 等运动号码（双数字方块）。 */
const NUMBER_PLATE: SymbolPattern = {
  width: 12,
  height: 8,
  shapes: [
    { x: 0, y: 0, w: 5, h: 8, color: 0 },
    { x: 1, y: 1, w: 3, h: 1, color: 1 },
    { x: 1, y: 4, w: 3, h: 1, color: 1 },
    { x: 1, y: 6, w: 3, h: 1, color: 1 },
    { x: 7, y: 0, w: 5, h: 8, color: 0 },
    { x: 8, y: 1, w: 1, h: 3, color: 1 },
    { x: 10, y: 1, w: 1, h: 7, color: 1 },
    { x: 8, y: 4, w: 3, h: 1, color: 1 }
  ]
};

/** 双马尾 / 双辫（用于初音 / 雷电将军这类角色当 hair 加挂件用）。 */
const TWIN_TAIL: SymbolPattern = {
  width: 4,
  height: 16,
  shapes: [
    { x: 0, y: 0, w: 4, h: 14, color: 0 },
    { x: 1, y: 14, w: 2, h: 2, color: 0 },
    { x: 0, y: 2, w: 1, h: 10, color: 1 }
  ]
};

/** 关键词 → 符号映射；返回 null 表示无匹配。 */
export function symbolForKeyword(name: string): SymbolPattern | null {
  const n = name.toLowerCase();
  if (/翼章|wings?|emblem.*wings?|wing emblem|双翼/.test(n)) return WINGS;
  if (/十字|cross|crucifix/.test(n)) return CROSS;
  if (/蝴蝶结|bow tie|bow-tie|领结|ribbon bow|蝴蝶/.test(n)) return BOW;
  if (/胸针|brooch|宝石|gem|pin/.test(n)) return BROOCH_GEM;
  if (/双马尾|twin ?tails?|twin-tails?/.test(n)) return TWIN_TAIL;
  if (/号|number|jersey ?#|\d{1,2}/.test(n)) return NUMBER_PLATE;
  if (/logo|徽|章|emblem|brand|圆形/.test(n)) return ROUND_LOGO;
  return null;
}

export const SYMBOLS = {
  WINGS,
  CROSS,
  BOW,
  BROOCH_GEM,
  ROUND_LOGO,
  NUMBER_PLATE,
  TWIN_TAIL
};
