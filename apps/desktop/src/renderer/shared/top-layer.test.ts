import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promoteToTopLayer, registerTopLayerHost, restackTopLayer, type TopLayerHost } from "./top-layer.js";

function makeHost(init?: Partial<TopLayerHost> & { open?: boolean }): TopLayerHost & {
  attrs: Record<string, string>;
  showCalls: number;
  hideCalls: number;
  open: boolean;
} {
  const attrs: Record<string, string> = {};
  const host = {
    attrs,
    showCalls: 0,
    hideCalls: 0,
    open: Boolean(init?.open),
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    },
    matches(selector: string) {
      return selector === ":popover-open" && host.open;
    },
    showPopover() {
      host.showCalls += 1;
      host.open = true;
    },
    hidePopover() {
      host.hideCalls += 1;
      host.open = false;
    }
  };
  return host;
}

describe("promoteToTopLayer", () => {
  it("将元素标为 manual popover 并打开，进入 top layer", () => {
    const host = makeHost();
    promoteToTopLayer(host);
    assert.equal(host.attrs.popover, "manual");
    assert.equal(host.showCalls, 1);
  });

  it("已打开时不再重复 showPopover", () => {
    const host = makeHost({ open: true });
    promoteToTopLayer(host);
    assert.equal(host.attrs.popover, "manual");
    assert.equal(host.showCalls, 0);
  });

  it("环境没有 Popover API 时不抛错", () => {
    const host = makeHost();
    delete (host as { showPopover?: () => void }).showPopover;
    assert.doesNotThrow(() => promoteToTopLayer(host));
    assert.equal(host.attrs.popover, "manual");
  });

  it("showPopover 抛错时不向外抛", () => {
    const host = makeHost();
    host.showPopover = () => {
      throw new Error("InvalidStateError");
    };
    assert.doesNotThrow(() => promoteToTopLayer(host));
    assert.equal(host.attrs.popover, "manual");
  });

  it("restackTopLayer 已打开时不 hidePopover，避免 toast 闪挡", () => {
    const host = makeHost({ open: true });
    registerTopLayerHost(host);
    host.showCalls = 0;
    host.hideCalls = 0;
    restackTopLayer();
    assert.equal(host.hideCalls, 0);
    assert.equal(host.showCalls, 0);
    assert.equal(host.open, true);
  });
});
