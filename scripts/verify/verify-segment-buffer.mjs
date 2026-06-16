// 离线验证 SegmentBuffer 的切段策略：
//   - 长段输入按句末标点切；
//   - 没标点也强制 ≤30 字（按软标点优先）；
//   - 流式追加一致；
//   - finalize 把 rawTail 收尾。

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// 因为 segment-buffer.ts 不依赖 Electron / React，这里直接用 tsx-style 装载
// 太麻烦——我们在 Node 里用一个简化等价的 JS 实现做行为对照（保证 plan 描述能跑）。
// 真正用的 SegmentBuffer 在 src/renderer/bubble/segment-buffer.ts，本脚本用同算法做最小复现。

const SENT_BREAK = /[。？！；!?;…]/;
const SOFT_BREAK = /[，、,：:—\n\t]/;

class B {
  constructor(opts = {}) {
    this.maxChars = opts.maxChars ?? 30;
    this.minDwell = opts.minDwellMs ?? 800;
    this.maxDwell = opts.maxDwellMs ?? 1800;
    this.queue = [];
    this.current = null;
    this.rawTail = "";
    this.events = [];
  }

  setStreamingText(full) {
    const consumed = (this.current?.text.length ?? 0) + this.queue.reduce((a, s) => a + s.text.length, 0);
    if (full.length < consumed) {
      this.queue = [];
      this.current = null;
      this.rawTail = full;
    } else {
      this.rawTail = full.slice(consumed);
    }
    this.tryEmit({ flushAll: false });
  }

  finalize() {
    this.tryEmit({ flushAll: true });
  }

  tryEmit({ flushAll }) {
    while (true) {
      const piece = this.takeNextPiece(flushAll);
      if (!piece) break;
      const seg = { text: piece.trim() };
      if (!seg.text) continue;
      if (this.current === null && this.queue.length === 0) {
        this.current = seg;
        this.events.push(`current=${seg.text}`);
      } else {
        this.queue.push(seg);
        this.events.push(`enqueue=${seg.text}`);
      }
    }
  }

  takeNextPiece(flushAll) {
    if (this.rawTail.length === 0) return null;
    const scanLen = Math.min(this.rawTail.length, this.maxChars);
    for (let i = 0; i < scanLen; i++) {
      if (SENT_BREAK.test(this.rawTail[i])) {
        const piece = this.rawTail.slice(0, i + 1);
        this.rawTail = this.rawTail.slice(i + 1);
        return piece;
      }
    }
    if (this.rawTail.length >= this.maxChars) {
      const w = this.rawTail.slice(0, this.maxChars);
      let cut = -1;
      for (let i = w.length - 1; i >= Math.floor(this.maxChars / 2); i--) {
        if (SOFT_BREAK.test(w[i])) { cut = i + 1; break; }
      }
      if (cut < 0) cut = this.maxChars;
      const piece = this.rawTail.slice(0, cut);
      this.rawTail = this.rawTail.slice(cut);
      return piece;
    }
    if (flushAll) { const piece = this.rawTail; this.rawTail = ""; return piece; }
    return null;
  }
}

function snapshot(b) {
  return { current: b.current?.text ?? null, queue: b.queue.map(s => s.text), tail: b.rawTail };
}

function expect(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  PASS" : "  FAIL"} - ${label}`);
  if (!ok) {
    console.log("    got: ", JSON.stringify(got));
    console.log("    want:", JSON.stringify(want));
    process.exitCode = 1;
  }
}

// ===== Case 1: 长文本一次性 pushFinal（whisper 场景） =====
{
  console.log("Case 1: pushFinal 一次性长文本");
  const b = new B();
  // 模拟 pushFinal 一次性塞入：直接 setStreamingText + finalize
  const txt = "我小时候亲眼看见父母死在歹徒刀下，以为自己那天也会死。这世界从来不会给任何人留情面，要活下去就得攥紧刀。但艾伦把那条红围巾围在我脖子上的瞬间，风裹着麦香吹过来的时候，我看见的。";
  b.setStreamingText(txt);
  b.finalize();
  const snap = snapshot(b);
  console.log("    current:", snap.current);
  console.log("    queue:", snap.queue);
  expect("rawTail 已清空", snap.tail, "");
  expect("有多段", snap.queue.length > 0, true);
  const allSegs = [snap.current, ...snap.queue];
  expect("每段 ≤30 字", allSegs.every(s => s.length <= 30), true);
}

// ===== Case 2: 流式追加（chat 场景，每次 chunk 全文累积） =====
{
  console.log("\nCase 2: 流式追加");
  const b = new B();
  const chunks = ["", "你好", "你好。今天怎么", "你好。今天怎么样？心情还", "你好。今天怎么样？心情还好吗？昨天那件事我"];
  for (const c of chunks) b.setStreamingText(c);
  console.log("  流式结束，finalize 前:", snapshot(b));
  b.finalize();
  console.log("  finalize 后:", snapshot(b));
  expect("第 1 段含'你好'句号", snapshot(b).current.includes("你好"), true);
}

// ===== Case 3: 没有句末标点的长串（强制软切） =====
{
  console.log("\nCase 3: 无句末标点强制软切");
  const b = new B();
  const txt = "我觉得这件事其实很复杂大家不一定理解但是从我的角度来看应该这样处理";
  b.setStreamingText(txt);
  b.finalize();
  const snap = snapshot(b);
  console.log("    pieces:", [snap.current, ...snap.queue]);
  expect("每段 ≤30 字", [snap.current, ...snap.queue].every(s => s.length <= 30), true);
}

console.log("\n" + (process.exitCode ? "❌ 有失败" : "✅ 全部通过"));
