import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PET_MENU_PANEL_WIDTH,
  PET_MENU_ROOT_CONTENT_HEIGHT,
  PET_MENU_WINDOW_HEIGHT,
  computePetSideMenuBounds,
  petMenuEdgeInset,
  resolvePetMenuHorizontalSide,
  resolvePetMenuHorizontalSideByScreenHalf
} from "./pet-window.js";

describe("resolvePetMenuHorizontalSideByScreenHalf", () => {
  const workArea = { x: 0, width: 1920 };

  it("opens on the right when the pet is on the left half", () => {
    assert.equal(resolvePetMenuHorizontalSideByScreenHalf(100, 240, workArea), "right");
  });

  it("opens on the left when the pet is on the right half", () => {
    assert.equal(resolvePetMenuHorizontalSideByScreenHalf(1500, 240, workArea), "left");
  });
});

describe("computePetSideMenuBounds", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const menuSize = { width: PET_MENU_PANEL_WIDTH, height: PET_MENU_ROOT_CONTENT_HEIGHT };
  const inset = petMenuEdgeInset();

  it("places the menu directly to the right of a left-half pet and vertically centers it", () => {
    const pet = { x: 80, y: 400, width: 240, height: 260 };
    const { bounds, side } = computePetSideMenuBounds(
      pet.x,
      pet.y,
      pet.width,
      pet.height,
      workArea,
      menuSize
    );
    assert.equal(side, "right");
    assert.equal(bounds.x, Math.round(pet.x + pet.width + inset));
    assert.equal(
      bounds.y,
      Math.round(pet.y + (pet.height - PET_MENU_ROOT_CONTENT_HEIGHT) / 2)
    );
  });

  it("places the menu directly to the left of a right-half pet", () => {
    const pet = { x: 1500, y: 400, width: 240, height: 260 };
    const { bounds, side } = computePetSideMenuBounds(
      pet.x,
      pet.y,
      pet.width,
      pet.height,
      workArea,
      menuSize
    );
    assert.equal(side, "left");
    assert.equal(bounds.x, Math.round(pet.x - PET_MENU_PANEL_WIDTH - inset));
  });

  it("opens opposite the chat when the pet is centered and both sides have room", () => {
    const pet = { x: 840, y: 400, width: 240, height: 260 };
    const chat = { x: pet.x + pet.width - 36, y: 300, width: 380, height: 480 };
    assert.equal(
      resolvePetMenuHorizontalSide(pet.x, pet.width, workArea, chat),
      "left"
    );
    const { bounds, side } = computePetSideMenuBounds(
      pet.x,
      pet.y,
      pet.width,
      pet.height,
      workArea,
      menuSize,
      chat
    );
    assert.equal(side, "left");
    assert.equal(bounds.x, Math.round(pet.x - PET_MENU_PANEL_WIDTH - inset));
  });

  it("stays on the chat side at the left edge when the opposite side has no room", () => {
    const pet = { x: 24, y: 780, width: 240, height: 260 };
    const chat = { x: pet.x + pet.width - 36, y: 552, width: 380, height: 480 };
    const { bounds, side } = computePetSideMenuBounds(
      pet.x,
      pet.y,
      pet.width,
      pet.height,
      workArea,
      menuSize,
      chat
    );
    assert.equal(side, "right");
    assert.equal(bounds.x, Math.round(pet.x + pet.width + inset));
    assert.ok(bounds.y > 500, `expected beside pet, got y=${bounds.y}`);
  });

  it("keeps horizontal side when expanding height for the switch-character submenu", () => {
    const pet = { x: 80, y: 700, width: 240, height: 260 };
    const root = computePetSideMenuBounds(
      pet.x,
      pet.y,
      pet.width,
      pet.height,
      workArea,
      menuSize
    );
    const expanded = computePetSideMenuBounds(
      pet.x,
      pet.y,
      pet.width,
      pet.height,
      workArea,
      { width: PET_MENU_PANEL_WIDTH, height: PET_MENU_WINDOW_HEIGHT }
    );
    assert.equal(root.side, "right");
    assert.equal(expanded.side, "right");
    assert.equal(expanded.bounds.x, root.bounds.x);
  });
});
