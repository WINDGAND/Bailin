# 桌宠抠图边缘去溢色（Chroma Edge Decontamination）设计

## 背景

生成的桌宠精灵图（strip → atlas）周围经常残留明显的白边/杂色边缘，抠图不干净。用户反馈两个示例桌宠图片都有此问题。

## 根因

`packages/pet-atlas-tools/src/png.ts` 里的抠图算法是**颜色距离阈值 + 二值 alpha**：任何一个像素只有"判定为背景→整像素清零"或"判定为前景→完全不碰"两种结果，没有中间态。真实模型生成的图片边缘是**抗锯齿的、前景色与背景色物理混合**的过渡像素，这批像素落在阈值边界附近时：
- 色距在阈值内 → 被 `polishChromaMatte` 的 `clearPixel` 整个清除，造成锯齿状缺口
- 色距刚好超出阈值 → 完全不处理，保留着混入背景色的"白边/绿边"

具体问题代码：

```381:386:packages/pet-atlas-tools/src/png.ts
if (
  touchesTrans &&
  isChromaResiduePixel(r, g, b, a, key, edgeSq, false)
) {
  clearPixel(data, i);
}
```

`paste()`（source-over 合成）和 `resize()`（最近邻点采样）已排查确认实现正确，不是问题来源，本次不改动。

## 方案：边缘色彩净化（Spill Suppression / Despill）

只改 `polishChromaMatte` 对"贴透明边缘"像素的**处理动作**，不改任何现有阈值数值、不影响角色内部像素（白裙子/绿衣服保护逻辑不动）：

把现在的二元判断（`isChromaResiduePixel` → 清或不清）换成三段式：

1. **色距 ≤ `seedThreshold`**（现有 `seedThreshold`，即 chroma seed 阈值）：判定为纯背景，整像素清零。行为与现在一致，不变。
2. **色距 ≥ `edgeSpillThreshold`**（现有 `edgeSpillThreshold` = `seed + 8/10`）：判定为纯前景，不碰。行为与现在一致，不变。
3. **`seedThreshold` < 色距 < `edgeSpillThreshold`**（现在被 `isChromaResiduePixel` 用同一个 `edgeSpillThreshold` 二元判断"清或不清"的那批像素，即真正的抗锯齿过渡像素）：改成渐变处理：

```
t = sqrt(colorDistSq)
tIn = seedThreshold
tOut = edgeSpillThreshold
alpha = clamp((t - tIn) / (tOut - tIn), 0, 1)   // 越接近背景色 alpha 越低

若 alpha 极小（< 阈值，如 0.06）：等同于纯背景，整像素清零（避免除零/噪声）
否则：
  真实前景色.r = clamp((观测r - (1-alpha) * chromaKey.r) / alpha, 0, 255)
  真实前景色.g = clamp((观测g - (1-alpha) * chromaKey.g) / alpha, 0, 255)
  真实前景色.b = clamp((观测b - (1-alpha) * chromaKey.b) / alpha, 0, 255)
  写回 RGBA = (真实前景色.r, .g, .b, round(alpha * 255))
```

这是标准 chroma key 去溢色（despill）公式的简化版：假设观测颜色 = alpha × 真实前景色 + (1-alpha) × chroma 背景色，反解出真实前景色。

## 已知局限（不在本次修复范围内）

如果角色本体设计为与 chroma 背景色高度接近的颜色（比如白色角色贴白色 chroma 背景），色距本身趋近于 0，属于 chroma key 原理上无法区分前景/背景的场景，本次修复无法解决。这是产品设计层面的取舍（对应"方案 B：改用支持原生透明背景的生图模型"），本轮明确不做。

## 影响范围

- 唯一修改文件：`packages/pet-atlas-tools/src/png.ts`（`polishChromaMatte` 函数体 + 新增 1-2 个纯函数辅助）
- 不改：`removeChromaBackgroundConnected`、`repairInteriorAlphaHoles`、`normalizeTransparentRgb`、`resize`、`paste`、任何阈值默认值、任何 prompt 模板、任何生图策略（`hatch-pet-pipeline.ts`、`image-generation-adapter.ts`）
- 不引入新依赖

## 测试计划

新增 `scripts/verify/verify-chroma-decontaminate.mjs`（遵循仓库现有 `scripts/verify/*.mjs` 约定：require 编译后的 `packages/pet-atlas-tools/dist/index.cjs`，用合成像素数据，不需要真实生图/网络）：

1. 构造一段已知真实颜色（如橙色 `(255,120,40)`）在白色 chroma 背景上、且已知混合比例的合成过渡像素（模拟真实抗锯齿边缘），跑 `removeChromaBackgroundConnected` + `polishChromaMatte`（新逻辑），断言：
   - 纯背景像素 → alpha=0（不回归）
   - 纯前景像素（远离边缘）→ 不变（不回归）
   - 过渡带像素 → 恢复出的 RGB 接近真实前景色（容差内），alpha 是渐变值而非非 0 即 255（证明去溢色生效）
2. 重跑现有 `scripts/verify/verify-hatch-pet.mjs`（白裙误抠防护、绿衣 spill 防护、内部洞修复、原生透明跳过等），确认零回归。

## 验收标准

- 新脚本全部通过（GREEN）
- 现有 `verify-hatch-pet.mjs` 全部通过（无回归）
- `pnpm --filter @bailin/pet-atlas-tools run build` 无类型错误
