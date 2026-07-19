import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HatchPetRowState } from "@bailin/character-protocol";
import { submitSpriteCheckpointAction } from "./sprite-checkpoint-action.js";

const rows: HatchPetRowState[] = ["idle", "running-right"];

describe("submitSpriteCheckpointAction", () => {
  it("keeps the checkpoint open when the main process rejects the approval", async () => {
    const result = await submitSpriteCheckpointAction(
      "continue",
      rows,
      "job-1",
      async () => ({ ok: false })
    );

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /未能继续/);
  });

  it("passes failed rows only for retry and accepts a successful response", async () => {
    let receivedRows: HatchPetRowState[] | undefined;
    const result = await submitSpriteCheckpointAction(
      "retry",
      rows,
      "job-1",
      async (input) => {
        receivedRows = input.spriteRetryRows;
        return { ok: true };
      }
    );

    assert.equal(result.ok, true);
    assert.deepEqual(receivedRows, rows);
  });
});
