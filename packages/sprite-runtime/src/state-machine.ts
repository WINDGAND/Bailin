import type { SpriteDSL, SpriteEvent, SpriteState } from "@nuwa-pet/character-protocol";
import { evalGuard, type GuardContext } from "./guard-eval.js";

export interface StateMachineRuntime {
  state: SpriteState;
  tick: number;
  idleSeconds: number;
  send(event: SpriteEvent): void;
  step(deltaMs: number): void;
  setFrameDone(done: boolean): void;
  setArrived(arrived: boolean): void;
}

/**
 * createStateMachine 的最小输入契约：只需要状态机本体。
 * DSL / layered-css / atlas 三种 SpriteProgram 都满足，因此各自渲染层
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
      idleMs = state === "idle" ? 0 : idleMs;
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
