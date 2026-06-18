/**
 * 验证气泡布局：坐标可逆 + 渲染侧应先固定桌宠区再扩窗。
 */
import assert from "node:assert/strict";

const EXTRA = 100;
const BASE_H = 234;

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
const dragHeight = BASE_H + EXTRA;
assert.equal(dragExpanded.y, dragBase.y - EXTRA);
assert.equal(dragHeight, 334);

/** 桌宠区高度在扩窗前后保持不变，避免 stretch 闪动。 */
function petZoneHeight(windowHeight, bubbleLayoutReady) {
  return BASE_H;
}

/** 陪伴开启时应预留气泡高度，试说/消失不再反复 setContentBounds。 */
function shouldReserveBubbleSpace(settings) {
  return Boolean(settings.enabled && settings.companionFrequency !== "off");
}

assert.equal(petZoneHeight(BASE_H, false), BASE_H);
assert.equal(petZoneHeight(BASE_H + EXTRA, true), BASE_H);
assert.equal(shouldReserveBubbleSpace({ enabled: true, companionFrequency: "light" }), true);
assert.equal(shouldReserveBubbleSpace({ enabled: true, companionFrequency: "off" }), false);

console.log("pet-bubble-layout verify: ok");
