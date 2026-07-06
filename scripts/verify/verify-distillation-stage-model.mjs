#!/usr/bin/env node
/**
 * 回归检查：深度蒸馏进度页的阶段展示 reducer（reduceStageDisplay）必须"只前进
 * 不后退"，即使后端因为质量自检触发的定向重提炼而把 phase 重新变回
 * "synthesizing"（外部表现就是进度从 90% 附近跳回 40% 附近）。
 *
 * 背景 bug：用户反馈"深度蒸馏跑完质量自检后进度条从 90% 突然跳回 40%多，
 * 看得一头雾水"。根因：bailin-orchestrator.ts 的质量自检重提炼循环会重新
 * yield phase="synthesizing"，而 UI 之前是直接拿后端 progress 数字渲染，
 * 完全没有"阶段只能前进"的概念。
 *
 * 这个模块是纯逻辑（stage-model.ts，无 React/DOM 依赖），但渲染层没有现成的
 * 编译产物可以 require（不像主进程有 tsup/tsc 输出 dist/*.js）。这里用仓库
 * 已有的 esbuild（vite 的间接依赖）现场把单个 .ts 文件编译成 CJS 再 require，
 * 不引入新依赖、不需要额外的构建步骤。
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
  "apps/desktop/src/renderer/settings/progress/stage-model.ts"
);
const tmpPath = resolve(__dirname, ".tmp-stage-model.cjs");

const result = esbuild.buildSync({
  entryPoints: [srcPath],
  bundle: false,
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
  const { reduceStageDisplay, INITIAL_STAGE_DISPLAY, STAGE_KEYS } = require(tmpPath);

  check("STAGE_KEYS 有 6 个阶段", STAGE_KEYS.length === 6, `got ${STAGE_KEYS.length}`);

  // 正常的一条主线：调研 → 提炼 → 装配人格卡 → 外貌 → 形象绘制 → 质量自检
  let s = INITIAL_STAGE_DISPLAY;
  s = reduceStageDisplay(s, { phase: "researching", message: "启动 6 路并行调研…" });
  check("researching → activeIndex=0", s.activeIndex === 0, `got ${s.activeIndex}`);

  s = reduceStageDisplay(s, { phase: "synthesizing", message: "正在提炼心智模型…" });
  check("synthesizing → activeIndex=1（正常前进）", s.activeIndex === 1, `got ${s.activeIndex}`);

  s = reduceStageDisplay(s, { phase: "building_card", message: "装配人格卡…" });
  check("building_card → activeIndex=2", s.activeIndex === 2, `got ${s.activeIndex}`);

  s = reduceStageDisplay(s, { phase: "researching_appearance", message: "调研外貌…" });
  s = reduceStageDisplay(s, { phase: "building_sprite", message: "绘制像素形象…" });
  s = reduceStageDisplay(s, { phase: "quality_check", message: "运行质量自检…" });
  check("quality_check → activeIndex=5（走到最后一步）", s.activeIndex === 5, `got ${s.activeIndex}`);
  check("质量自检正常运行时不应标记为「重提炼中」", s.isResynthesizing === false);

  // 核心回归用例：质量自检不通过触发定向重提炼，phase 变回 synthesizing。
  s = reduceStageDisplay(s, {
    phase: "synthesizing",
    message: "第 1 轮提炼中：正在优化思维框架与表达逻辑，不影响外貌与桌宠绘制"
  });
  check(
    "质量自检重提炼：activeIndex 不能后退，必须停在 5（不能变回 1）",
    s.activeIndex === 5,
    `got ${s.activeIndex}`
  );
  check("质量自检重提炼：应标记为「重提炼中」", s.isResynthesizing === true);
  check("质量自检重提炼：应正确解析出轮次号 1", s.resynthesisRound === 1, `got ${s.resynthesisRound}`);
  check(
    "质量自检重提炼：message 应该原样透传给 UI 做副标题",
    s.message.includes("第 1 轮提炼中"),
    `got message=${JSON.stringify(s.message)}`
  );

  // 重提炼跑完，质量自检重新运行：应该清掉"重提炼中"标记，回到 activeIndex=5。
  s = reduceStageDisplay(s, { phase: "quality_check", message: "运行质量自检…" });
  check(
    "重提炼后质量自检重新运行：activeIndex 保持 5",
    s.activeIndex === 5,
    `got ${s.activeIndex}`
  );
  check("重提炼后质量自检重新运行：应清掉「重提炼中」标记", s.isResynthesizing === false);
  check("重提炼后质量自检重新运行：resynthesisRound 应清空", s.resynthesisRound === null);

  // 第二轮重提炼：轮次号应该正确识别为 2，而不是卡在 1。
  s = reduceStageDisplay(s, {
    phase: "synthesizing",
    message: "第 2 轮提炼中：正在优化思维框架与表达逻辑，不影响外貌与桌宠绘制"
  });
  check("第 2 轮重提炼：activeIndex 仍然停在 5", s.activeIndex === 5, `got ${s.activeIndex}`);
  check("第 2 轮重提炼：轮次号应识别为 2", s.resynthesisRound === 2, `got ${s.resynthesisRound}`);

  // checkpoint 状态（awaiting_research_ok）应该并入 researching 桶，不产生独立阶段跳变。
  let s2 = INITIAL_STAGE_DISPLAY;
  s2 = reduceStageDisplay(s2, { phase: "researching", message: "启动 6 路并行调研…" });
  s2 = reduceStageDisplay(s2, {
    phase: "awaiting_research_ok",
    message: "调研完成（成功 6/6，失败 0），等待你确认"
  });
  check(
    "awaiting_research_ok 并入 researching 桶：activeIndex 仍是 0",
    s2.activeIndex === 0,
    `got ${s2.activeIndex}`
  );

  // 未知的意外倒退（目前代码不会触发，属于防御性用例）：不应该崩溃，也不应该后退。
  let s3 = INITIAL_STAGE_DISPLAY;
  s3 = reduceStageDisplay(s3, { phase: "building_sprite", message: "绘制像素形象…" });
  s3 = reduceStageDisplay(s3, { phase: "researching", message: "某种未预期的倒退" });
  check(
    "未识别为定向重提炼的意外倒退：activeIndex 依然不后退（防御性兜底）",
    s3.activeIndex === 4,
    `got ${s3.activeIndex}`
  );
  check(
    "未识别为定向重提炼的意外倒退：不应该被误标记为「重提炼中」（角标会显示跟消息对不上的轮次号）",
    s3.isResynthesizing === false,
    `got isResynthesizing=${s3.isResynthesizing}`
  );
} finally {
  rmSync(tmpPath, { force: true });
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll distillation stage-model cases passed.`);
