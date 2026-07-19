import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INITIAL_PROGRESS_CONTENT,
  freezeProgressContentOnCancel,
  reduceProgressContent
} from "./progress-content-model.js";

describe("reduceProgressContent", () => {
  it("keeps step 4/5 content after a simulated remount from the same accumulator", () => {
    let state = INITIAL_PROGRESS_CONTENT;

    state = reduceProgressContent(state, {
      kind: "appearance_ready",
      jobId: "job-1",
      appearance: { notes: "ok" }
    });
    state = reduceProgressContent(state, {
      kind: "hatch_progress",
      jobId: "job-1",
      event: {
        kind: "start",
        runId: "run-1",
        jobsCount: 10,
        estimatedCostUsd: 1.2
      }
    });
    state = reduceProgressContent(state, {
      kind: "hatch_progress",
      jobId: "job-1",
      event: { kind: "job_start", jobId: "base", rowState: "base" }
    });

    // 模拟：进度页 unmount 后重新挂载，但 Provider 仍持有同一份 state
    const remounted = state;

    assert.equal(remounted.appearanceReady, true);
    assert.equal(remounted.hatchState.started, true);
    assert.equal(remounted.hatchState.jobs.base?.status, "running");
  });

  it("marks hatch started even if only mid-flight job events arrive", () => {
    const state = reduceProgressContent(INITIAL_PROGRESS_CONTENT, {
      kind: "hatch_progress",
      jobId: "job-1",
      event: { kind: "job_start", jobId: "row-idle", rowState: "idle" }
    });

    assert.equal(state.hatchState.started, true);
    assert.equal(state.hatchState.jobs["row-idle"]?.status, "running");
  });
});

describe("freezeProgressContentOnCancel", () => {
  it("stops researching agents so cancel UI does not keep spinning", () => {
    let state = INITIAL_PROGRESS_CONTENT;
    state = reduceProgressContent(state, {
      kind: "agent_start",
      jobId: "job-1",
      agentId: 1,
      agentName: "著作"
    });
    state = reduceProgressContent(state, {
      kind: "agent_start",
      jobId: "job-1",
      agentId: 2,
      agentName: "对话"
    });

    const frozen = freezeProgressContentOnCancel(state);
    assert.equal(frozen.agents[0]?.status, "cancelled");
    assert.equal(frozen.agents[1]?.status, "cancelled");
    assert.equal(frozen.agents[2]?.status, "cancelled");
    assert.ok(frozen.agents.every((a) => a.status !== "running" && a.status !== "pending"));
  });
});
