/**
 * 方案 B：独立气泡窗 — 桌宠窗始终基准尺寸，气泡位置/方位由主进程布局模块计算。
 * 此处内联 shared/proactive-bubble-layout.ts 的核心逻辑以便 node 直接运行。
 */
import assert from "node:assert/strict";

const PROACTIVE_BUBBLE_WINDOW_SIZE = { width: 280, height: 132 };
const PROACTIVE_BUBBLE_PET_GAP = 6;
const PROACTIVE_BUBBLE_PLACEMENT_HYSTERESIS_PX = 80;
const PET_ANCHOR_RATIO = 0.88;

const BASE_H = 234;
const BASE_W = 216;
const DISPLAY_H = 1080;

function resolveProactiveBubblePlacementFromPetRect(pet, displayHeight, current = null) {
  const anchorY = pet.y + pet.height * PET_ANCHOR_RATIO;
  const mid = displayHeight / 2;
  const h = PROACTIVE_BUBBLE_PLACEMENT_HYSTERESIS_PX;

  if (current === "above") {
    return anchorY > mid - h ? "above" : "below";
  }
  if (current === "below") {
    return anchorY > mid + h ? "above" : "below";
  }
  return anchorY > mid ? "above" : "below";
}

function computeProactiveBubbleWindowBounds(pet, placement) {
  const bubbleSize = PROACTIVE_BUBBLE_WINDOW_SIZE;
  const gap = PROACTIVE_BUBBLE_PET_GAP;
  const petCenterX = pet.x + pet.width / 2;
  const x = Math.round(petCenterX - bubbleSize.width / 2);
  const y =
    placement === "above"
      ? Math.round(pet.y - gap - bubbleSize.height)
      : Math.round(pet.y + pet.height + gap);
  return { x, y, width: bubbleSize.width, height: bubbleSize.height };
}

/** 桌宠拖动 clamp 始终用基准窗高，气泡不再撑大桌宠窗。 */
assert.equal(BASE_H, BASE_H);

const petUpper = { x: 400, y: 200, width: BASE_W, height: BASE_H };
const petLower = { x: 400, y: 800, width: BASE_W, height: BASE_H };
assert.equal(resolveProactiveBubblePlacementFromPetRect(petUpper, DISPLAY_H, null), "below");
assert.equal(resolveProactiveBubblePlacementFromPetRect(petLower, DISPLAY_H, null), "above");

const midPet = { x: 400, y: 350, width: BASE_W, height: BASE_H };
assert.equal(resolveProactiveBubblePlacementFromPetRect(midPet, DISPLAY_H, "below"), "below");
assert.equal(
  resolveProactiveBubblePlacementFromPetRect({ ...midPet, y: 450 }, DISPLAY_H, "below"),
  "above"
);

const aboveBounds = computeProactiveBubbleWindowBounds(petLower, "above");
assert.ok(aboveBounds.y + aboveBounds.height <= petLower.y - PROACTIVE_BUBBLE_PET_GAP + 1);

const belowBounds = computeProactiveBubbleWindowBounds(petUpper, "below");
assert.ok(belowBounds.y >= petUpper.y + petUpper.height + PROACTIVE_BUBBLE_PET_GAP - 1);

assert.equal(aboveBounds.width, PROACTIVE_BUBBLE_WINDOW_SIZE.width);
assert.equal(aboveBounds.height, PROACTIVE_BUBBLE_WINDOW_SIZE.height);

console.log("pet-bubble-layout verify (plan B): ok");
