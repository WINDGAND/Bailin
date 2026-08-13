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

  it("only keeps viewTransitionName on the card while the transition runs", async () => {
    const named = { style: { viewTransitionName: "" } };
    let nameDuringStart = "";
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });

    runDetailTransition(() => undefined, {
      namedElement: named,
      viewTransitionName: "library-detail",
      startViewTransition: (update) => {
        nameDuringStart = named.style.viewTransitionName;
        update();
        return { finished };
      },
      now: () => 8_000
    });

    assert.equal(nameDuringStart, "library-detail");
    assert.equal(named.style.viewTransitionName, "library-detail");
    finish();
    await finished;
    await Promise.resolve();
    assert.equal(named.style.viewTransitionName, "");
  });

  it("does not leave viewTransitionName when the pick is in the rapid window", () => {
    const named = { style: { viewTransitionName: "" } };
    let clock = 20_000;
    const options = {
      namedElement: named,
      viewTransitionName: "library-detail",
      startViewTransition: (update: () => void) => update(),
      now: () => clock,
      rapidWindowMs: 220
    };

    runDetailTransition(() => undefined, options);
    named.style.viewTransitionName = "stale";
    clock = 20_100;
    runDetailTransition(() => undefined, options);

    assert.equal(named.style.viewTransitionName, "stale");
  });

  it("skips View Transition when skipViewTransition is set", () => {
    let starts = 0;
    let updates = 0;

    runDetailTransition(
      () => {
        updates += 1;
      },
      {
        skipViewTransition: true,
        startViewTransition: (update) => {
          starts += 1;
          update();
        },
        now: () => 40_000
      }
    );

    assert.equal(starts, 0);
    assert.equal(updates, 1);
  });
});
