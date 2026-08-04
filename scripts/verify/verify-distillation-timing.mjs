#!/usr/bin/env node
/**
 * 回归检查：深度创建用时 reducer（reduceTiming）——总用时 + 分步用时，
 * 确认等待期间暂停、前进落账、终态冻结、重提炼不重置最后一步。
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { writeFileSync, rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const esbuildPath = require.resolve("esbuild", {
  paths: [resolve(repoRoot, "apps/desktop/node_modules"), resolve(repoRoot, "node_modules")]
});
const esbuild = require(esbuildPath);

const srcPath = resolve(
  repoRoot,
  "apps/desktop/src/renderer/settings/progress/distillation-timing.ts"
);
const tmpPath = resolve(__dirname, ".tmp-distillation-timing.cjs");

const result = esbuild.buildSync({
  entryPoints: [srcPath],
  bundle: true,
  format: "cjs",
  platform: "node",
  write: false,
  logLevel: "silent"
});
writeFileSync(tmpPath, result.outputFiles[0].text);

let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}${detail ? " — " + detail : ""}`);
  }
}

try {
  const {
    reduceTiming,
    INITIAL_TIMING,
    selectTotalElapsedMs,
    selectStageElapsedMs,
    formatDuration,
    isTimingPaused
  } = require(tmpPath);

  check("formatDuration <1min", formatDuration(42_000) === "0:42", `got ${formatDuration(42_000)}`);
  check("formatDuration minutes", formatDuration(222_000) === "3:42", `got ${formatDuration(222_000)}`);
  check(
    "formatDuration hours",
    formatDuration(3_662_000) === "1:01:02",
    `got ${formatDuration(3_662_000)}`
  );

  let t = INITIAL_TIMING;
  const t0 = 1_000_000;
  t = reduceTiming(t, { kind: "start", now: t0 });
  check("start: startedAt", t.startedAt === t0);
  check("start: activeIndex=0", t.activeIndex === 0);
  check("start: not paused", isTimingPaused(t) === false);
  check(
    "start: total after 5s",
    selectTotalElapsedMs(t, t0 + 5_000) === 5_000,
    `got ${selectTotalElapsedMs(t, t0 + 5_000)}`
  );
  check(
    "start: stage0 after 5s",
    selectStageElapsedMs(t, 0, t0 + 5_000) === 5_000,
    `got ${selectStageElapsedMs(t, 0, t0 + 5_000)}`
  );
  check("start: stage1 not started", selectStageElapsedMs(t, 1, t0 + 5_000) === null);

  // 调研跑了 10s → 暂停（确认等待）再过 60s → 总时仍为 10s
  t = reduceTiming(t, { kind: "pause", now: t0 + 10_000 });
  check("pause: isTimingPaused", isTimingPaused(t) === true);
  check(
    "pause: total frozen at 10s even after wall+60s",
    selectTotalElapsedMs(t, t0 + 70_000) === 10_000,
    `got ${selectTotalElapsedMs(t, t0 + 70_000)}`
  );
  check(
    "pause: stage0 frozen at 10s",
    selectStageElapsedMs(t, 0, t0 + 70_000) === 10_000,
    `got ${selectStageElapsedMs(t, 0, t0 + 70_000)}`
  );

  // 恢复后续跑 3s → 总 13s；再前进到 step1，step0 落账 13s
  t = reduceTiming(t, { kind: "resume", now: t0 + 70_000 });
  check("resume: not paused", isTimingPaused(t) === false);
  check(
    "resume: total still 10s at resume instant",
    selectTotalElapsedMs(t, t0 + 70_000) === 10_000,
    `got ${selectTotalElapsedMs(t, t0 + 70_000)}`
  );
  check(
    "resume: total 13s after +3s work",
    selectTotalElapsedMs(t, t0 + 73_000) === 13_000,
    `got ${selectTotalElapsedMs(t, t0 + 73_000)}`
  );

  t = reduceTiming(t, { kind: "setActiveIndex", now: t0 + 73_000, activeIndex: 1 });
  check("advance: activeIndex=1", t.activeIndex === 1);
  check(
    "advance: stage0 finalized 13s",
    t.stageDurationsMs[0] === 13_000,
    `got ${t.stageDurationsMs[0]}`
  );
  check(
    "advance: stage1 live 0 at advance instant",
    selectStageElapsedMs(t, 1, t0 + 73_000) === 0,
    `got ${selectStageElapsedMs(t, 1, t0 + 73_000)}`
  );
  check(
    "advance: stage1 live 4s later",
    selectStageElapsedMs(t, 1, t0 + 77_000) === 4_000,
    `got ${selectStageElapsedMs(t, 1, t0 + 77_000)}`
  );
  check(
    "advance: stage0 stays finalized",
    selectStageElapsedMs(t, 0, t0 + 77_000) === 13_000
  );

  // 不后退：试图 setActiveIndex=0 应 no-op
  const beforeBack = t;
  t = reduceTiming(t, { kind: "setActiveIndex", now: t0 + 77_000, activeIndex: 0 });
  check("no-retreat: activeIndex still 1", t.activeIndex === 1);
  check("no-retreat: stage0 duration unchanged", t.stageDurationsMs[0] === beforeBack.stageDurationsMs[0]);

  // 走到最后一步，再 freeze
  t = reduceTiming(t, { kind: "setActiveIndex", now: t0 + 80_000, activeIndex: 5 });
  // stage1 应落账 7s（73→80），2/3/4 为 0（跳跃）
  check(
    "jump: stage1 finalized",
    t.stageDurationsMs[1] === 7_000,
    `got ${t.stageDurationsMs[1]}`
  );
  check("jump: intermediate stage2 = 0", t.stageDurationsMs[2] === 0);
  check("jump: activeIndex=5", t.activeIndex === 5);

  const beforeSame = t;
  t = reduceTiming(t, { kind: "setActiveIndex", now: t0 + 90_000, activeIndex: 5 });
  check(
    "resynth no-op: same index keeps stage5 live (not finalized)",
    t.stageDurationsMs[5] === null && beforeSame.stageDurationsMs[5] === null
  );
  check(
    "resynth no-op: stage5 still ticking",
    selectStageElapsedMs(t, 5, t0 + 90_000) === 10_000,
    `got ${selectStageElapsedMs(t, 5, t0 + 90_000)}`
  );

  t = reduceTiming(t, { kind: "freeze", now: t0 + 95_000 });
  check("freeze: frozen flag", t.frozen === true);
  check(
    "freeze: total locked",
    t.frozenTotalMs === selectTotalElapsedMs(t, t0 + 999_000),
    `frozenTotalMs=${t.frozenTotalMs} select=${selectTotalElapsedMs(t, t0 + 999_000)}`
  );
  check(
    "freeze: stage5 finalized",
    t.stageDurationsMs[5] === 15_000,
    `got ${t.stageDurationsMs[5]}`
  );
  check(
    "freeze: further wall time ignored",
    selectTotalElapsedMs(t, t0 + 999_000) === t.frozenTotalMs
  );

  // 暂停中取消：freeze 应锁在 pause 时刻
  let t2 = reduceTiming(INITIAL_TIMING, { kind: "start", now: 0 });
  t2 = reduceTiming(t2, { kind: "pause", now: 8_000 });
  t2 = reduceTiming(t2, { kind: "freeze", now: 50_000 });
  check(
    "freeze while paused: total = 8s not 50s",
    t2.frozenTotalMs === 8_000,
    `got ${t2.frozenTotalMs}`
  );
  check(
    "freeze while paused: stage0 = 8s",
    t2.stageDurationsMs[0] === 8_000,
    `got ${t2.stageDurationsMs[0]}`
  );

  // 重复 pause / resume 应幂等
  let t3 = reduceTiming(INITIAL_TIMING, { kind: "start", now: 0 });
  t3 = reduceTiming(t3, { kind: "pause", now: 1_000 });
  const pausedOnce = t3;
  t3 = reduceTiming(t3, { kind: "pause", now: 2_000 });
  check("double pause: pausedAt unchanged", t3.pausedAt === pausedOnce.pausedAt);
  t3 = reduceTiming(t3, { kind: "resume", now: 5_000 });
  t3 = reduceTiming(t3, { kind: "resume", now: 6_000 });
  check("double resume: still not paused", isTimingPaused(t3) === false);
  check(
    "double resume: elapsed correct (+1s work after first resume)",
    selectTotalElapsedMs(t3, 6_000) === 2_000,
    `got ${selectTotalElapsedMs(t3, 6_000)}`
  );
} finally {
  rmSync(tmpPath, { force: true });
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll distillation timing cases passed.`);
