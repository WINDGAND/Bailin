import { STAGE_COUNT } from "./stage-model.js";

/**
 * 深度创建会话的用时状态（纯渲染层，不依赖主进程）。
 *
 * 暂停用「平移时钟」：resume 时把 startedAt / stageStartedAt 往前推 pauseDt，
 * 这样 elapsed = (pausedAt ?? now) - startedAt 始终成立，无需另存 pausedTotal。
 */
export interface TimingState {
  startedAt: number | null;
  stageStartedAt: number | null;
  /** 非 null 表示计时已暂停（调研确认 / 形象确认等待中）。 */
  pausedAt: number | null;
  activeIndex: number;
  /** 已完成步骤的最终耗时；进行中步骤为 null，由 selectStageElapsedMs 实时算。 */
  stageDurationsMs: Array<number | null>;
  /** 终态后冻结的总用时；非终态为 null。 */
  frozenTotalMs: number | null;
  frozen: boolean;
}

export const INITIAL_TIMING: TimingState = {
  startedAt: null,
  stageStartedAt: null,
  pausedAt: null,
  activeIndex: 0,
  stageDurationsMs: Array.from({ length: STAGE_COUNT }, () => null),
  frozenTotalMs: null,
  frozen: false
};

export type TimingEvent =
  | { kind: "start"; now: number }
  | { kind: "pause"; now: number }
  | { kind: "resume"; now: number }
  | { kind: "setActiveIndex"; now: number; activeIndex: number }
  | { kind: "freeze"; now: number };

function emptyStages(): Array<number | null> {
  return Array.from({ length: STAGE_COUNT }, () => null);
}

function clampIndex(index: number): number {
  return Math.max(0, Math.min(STAGE_COUNT - 1, index));
}

function effectiveNow(state: TimingState, now: number): number {
  return state.pausedAt ?? now;
}

export function selectTotalElapsedMs(state: TimingState, now: number): number {
  if (state.frozen && state.frozenTotalMs != null) {
    return state.frozenTotalMs;
  }
  if (state.startedAt == null) return 0;
  return Math.max(0, effectiveNow(state, now) - state.startedAt);
}

/**
 * 返回某步应展示的耗时。
 * - 已落账 → 固定值
 * - 当前进行中（含暂停冻结）→ 实时/冻结值
 * - 尚未开始 → null
 */
export function selectStageElapsedMs(
  state: TimingState,
  index: number,
  now: number
): number | null {
  if (index < 0 || index >= STAGE_COUNT) return null;
  const finalized = state.stageDurationsMs[index];
  if (finalized != null) return finalized;
  if (state.startedAt == null || state.stageStartedAt == null) return null;
  if (index !== state.activeIndex) return null;
  return Math.max(0, effectiveNow(state, now) - state.stageStartedAt);
}

export function isTimingPaused(state: TimingState): boolean {
  return state.pausedAt != null && !state.frozen;
}

/** `<60min` → `m:ss`；否则 `h:mm:ss`。 */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

function finalizeActiveStage(state: TimingState, now: number): Array<number | null> {
  const stages = [...state.stageDurationsMs];
  const idx = state.activeIndex;
  if (
    idx >= 0 &&
    idx < STAGE_COUNT &&
    stages[idx] == null &&
    state.stageStartedAt != null
  ) {
    stages[idx] = Math.max(0, effectiveNow(state, now) - state.stageStartedAt);
  }
  return stages;
}

export function reduceTiming(prev: TimingState, event: TimingEvent): TimingState {
  switch (event.kind) {
    case "start": {
      return {
        startedAt: event.now,
        stageStartedAt: event.now,
        pausedAt: null,
        activeIndex: 0,
        stageDurationsMs: emptyStages(),
        frozenTotalMs: null,
        frozen: false
      };
    }
    case "pause": {
      if (prev.frozen || prev.startedAt == null || prev.pausedAt != null) {
        return prev;
      }
      return { ...prev, pausedAt: event.now };
    }
    case "resume": {
      if (prev.frozen || prev.pausedAt == null || prev.startedAt == null) {
        return prev;
      }
      const dt = Math.max(0, event.now - prev.pausedAt);
      return {
        ...prev,
        startedAt: prev.startedAt + dt,
        stageStartedAt:
          prev.stageStartedAt == null ? prev.stageStartedAt : prev.stageStartedAt + dt,
        pausedAt: null
      };
    }
    case "setActiveIndex": {
      if (prev.frozen || prev.startedAt == null) return prev;
      const nextIndex = clampIndex(event.activeIndex);
      // 不后退；重提炼停在最后一步时这里是 no-op，当前步继续计时。
      if (nextIndex <= prev.activeIndex) return prev;

      const stages = [...prev.stageDurationsMs];
      const end = effectiveNow(prev, event.now);

      // 落账当前步；若一次跳过多步，中间步记 0（正常路径每次 +1）。
      for (let i = prev.activeIndex; i < nextIndex; i++) {
        if (stages[i] != null) continue;
        if (i === prev.activeIndex && prev.stageStartedAt != null) {
          stages[i] = Math.max(0, end - prev.stageStartedAt);
        } else {
          stages[i] = 0;
        }
      }

      return {
        ...prev,
        activeIndex: nextIndex,
        stageStartedAt: end,
        stageDurationsMs: stages
      };
    }
    case "freeze": {
      if (prev.frozen) return prev;
      if (prev.startedAt == null) {
        return {
          ...prev,
          frozen: true,
          frozenTotalMs: 0,
          stageDurationsMs: emptyStages()
        };
      }
      const stages = finalizeActiveStage(prev, event.now);
      const total = selectTotalElapsedMs({ ...prev, stageDurationsMs: stages }, event.now);
      return {
        ...prev,
        stageDurationsMs: stages,
        frozenTotalMs: total,
        frozen: true,
        pausedAt: prev.pausedAt ?? event.now
      };
    }
    default:
      return prev;
  }
}
