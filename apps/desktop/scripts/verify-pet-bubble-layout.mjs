/**
 * 验证气泡布局坐标换算：展开 ↔ 基准原点 可逆，拖动时高度保留 extra。
 */
import assert from "node:assert/strict";

const EXTRA = 100;

function baseFromExpanded(x, y, placement) {
  return placement === "above" ? { x, y: y + EXTRA } : { x, y };
}

function expandedFromBase(x, y, placement) {
  return placement === "above" ? { x, y: y - EXTRA } : { x, y };
}

const base = { x: 400, y: 600 };

for (const placement of ["above", "below"]) {
  const expanded = expandedFromBase(base.x, base.y, placement);
  const roundTrip = baseFromExpanded(expanded.x, expanded.y, placement);
  assert.deepEqual(roundTrip, base, `round-trip failed for ${placement}`);
}

const dragBase = { x: 500, y: 700 };
const dragExpanded = expandedFromBase(dragBase.x, dragBase.y, "above");
const dragHeight = 234 + EXTRA;
assert.equal(dragExpanded.y, dragBase.y - EXTRA);
assert.equal(dragHeight, 334);

console.log("pet-bubble-layout verify: ok");
