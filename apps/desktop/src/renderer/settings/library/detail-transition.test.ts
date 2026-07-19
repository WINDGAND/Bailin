import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDetailTransition } from "./detail-transition.js";

describe("runDetailTransition", () => {
  it("updates immediately when View Transitions are unavailable", () => {
    let updates = 0;

    runDetailTransition(() => {
      updates += 1;
    });

    assert.equal(updates, 1);
  });

  it("delegates the update to the browser transition when available", () => {
    let updates = 0;
    let starts = 0;

    runDetailTransition(
      () => {
        updates += 1;
      },
      (update) => {
        starts += 1;
        update();
      }
    );

    assert.equal(starts, 1);
    assert.equal(updates, 1);
  });
});
