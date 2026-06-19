/**
 * 方案 B：独立气泡窗 — 对齐精灵可视区，气泡在正上/正下。
 */
import assert from "node:assert/strict";

const PROACTIVE_BUBBLE_WINDOW_SIZE = { width: 300, height: 160 };
const PROACTIVE_BUBBLE_PET_GAP = 3;
const PROACTIVE_BUBBLE_PLACEMENT_HYSTERESIS_PX = 80;
const PET_ANCHOR_RATIO = 0.88;
const PET_VISUAL_HEIGHT_RATIO = 0.72;
const PET_VISUAL_BOTTOM_INSET_RATIO = 0.035;

const BASE_H = 234;
const BASE_W = 216;
const DISPLAY_H = 1080;

function getPetVisualScreenRect(pet) {
  const visualH = pet.height * PET_VISUAL_HEIGHT_RATIO;
  const bottomInset = pet.height * PET_VISUAL_BOTTOM_INSET_RATIO;
  const visualBottom = pet.y + pet.height - bottomInset;
  return {
    x: pet.x,
    y: visualBottom - visualH,
    width: pet.width,
    height: visualH
  };
}

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
  const visual = getPetVisualScreenRect(pet);
  const bubbleSize = PROACTIVE_BUBBLE_WINDOW_SIZE;
  const gap = PROACTIVE_BUBBLE_PET_GAP;
  const centerX = pet.x + pet.width / 2;
  const x = Math.round(centerX - bubbleSize.width / 2);
  const y =
    placement === "above"
      ? Math.round(visual.y - gap - bubbleSize.height)
      : Math.round(visual.y + visual.height + gap);
  return { x, y, width: bubbleSize.width, height: bubbleSize.height };
}

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

const visualLower = getPetVisualScreenRect(petLower);
const aboveBounds = computeProactiveBubbleWindowBounds(petLower, "above");
assert.ok(aboveBounds.y + aboveBounds.height <= visualLower.y - PROACTIVE_BUBBLE_PET_GAP + 1);
assert.equal(
  aboveBounds.x + aboveBounds.width / 2,
  petLower.x + petLower.width / 2
);

const visualUpper = getPetVisualScreenRect(petUpper);
const belowBounds = computeProactiveBubbleWindowBounds(petUpper, "below");
assert.ok(belowBounds.y >= visualUpper.y + visualUpper.height + PROACTIVE_BUBBLE_PET_GAP - 1);
assert.equal(
  belowBounds.x + belowBounds.width / 2,
  petUpper.x + petUpper.width / 2
);

console.log("pet-bubble-layout verify (plan B): ok");
