/**
 * Vision prompt：从参考图提取 CSS 骨骼 rig 元数据（眼位、角色边界、背景透明度）。
 */

export interface LayeredRigVisionInput {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  referenceImageCount: number;
}

export const LAYERED_RIG_OUTPUT_SCHEMA = `{
  "characterBounds": { "x": 0.0-1.0, "y": 0.0-1.0, "w": 0.0-1.0, "h": 0.0-1.0 },
  "leftEye": { "x": 0.0-1.0, "y": 0.0-1.0, "size": 6-16 },
  "rightEye": { "x": 0.0-1.0, "y": 0.0-1.0, "size": 6-16 },
  "hasTransparentBg": true | false,
  "signature": "wave" | "nod" | "bounce" | "salute" | "sparkle" | "flex"
}`.trim();

export function buildLayeredRigVisionPrompt(input: LayeredRigVisionInput): {
  system: string;
  user: string;
} {
  const system = [
    "你是桌宠 CSS 骨骼 rig 标注员。根据参考图输出**严格 JSON**（不要 markdown 代码块）。",
    "坐标均为相对整张图的归一化值（0~1），左上角为原点。",
    "characterBounds：角色实体占画面的外接矩形，尽量紧贴人物，排除大面积空白背景。",
    "leftEye / rightEye：瞳孔中心位置（观众视角的左眼/右眼）。",
    "hasTransparentBg：背景是否已抠图透明。",
    "signature：根据角色气质选一个默认 idle 个性动作：",
    "  wave=挥手, nod=点头, bounce=弹跳, salute=敬礼, sparkle=闪光, flex=展示力量",
    "只输出 JSON，无其他文字。"
  ].join("\n");

  const user = [
    `角色：${input.characterName}`,
    `类型：${input.sourceType}`,
    `参考图数量：${input.referenceImageCount}`,
    "",
    "输出 schema：",
    LAYERED_RIG_OUTPUT_SCHEMA
  ].join("\n");

  return { system, user };
}
