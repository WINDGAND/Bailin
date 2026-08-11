import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAtlasStateMachine } from "@bailin/character-protocol";
import { createStateMachine } from "@bailin/sprite-runtime";

describe("defaultAtlasStateMachine 闲置自主行为", () => {
  it("闲置超过阈值后自动入睡", () => {
    const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
    assert.equal(machine.state, "idle");
    // idleMs 只在 idle 态累积；一步跨过 120s 阈值
    machine.step(121_000);
    assert.equal(machine.state, "sleep");
  });

  it("rand 命中时从 idle 进入 fidget", () => {
    const original = Math.random;
    Math.random = () => 0.0015; // > walk 的 0.0012，< fidget 的 0.002
    try {
      const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
      machine.step(16);
      assert.equal(machine.state, "fidget");
    } finally {
      Math.random = original;
    }
  });

  it("rand 很高时保持 idle（不会每帧乱跳）", () => {
    const original = Math.random;
    Math.random = () => 0.999;
    try {
      const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
      for (let i = 0; i < 600; i += 1) machine.step(16);
      assert.equal(machine.state, "idle");
    } finally {
      Math.random = original;
    }
  });

  it("sleep 会缓慢自然醒来", () => {
    const original = Math.random;
    try {
      const machine = createStateMachine({ stateMachine: defaultAtlasStateMachine() });
      machine.step(121_000);
      assert.equal(machine.state, "sleep");
      Math.random = () => 0; // 必中小于 0.0006 的唤醒 guard
      machine.step(16);
      assert.equal(machine.state, "idle");
    } finally {
      Math.random = original;
    }
  });
});
