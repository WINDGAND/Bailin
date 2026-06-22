import type { AppearanceSpec } from "@nuwa-pet/character-protocol";

/**
 * Sprite 转译 prompt：把结构化 AppearanceSpec 翻成 SpriteProgram。
 * 模型不再凭训练印象画桌宠，而是按 appearance.json 转译为像素部件。
 * 详见 README「角色协议」与 packages/character-protocol（SpriteProgram）。
 */

export interface SpriteFromAppearanceInput {
  characterName: string;
  appearance: AppearanceSpec;
}

export const SPRITE_OUTPUT_SCHEMA_DESCRIPTION = `
{
  "schemaVersion": "0.1",
  "mode": "dsl",
  "size": { "width": 48, "height": 48 },
  "displayScale": 4,
  "palette": [{ "name": "string", "hex": "#RRGGBB" }],
  "dsl": {
    "parts": [
      {
        "id": "shadow|body|head|hair|eyes|mouth|accessory-X|gear-left|gear-right",
        "z": -1 | 0 | 1 | 2 | 3 | 4 | 5,
        "shapes": [
          { "type": "rect|circle|pixel|line", "x": int, "y": int, "w": int?, "h": int?, "r": int?, "x2": int?, "y2": int?, "paletteIndex": int }
        ]
      }
    ],
    "animations": {
      "idle":            { "fps": 4-8, "loop": true,  "frames": [ {"duration": int, "transforms": [{"partId":"...","dy":1}]} ] },
      "idle-blink":      { "fps": 6,   "loop": true,  "frames": [ ... ] },
      "walk-left":       { "fps": 8,   "loop": true,  "frames": [ ... ] },
      "walk-right":      { "fps": 8,   "loop": true,  "frames": [ ... ] },
      "click-reaction":  { "fps": 10,  "loop": false, "frames": [ ... ] },
      "drag":            { "fps": 6,   "loop": true,  "frames": [ ... ] },
      "talk":            { "fps": 8,   "loop": true,  "frames": [ ... ] },
      "think":           { "fps": 4,   "loop": true,  "frames": [ ... ] },
      "sleep":           { "fps": 2,   "loop": true,  "frames": [ ... ] }
    },
    "stateMachine": {
      "initial": "idle",
      "states": {
        "idle":  { "animation": "idle",            "transitions": [{ "on": "click", "to": "click" }, { "on": "chatOpen", "to": "talk" }, { "on": "dragStart", "to": "drag" }, { "on": "screenLock", "to": "sleep" }] },
        "walk":  { "animation": "walk-right",      "transitions": [{ "on": "tick", "to": "idle", "guard": "arrived()" }] },
        "click": { "animation": "click-reaction",  "transitions": [{ "on": "tick", "to": "idle", "guard": "frameDone()" }] },
        "drag":  { "animation": "drag",            "transitions": [{ "on": "dragEnd", "to": "idle" }] },
        "talk":  { "animation": "talk",            "transitions": [{ "on": "chatClose", "to": "idle" }, { "on": "responseEnd", "to": "idle" }] },
        "think": { "animation": "think",           "transitions": [{ "on": "responseStart", "to": "talk" }] },
        "sleep": { "animation": "sleep",           "transitions": [{ "on": "screenUnlock", "to": "idle" }] }
      }
    }
  }
}
`.trim();

const COORDINATE_GUIDE = `
画布 48x48，原点 (0,0) 在左上。建议布局：
- shadow（z=-1）: 椭圆 / 矩形，位于脚下 y≈45
- 身体 body（z=0）: x 在 16-32 之间，y 在 22-40 之间
- 主要服饰细节（领带/号码/logo/翼章）作为独立 part，z=1
- 头 head（z=2）: 圆 / 矩形，x 在 14-34，y 在 6-22
- 头发 hair（z=3）: 覆盖 head 顶部
- 眼 eyes（z=4）: y≈14-16，两点对称
- 配饰 accessory（z=5）: 眼镜 / 帽子 / 头饰
- 嘴 mouth（z=5）: y≈19-21
- 装备 gear-left / gear-right（z=1）: 挂在腰侧 (x≈8 与 x≈38, y≈24-32)
`.trim();

export function buildSpriteFromAppearancePrompt(input: SpriteFromAppearanceInput): {
  system: string;
  user: string;
} {
  const { characterName, appearance } = input;

  const system = [
    "你是 百灵 Bailin 的像素美术。",
    "你不创造外貌；你只是把已经调研好的 AppearanceSpec **忠实地** 翻译成 SpriteProgram。",
    "",
    "纪律：",
    "1. 输出严格 JSON，仅 JSON。不要 markdown，不要解释，不要 trailing comma。",
    "2. **palette 必须直接来自 appearance.palette**（按 role 顺序映射到 SpriteProgram.palette 的 hex，name 写 role）。不要新增新颜色。",
    "3. **所有 signature accessory 必须落到独立 part**（z=1 或 z=5）—— 用户一眼就要能看见。",
    "4. **所有 gear 必须以 'gear-left' / 'gear-right' 命名落到腰侧**（如立体机动装置侧挂、护腕）。",
    "5. shape.paletteIndex 必须 ≥0 且小于 palette 长度。",
    "6. 所有 frame.transforms[*].partId 必须存在于 parts 之中。",
    "7. animations 至少包含 idle / idle-blink / walk-right / click-reaction / drag / talk / think / sleep 八个；每个 ≥2 帧。",
    "8. guard 只能使用：rand() / tick / mouseInBounds / arrived() / frameDone() / idleSeconds 与基本算术比较。",
    "9. 任何字符串字段都不能输出 markdown 代码块标记。",
    "10. **shape.type 只能是这 4 个之一：'rect' | 'circle' | 'pixel' | 'line'**。",
    "    - 不允许：'ellipse' / 'oval' / 'polygon' / 'arc' / 'triangle' / 'square'",
    "    - 椭圆请用多个 rect 拼出来；三角用多个 rect 阶梯叠出来。",
    "11. **palette 数量 ≤12，且不能少于 2**。如 appearance.palette 不足 2，请用 outline + skin 补齐。",
    "",
    "## 坐标 / 布局指南",
    "",
    COORDINATE_GUIDE,
    "",
    "## 输出 JSON 契约",
    "",
    SPRITE_OUTPUT_SCHEMA_DESCRIPTION
  ].join("\n");

  const u = appearance;
  const palettePreview = u.palette.map((p) => `${p.role}=${p.hex}`).join(", ");
  const signatureAccessories = u.outfit.accessories.filter((a) => a.signature);

  const userLines: string[] = [];
  userLines.push(`角色名：${characterName}`);
  userLines.push("外貌调研结果（你必须忠实转译）：");
  userLines.push("```");
  userLines.push(JSON.stringify(u, null, 2));
  userLines.push("```");
  userLines.push("");
  userLines.push("关键提示：");
  userLines.push(`- 调色板（你的 palette 必须以此为准）：${palettePreview}`);
  if (signatureAccessories.length > 0) {
    userLines.push(
      `- 必须画出的 signature 配饰：${signatureAccessories
        .map((a) => `${a.name}（${a.placement}, ${a.color.hex}）`)
        .join("；")}`
    );
  }
  if (u.gear.length > 0) {
    userLines.push(
      `- 必须画出的装备：${u.gear.map((g) => `${g.name}（${g.placement}）`).join("；")}`
    );
  }
  userLines.push("");
  userLines.push("现在开始：直接输出 JSON SpriteProgram。");

  return { system, user: userLines.join("\n") };
}
