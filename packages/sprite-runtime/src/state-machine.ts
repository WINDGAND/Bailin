/**
 * 精灵状态机运行时：按当前状态上的 transitions 消费事件。
 *
 * DSL 像素程序与 atlas 图集共用这一套；渲染层每帧 `step`，点击/拖拽/聊天则 `send`。
 * guard 走沙箱求值（见 `guard-eval`）。本模块不画图、不读 DOM。
 */
import type { SpriteDSL, SpriteEvent, SpriteState } from "@bailin/character-protocol";
import { evalGuard, type GuardContext } from "./guard-eval.js";

/**
 * 可变的状态机句柄。内部用闭包持有状态；调用方只通过这里读写。
 */
export interface StateMachineRuntime {
  /** 当前精灵状态（idle / walk / talk 等）。 */
  state: SpriteState;
  /** 经过的步数；每次 `step` 自增，供 guard 里的 `tick` 使用。 */
  tick: number;
  /** 连续处于 idle 的整秒数；离开 idle 会清零。 */
  idleSeconds: number;
  /**
   * 投递一个外部事件，按当前状态的 transitions 尝试切换。
   * 无匹配或 guard 失败则保持原状。无 IO 副作用。
   */
  send(event: SpriteEvent): void;
  /**
   * 推进一帧：累加 tick / idle 计时，并自动发送 `tick`
   *（供 arrived / frameDone / 随机 fidget 等 guard 消费）。
   *
   * @param deltaMs 本帧间隔毫秒；只在 idle 时计入闲置时长
   */
  step(deltaMs: number): void;
  /** 当前动画是否播完；动画层在末帧置 true，状态机切态后会清掉。 */
  setFrameDone(done: boolean): void;
  /** 行走是否到达目标点；atlas 空闲行为在到位时置 true。 */
  setArrived(arrived: boolean): void;
}

/**
 * createStateMachine 的最小输入契约：只需要状态机本体。
 * DSL / atlas 两种 SpriteProgram 都满足，因此各自渲染层
 * 可以传同一个状态机给这个 runtime，而不用拼出完整的 SpriteDSL。
 */
export interface StateMachineHost {
  stateMachine: {
    initial: SpriteState;
    states: Partial<
      Record<
        SpriteState,
        {
          transitions: Array<{
            on: SpriteEvent;
            to: SpriteState;
            guard?: string;
          }>;
        }
      >
    >;
  };
}

/**
 * 创建精灵状态机运行时。
 *
 * @param host 完整 `SpriteDSL`，或只含 `stateMachine` 的 atlas 宿主
 * @returns 可变 runtime；状态存在闭包里，无外部副作用
 */
export function createStateMachine(
  host: StateMachineHost | SpriteDSL
): StateMachineRuntime {
  const sm = host.stateMachine;
  let state: SpriteState = sm.initial;
  let tick = 0;
  let idleMs = 0;
  let frameDone = false;
  let arrived = false;

  function buildCtx(): GuardContext {
    return {
      tick,
      // 桌宠窗口目前不把「鼠标是否在精灵内」传给 guard，字段保留给未来 hover 态。
      mouseInBounds: false,
      dragging: state === "drag",
      idleSeconds: Math.floor(idleMs / 1000),
      arrived: () => arrived,
      frameDone: () => frameDone,
      rand: () => Math.random()
    };
  }

  function send(event: SpriteEvent): void {
    const def = sm.states[state];
    if (!def) return;
    const ctx = buildCtx();
    for (const t of def.transitions) {
      if (t.on !== event) continue;
      if (!evalGuard(t.guard, ctx)) continue;
      state = t.to;
      // 切入 idle 时从 0 重新计时，避免把上一轮闲置时长带进新 idle 而立刻触发 guard。
      idleMs = state === "idle" ? 0 : idleMs;
      // 一次性标志属于上一状态；不清理则下一拍 tick 可能立刻再命中同一条 guard。
      frameDone = false;
      arrived = false;
      return;
    }
  }

  function step(deltaMs: number): void {
    tick += 1;
    if (state === "idle") idleMs += deltaMs;
    else idleMs = 0;
    send("tick");
  }

  return {
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    get idleSeconds() {
      return Math.floor(idleMs / 1000);
    },
    send,
    step,
    setFrameDone(done) {
      frameDone = done;
    },
    setArrived(value) {
      arrived = value;
    }
  };
}
