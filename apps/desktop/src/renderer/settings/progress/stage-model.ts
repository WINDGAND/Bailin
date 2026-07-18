import type { DistillationJobStatus } from "@bailin/character-protocol";

/**
 * 深度蒸馏对用户可见的固定阶段顺序（6 步）。
 * 不包含 checkpoint 状态（awaiting_research_ok / awaiting_synth_ok，并入相邻主阶段）
 * 和终态（done / failed / cancelled，由上层单独处理）。
 */
export const STAGE_KEYS = [
  "researching",
  "synthesizing",
  "building_card",
  "researching_appearance",
  "building_sprite",
  "quality_check"
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGE_COUNT = STAGE_KEYS.length;

/**
 * 把后端 phase 状态映射到 6 个可见阶段的下标；checkpoint 状态并入相邻主阶段。
 * "pending" 仅为类型完整性保留——后端从未真正把它作为 kind:"phase" 事件 yield
 * 出来（只在建 job 时写入数据库字段），实际不会触发这一分支。
 */
const STAGE_INDEX: Partial<Record<DistillationJobStatus, number>> = {
  pending: 0,
  researching: 0,
  awaiting_research_ok: 0,
  synthesizing: 1,
  awaiting_synth_ok: 1,
  building_card: 2,
  researching_appearance: 3,
  building_sprite: 4,
  awaiting_sprite_ok: 4,
  quality_check: 5
};

export interface StageDisplayState {
  /** 当前应该高亮显示的阶段下标（0..STAGE_COUNT-1），只会前进，不会后退。 */
  activeIndex: number;
  /** 是否处于「质量自检触发的定向重提炼」——这种场景后端 phase 会看起来倒退。 */
  isResynthesizing: boolean;
  /** 重提炼轮次（仅 isResynthesizing 为 true 时有意义）。 */
  resynthesisRound: number | null;
  /** 最新一条阶段说明文字，原样透传给 UI 做副标题。 */
  message: string;
}

export const INITIAL_STAGE_DISPLAY: StageDisplayState = {
  activeIndex: 0,
  isResynthesizing: false,
  resynthesisRound: null,
  message: ""
};

/** 定向重提炼的阶段消息固定以这个前缀开头（见 bailin-orchestrator.ts phaseEvent 调用处）。 */
const RESYNTH_PATTERN = /^第 (\d+) 轮提炼中[：:]/;

/**
 * 根据后端推来的 phase 事件，计算下一个展示状态。
 *
 * 核心规则：activeIndex 只会前进，不会后退——即使后端为了「质量自检触发的
 * 定向重提炼」这个合理的重试机制，把 phase 重新变回 "synthesizing"（外部
 * 表现就是进度从 quality_check 附近跳回 synthesizing 附近），UI 也不应该
 * 把用户已经看到的「质量自检」步骤又退回「提炼」步骤——那看起来就像进度条
 * 坏了。真实发生的事情是"正在优化，不是从头重来"，所以改成在已到达的最高
 * 阶段上标一个"优化中 · 第 N 轮"角标，阶段指示器本身不后退。
 */
export function reduceStageDisplay(
  prev: StageDisplayState,
  incoming: { phase: DistillationJobStatus; message: string }
): StageDisplayState {
  const incomingIndex = STAGE_INDEX[incoming.phase];
  if (incomingIndex == null) {
    return { ...prev, message: incoming.message };
  }

  if (incomingIndex < prev.activeIndex) {
    const resynthMatch = incoming.message.match(RESYNTH_PATTERN);
    if (!resynthMatch) {
      // 没识别出「定向重提炼」这个已知的合理回退原因：真正意外的倒退。
      // 目前后端代码不会走到这个分支，属于防御性兜底——原样忽略，既不
      // 后退，也不能像已知重提炼那样挂"优化中"角标（那会显示一个跟消息
      // 内容对不上的轮次号，比不显示更让人困惑）。
      return prev;
    }
    return {
      ...prev,
      isResynthesizing: true,
      resynthesisRound: Number(resynthMatch[1]),
      message: incoming.message
    };
  }

  return {
    activeIndex: incomingIndex,
    isResynthesizing: false,
    resynthesisRound: null,
    message: incoming.message
  };
}
