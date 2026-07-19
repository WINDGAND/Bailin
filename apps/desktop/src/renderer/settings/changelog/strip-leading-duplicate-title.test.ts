import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripLeadingDuplicateTitle } from "./strip-leading-duplicate-title.js";

describe("stripLeadingDuplicateTitle", () => {
  it("strips leading H1 that matches title", () => {
    const notes = "# Bailin v0.0.7\n\n## 下载\n- file";
    const out = stripLeadingDuplicateTitle(notes, "Bailin v0.0.7");
    assert.equal(out, "## 下载\n- file");
  });

  it("keeps leading H1 when title differs", () => {
    const notes = "# Other\n\nbody";
    assert.equal(stripLeadingDuplicateTitle(notes, "Bailin v0.0.7"), notes);
  });

  it("normalizes whitespace before comparing", () => {
    const notes = "#  Bailin   v0.0.7\nrest";
    assert.equal(stripLeadingDuplicateTitle(notes, "Bailin v0.0.7"), "rest");
  });
});
