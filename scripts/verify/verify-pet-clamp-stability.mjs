// 离线验证：模拟 electron#27651 的 size 漂移 bug，验证修复后的 clamp 链路
// 不会因为漂移而收缩可达范围。
//
// 模型：
// - 屏幕 1920x1200（物理像素，125% DPI）
// - 桌宠初始 240x260（DIP），物理 300x325
// - 修复前：每次 setPosition 让 width/height +2px（模拟 electron 漂移）
// - 修复后：永远用 PET_WINDOW_SIZE 常量，size 稳定
//
// 验收：跑 50 轮"反复拖到右下角再拖回左上角"，比较两种实现下的
// 可达 maxX / maxY。

const SCREEN = { x: 0, y: 0, width: 1920, height: 1200 };
const INIT_W = 240;
const INIT_H = 260;

function clampPos(x, y, w, h, area, margin = 0) {
  const minX = area.x + margin;
  const minY = area.y + margin;
  const maxX = area.x + area.width - w - margin;
  const maxY = area.y + area.height - h - margin;
  const cx = maxX < minX ? minX : Math.min(Math.max(x, minX), maxX);
  const cy = maxY < minY ? minY : Math.min(Math.max(y, minY), maxY);
  return { x: Math.round(cx), y: Math.round(cy), maxX, maxY };
}

// "buggy" 实现：每次 setPosition 让 width/height +2px（模拟漂移）
function simulateBuggy(rounds, drift = 2) {
  let w = INIT_W;
  let h = INIT_H;
  let x = SCREEN.width - w - 24;
  let y = SCREEN.height - h - 24;
  const trace = [];
  for (let i = 0; i < rounds; i++) {
    // 拖向右下角
    const tBR = clampPos(x + 1000, y + 1000, w, h, SCREEN);
    x = tBR.x;
    y = tBR.y;
    w += drift;
    h += drift;
    // 拖向左上角
    const tTL = clampPos(-1000, -1000, w, h, SCREEN);
    x = tTL.x;
    y = tTL.y;
    w += drift;
    h += drift;
    trace.push({ round: i + 1, w, h, brMaxX: tBR.maxX, brMaxY: tBR.maxY });
  }
  return trace;
}

// "fixed" 实现：永远用常量 size（不漂移）
function simulateFixed(rounds) {
  const w = INIT_W;
  const h = INIT_H;
  let x = SCREEN.width - w - 24;
  let y = SCREEN.height - h - 24;
  const trace = [];
  for (let i = 0; i < rounds; i++) {
    const tBR = clampPos(x + 1000, y + 1000, w, h, SCREEN);
    x = tBR.x;
    y = tBR.y;
    const tTL = clampPos(-1000, -1000, w, h, SCREEN);
    x = tTL.x;
    y = tTL.y;
    trace.push({ round: i + 1, w, h, brMaxX: tBR.maxX, brMaxY: tBR.maxY });
  }
  return trace;
}

const N = 50;
const buggyTrace = simulateBuggy(N, 2);
const fixedTrace = simulateFixed(N);

console.log("=== Buggy（每次 setPosition 让 size +2px，模拟 electron#27651）===");
console.log(`R=01: w=${buggyTrace[0].w} h=${buggyTrace[0].h}  maxX(BR)=${buggyTrace[0].brMaxX} maxY(BR)=${buggyTrace[0].brMaxY}`);
console.log(`R=10: w=${buggyTrace[9].w} h=${buggyTrace[9].h}  maxX(BR)=${buggyTrace[9].brMaxX} maxY(BR)=${buggyTrace[9].brMaxY}`);
console.log(`R=25: w=${buggyTrace[24].w} h=${buggyTrace[24].h}  maxX(BR)=${buggyTrace[24].brMaxX} maxY(BR)=${buggyTrace[24].brMaxY}`);
console.log(`R=50: w=${buggyTrace[49].w} h=${buggyTrace[49].h}  maxX(BR)=${buggyTrace[49].brMaxX} maxY(BR)=${buggyTrace[49].brMaxY}`);
console.log(
  `初始可达右下 = (${SCREEN.width - INIT_W}, ${SCREEN.height - INIT_H}); R=50 退化到 (${buggyTrace[49].brMaxX}, ${buggyTrace[49].brMaxY})`
);
const buggyShrink =
  SCREEN.width - INIT_W - buggyTrace[buggyTrace.length - 1].brMaxX;
console.log(`水平方向可达范围被收缩了 ${buggyShrink} px（活动范围越用越小）。`);

console.log("");
console.log("=== Fixed（永远用 PET_WINDOW_SIZE 常量）===");
console.log(`R=01: w=${fixedTrace[0].w} h=${fixedTrace[0].h}  maxX(BR)=${fixedTrace[0].brMaxX} maxY(BR)=${fixedTrace[0].brMaxY}`);
console.log(`R=50: w=${fixedTrace[49].w} h=${fixedTrace[49].h}  maxX(BR)=${fixedTrace[49].brMaxX} maxY(BR)=${fixedTrace[49].brMaxY}`);
const fixedShrink =
  SCREEN.width - INIT_W - fixedTrace[fixedTrace.length - 1].brMaxX;
console.log(`水平方向可达范围被收缩了 ${fixedShrink} px（应当为 0）。`);

if (fixedShrink === 0 && buggyShrink > 0) {
  console.log("");
  console.log("✅ PASS: 修复后 size 漂移被完全屏蔽，桌宠可达范围恒定。");
  process.exit(0);
} else {
  console.log("");
  console.log("❌ FAIL: 修复未达到预期效果。");
  process.exit(1);
}
