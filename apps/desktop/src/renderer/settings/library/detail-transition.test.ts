import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  resetDetailTransitionClock,
  runDetailTransition
} from "./detail-transition.js";

describe("runDetailTransition", () => {
  beforeEach(() => {
    resetDetailTransitionClock();
  });

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
    let clock = 1_000;

    runDetailTransition(
      () => {
        updates += 1;
      },
      {
        startViewTransition: (update) => {
          starts += 1;
          update();
        },
        now: () => clock
      }
    );

    assert.equal(starts, 1);
    assert.equal(updates, 1);
  });

  it("skips View Transition when picks arrive inside the rapid window", () => {
    let starts = 0;
    let clock = 1_000;

    const options = {
      startViewTransition: (update: () => void) => {
        starts += 1;
        update();
      },
      now: () => clock,
      rapidWindowMs: 220
    };

    runDetailTransition(() => undefined, options);
    clock = 1_100;
    runDetailTransition(() => undefined, options);
    clock = 1_400;
    runDetailTransition(() => undefined, options);

    assert.equal(starts, 2);
  });
});
