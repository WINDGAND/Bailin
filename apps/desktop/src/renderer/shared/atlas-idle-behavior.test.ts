import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAtlasStateMachine } from "@bailin/character-protocol";
import { createStateMachine, standardStateMachine } from "@bailin/sprite-runtime";

describe("defaultAtlasStateMachine 待机只站着", () => {
  it("长时间闲置仍保持 idle，不会自动入睡", () => {
    const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
    assert.equal(machine.state, "idle");
    machine.step(121_000);
    assert.equal(machine.state, "idle");
  });

  it("rand 再小也不会从 idle 进入 walk 或 fidget", () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
      machine.step(16);
      assert.equal(machine.state, "idle");
    } finally {
      Math.random = original;
    }
  });

  it("单击仍进入 click", () => {
    const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
    machine.send("click");
    assert.equal(machine.state, "click");
  });

  it("锁屏进入 sleep，解锁回到 idle", () => {
    const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
    machine.send("screenLock");
    assert.equal(machine.state, "sleep");
    machine.send("screenUnlock");
    assert.equal(machine.state, "idle");
  });
});

describe("standardStateMachine 待机只站着", () => {
  it("长时间闲置仍保持 idle", () => {
    const machine = createStateMachine({ stateMachine: standardStateMachine() });
    machine.step(121_000);
    assert.equal(machine.state, "idle");
  });

  it("rand 再小也不会从 idle 进入 walk 或 fidget", () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const machine = createStateMachine({ stateMachine: standardStateMachine() });
      machine.step(16);
      assert.equal(machine.state, "idle");
    } finally {
      Math.random = original;
    }
  });
});
