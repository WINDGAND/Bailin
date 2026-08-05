import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterReorderError,
  buildSortOrderBackfill,
  validateCharacterReorderIds
} from "./character-sort-order.js";

describe("validateCharacterReorderIds", () => {
  it("accepts a permutation of the same ids", () => {
    assert.doesNotThrow(() =>
      validateCharacterReorderIds(["a", "b", "c"], ["c", "a", "b"])
    );
  });

  it("rejects length mismatch", () => {
    assert.throws(
      () => validateCharacterReorderIds(["a", "b"], ["a"]),
      (err: unknown) => err instanceof CharacterReorderError
    );
  });

  it("rejects unknown id", () => {
    assert.throws(
      () => validateCharacterReorderIds(["a", "b"], ["a", "x"]),
      (err: unknown) =>
        err instanceof CharacterReorderError && /unknown character id/.test(err.message)
    );
  });

  it("rejects duplicate id", () => {
    assert.throws(
      () => validateCharacterReorderIds(["a", "b"], ["a", "a"]),
      (err: unknown) =>
        err instanceof CharacterReorderError && /duplicate character id/.test(err.message)
    );
  });

  it("rejects missing id", () => {
    assert.throws(
      () => validateCharacterReorderIds(["a", "b", "c"], ["a", "b", "a"]),
      CharacterReorderError
    );
  });
});

describe("buildSortOrderBackfill", () => {
  it("assigns 0..n-1 by updated_at descending", () => {
    const result = buildSortOrderBackfill([
      { id: "old", updated_at: 100 },
      { id: "new", updated_at: 300 },
      { id: "mid", updated_at: 200 }
    ]);
    assert.deepEqual(result, [
      { id: "new", sort_order: 0 },
      { id: "mid", sort_order: 1 },
      { id: "old", sort_order: 2 }
    ]);
  });

  it("breaks ties by id for stability", () => {
    const result = buildSortOrderBackfill([
      { id: "b", updated_at: 10 },
      { id: "a", updated_at: 10 }
    ]);
    assert.deepEqual(result, [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 }
    ]);
  });
});
