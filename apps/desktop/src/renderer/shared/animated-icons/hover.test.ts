import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playAnimatedIcon, stopAnimatedIcon } from "./hover.js";

function stubHandle() {
  const calls: string[] = [];
  return {
    calls,
    handle: {
      startAnimation: () => {
        calls.push("start");
      },
      stopAnimation: () => {
        calls.push("stop");
      }
    }
  };
}

describe("playAnimatedIcon", () => {
  it("starts animation when motion is allowed", () => {
    const { calls, handle } = stubHandle();
    playAnimatedIcon(handle, false);
    assert.deepEqual(calls, ["start"]);
  });

  it("does not start animation when reduced motion is on", () => {
    const { calls, handle } = stubHandle();
    playAnimatedIcon(handle, true);
    assert.deepEqual(calls, []);
  });

  it("does nothing when the handle is missing", () => {
    playAnimatedIcon(null, false);
  });
});

describe("stopAnimatedIcon", () => {
  it("stops animation even when reduced motion is on", () => {
    const { calls, handle } = stubHandle();
    stopAnimatedIcon(handle);
    assert.deepEqual(calls, ["stop"]);
  });

  it("does nothing when the handle is missing", () => {
    stopAnimatedIcon(null);
  });
});
