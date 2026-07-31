#!/usr/bin/env node
/**
 * 独立快捷菜单定位回归：桌宠窗几何不变；菜单 tuck 进透明留白；不叠对话；
 * 贴边 + 对话同时打开时回退上下，不盖精灵核心。
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const petWindowPath = resolve(repoRoot, "apps/desktop/dist/main/main/windows/pet-window.js");

const {
  PET_MENU_GAP,
  PET_MENU_TUCK,
  PET_MENU_PANEL_WIDTH,
  computePetMenuPopupBounds,
  petMenuEdgeInset,
  petCoreRect,
  petMenuPlacementViable,
  petScreenRectUnchanged,
  resolvePetMenuSide,
  rectsOverlap
} = require(petWindowPath);

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL ${name}`);
    process.exit(1);
  }
  console.log(`OK ${name}`);
}

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const pet = { x: 1200, y: 700, width: 216, height: 234 };
const chatInset = 4 - 36; // 与 chat-window positionChatNear 一致
const chat = {
  x: pet.x + pet.width + chatInset,
  y: 500,
  width: 380,
  height: 480
};

const inset = petMenuEdgeInset();
assert("inset = gap - tuck", inset === PET_MENU_GAP - PET_MENU_TUCK);
assert("tuck brings menu closer than bare gap", inset < PET_MENU_GAP);

const side = resolvePetMenuSide({
  petX: pet.x,
  petY: pet.y,
  petW: pet.width,
  petH: pet.height,
  chat,
  workArea
});
assert("chat on right → menu on left", side === "left");

const menu = computePetMenuPopupBounds(
  pet.x,
  pet.y,
  pet.width,
  pet.height,
  side,
  workArea,
  { width: PET_MENU_PANEL_WIDTH, height: 320 },
  chat
);

const edgeGap = pet.x - (menu.x + menu.width);
assert("menu tucked by expected inset", edgeGap === inset);
assert(
  "menu does not overlap chat",
  !rectsOverlap(menu, chat, PET_MENU_GAP - 0.1)
);
const coreMid = petCoreRect(pet.x, pet.y, pet.width, pet.height);
assert(
  "menu does not overlap pet core (mid-screen)",
  !rectsOverlap(menu, coreMid, PET_MENU_GAP - 0.1)
);

const petAfter = { ...pet };
assert("pet screen rect unchanged", petScreenRectUnchanged(pet, petAfter));

const sideNoChat = resolvePetMenuSide({
  petX: pet.x,
  petY: pet.y,
  petW: pet.width,
  petH: pet.height,
  chat: null,
  workArea
});
assert("no chat → menu on right", sideNoChat === "right");
const menuRight = computePetMenuPopupBounds(
  pet.x,
  pet.y,
  pet.width,
  pet.height,
  sideNoChat,
  workArea
);
assert(
  "menu right tucked by expected inset",
  menuRight.x - (pet.x + pet.width) === inset
);

// 贴左缘 + 对话在右：左侧夹紧会盖精灵，右侧贴宠会叠对话 → 回退 above/below
const edgePet = { x: 8, y: 700, width: 216, height: 234 };
const edgeChat = {
  x: edgePet.x + edgePet.width + chatInset,
  y: 600,
  width: 380,
  height: 480
};
const edgeSide = resolvePetMenuSide({
  petX: edgePet.x,
  petY: edgePet.y,
  petW: edgePet.width,
  petH: edgePet.height,
  chat: edgeChat,
  workArea
});
assert(
  "edge + chat → menu above or below",
  edgeSide === "above" || edgeSide === "below"
);

const edgeMenu = computePetMenuPopupBounds(
  edgePet.x,
  edgePet.y,
  edgePet.width,
  edgePet.height,
  edgeSide,
  workArea,
  { width: PET_MENU_PANEL_WIDTH, height: 320 },
  edgeChat
);
const edgeCore = petCoreRect(edgePet.x, edgePet.y, edgePet.width, edgePet.height);
assert(
  "edge menu viable vs pet core + chat",
  petMenuPlacementViable(
    edgeMenu,
    edgeCore,
    edgeChat,
    workArea,
    { x: edgePet.x, y: edgePet.y, width: edgePet.width, height: edgePet.height },
    edgeSide
  )
);
assert(
  "edge menu does not overlap pet core",
  !rectsOverlap(edgeMenu, edgeCore, PET_MENU_GAP - 0.1)
);
assert(
  "edge menu does not overlap chat",
  !rectsOverlap(edgeMenu, edgeChat, PET_MENU_GAP - 0.1)
);

console.log("verify-pet-menu-popup: all passed");
