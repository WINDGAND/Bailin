import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ensureLlmConfigured } from "./ensure-llm-configured.js";

describe("ensureLlmConfigured", () => {
  it("returns true when provider is already configured", async () => {
    let opened = false;
    const ok = await ensureLlmConfigured({
      bailin: {
        llm: { getProvider: async () => ({ model: "x" }) },
        pet: {
          openSettings: async () => {
            opened = true;
          }
        }
      },
      confirm: async () => true,
      t: (key) => key
    });
    assert.equal(ok, true);
    assert.equal(opened, false);
  });

  it("opens settings when user confirms configure", async () => {
    let openedTab: string | undefined;
    const ok = await ensureLlmConfigured({
      bailin: {
        llm: { getProvider: async () => null },
        pet: {
          openSettings: async (tab?) => {
            openedTab = tab;
          }
        }
      },
      confirm: async () => true,
      t: (key) => key
    });
    assert.equal(ok, false);
    assert.equal(openedTab, "key");
  });

  it("returns false without navigating when user cancels", async () => {
    let opened = false;
    const ok = await ensureLlmConfigured({
      bailin: {
        llm: { getProvider: async () => null },
        pet: {
          openSettings: async () => {
            opened = true;
          }
        }
      },
      confirm: async () => false,
      t: (key) => key
    });
    assert.equal(ok, false);
    assert.equal(opened, false);
  });
});
