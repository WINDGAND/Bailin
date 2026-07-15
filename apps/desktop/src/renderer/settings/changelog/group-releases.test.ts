import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupReleasesByDay } from "./group-releases.js";

describe("groupReleasesByDay", () => {
  it("groups two releases on same local day", () => {
    const groups = groupReleasesByDay(
      [
        {
          version: "0.0.6",
          tag: "v0.0.6",
          title: "A",
          publishedAt: "2026-07-13T04:00:00Z",
          url: "https://example.com/a",
          notesMarkdown: ""
        },
        {
          version: "0.0.5",
          tag: "v0.0.5",
          title: "B",
          publishedAt: "2026-07-13T01:00:00Z",
          url: "https://example.com/b",
          notesMarkdown: ""
        }
      ],
      "zh",
      "UTC"
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.dayKey, "2026-07-13");
    assert.equal(groups[0]?.items.length, 2);
    assert.match(groups[0]?.dayLabel ?? "", /2026/);
  });

  it("formats English midnight as 00:00 (h23, not 24:00)", () => {
    const groups = groupReleasesByDay(
      [
        {
          version: "0.0.1",
          tag: "v0.0.1",
          title: "Midnight",
          publishedAt: "2026-07-14T00:00:00Z",
          url: "https://example.com/midnight",
          notesMarkdown: ""
        }
      ],
      "en",
      "UTC"
    );
    assert.equal(groups[0]?.items[0]?.timeLabel, "00:00");
  });
});
