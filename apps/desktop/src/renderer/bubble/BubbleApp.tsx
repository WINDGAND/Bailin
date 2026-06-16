import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveCharacter, useNuwa } from "../shared/use-nuwa.js";
import { useChatSession } from "../shared/use-chat-session.js";
import { PetSpeechBubble, type BubbleDirection, type LatestSay } from "../pet/PetSpeechBubble.js";
import type { BubbleMode } from "../../shared/ipc-contract.js";
import { SegmentBuffer, type Segment } from "./segment-buffer.js";

/**
 * BubbleWindow 的根组件。承担三种轻交互形态：
 *   - greeting：桌宠主动说一句（点击招呼 / 主动 whisper），无输入框；
 *   - talking：在最新一句下加输入框，让用户做轻量回应；
 *   - expanded：talking 之上临时展开最近 3-5 轮上下文。
 *
 * 文本展示走 SegmentBuffer：
 *   - 一次回复无论多长，都按 ≤30 字一段切成多条 segment 顺序播放；
 *   - 每段 800-1800ms 之间停顿（按字数），上一段化掉/下一段渗入；
 *   - 全部播完后，UI 提示"还有 N 段，点 ↗ 看全文"，让用户走 ChatWindow 看完整。
 */

/** 主动 whisper 进入 greeting 后多久自动收起。 */
const AUTO_HIDE_GREETING_WHISPER_MS = 12_000;
/** 用户单击桌宠进入 greeting 后多久自动收起（给用户思考要不要打字的时间）。 */
const AUTO_HIDE_GREETING_CLICK_MS = 60_000;
/** talking / expanded：用户长时间无活动后自动收。 */
const AUTO_HIDE_TALKING_MS = 60_000;

export function BubbleApp(): JSX.Element | null {
  const nuwa = useNuwa();
  const { bundle } = useActiveCharacter();
  const [direction, setDirection] = useState<BubbleDirection | null>(null);
  const [mode, setMode] = useState<BubbleMode>("greeting");
  const [showTick, setShowTick] = useState(0);

  // historyLimit=12：留够 5 轮一问一答 + 一条引子，让 expanded 模式能展开 3-5 轮真实上下文。
  const chat = useChatSession(bundle, { surface: "bubble", historyLimit: 12 });

  // ===== SegmentBuffer：把流式输出/whisper 切段轮播 =====
  const [currentSegment, setCurrentSegment] = useState<Segment | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const buffer = useMemo(() => {
    return new SegmentBuffer({
      onCurrent: setCurrentSegment,
      onPending: setPendingCount
    });
  }, []);

  // unmount 时清掉 buffer 内部 timer
  useEffect(() => {
    return () => buffer.reset();
  }, [buffer]);

  // ===== 文本源 1：主动 whisper（一次性短文本，直接 pushFinal） =====
  useEffect(() => {
    return nuwa.on.proactiveWhisper((evt) => {
      if (!bundle || evt.characterId !== bundle.card.id) return;
      buffer.pushFinal(evt.text, "whisper");
    });
  }, [nuwa, bundle?.card.id, buffer]);

  // ===== 文本源 2：chat 流式 =====
  // chat.pending 在流式时持续累积；done 后清空，这一轮的 assistant 文本被追加到 chat.turns。
  // 我们把 pending 当作"流式累积全文"喂给 buffer.setStreamingText；
  // 一旦 phase 回 idle，就 finalize 让 buffer 把残留 rawTail 切成最后一段。
  const lastSeenAssistantId = useRef<string | null>(null);
  useEffect(() => {
    if (chat.pending) {
      buffer.setStreamingText(chat.pending, "chat");
      return;
    }
    // pending 清空：把 buffer 收尾，再把刚 done 的最后一条 assistant 当一次性 push（兼容初次进 bubble 时已有的旧消息）。
    buffer.finalize();
    const lastAssistant = [...chat.turns].reverse().find((t) => t.role === "assistant");
    if (lastAssistant && lastAssistant.id !== lastSeenAssistantId.current) {
      lastSeenAssistantId.current = lastAssistant.id;
      // 注意：流式过程中 buffer 已经收过这段全文了；这里只在初次进窗口或 chat.pending 长度为 0 但需要展示时补一刀。
      // 当 buffer 当前 segment 为 null 才补；否则保留正在轮播的状态。
      if (currentSegment === null && pendingCount === 0) {
        buffer.pushFinal(lastAssistant.content, "chat");
      }
    }
  }, [chat.pending, chat.turns, buffer, currentSegment, pendingCount]);

  // 切换角色：清掉 buffer
  useEffect(() => {
    buffer.reset();
    lastSeenAssistantId.current = null;
  }, [bundle?.card.id, buffer]);

  // 用户主动提交后：清掉旧 segment（"现在桌宠在听你说话"），等流式回来 buffer 自然推
  const prevTurnsLenRef = useRef(chat.turns.length);
  useEffect(() => {
    const prev = prevTurnsLenRef.current;
    prevTurnsLenRef.current = chat.turns.length;
    if (chat.turns.length > prev) {
      // 看最后一条是不是 user → 是说明刚提交了，把上一轮的尾巴清掉
      const last = chat.turns[chat.turns.length - 1];
      if (last && last.role === "user") {
        buffer.reset();
      }
      // 流回收到时如果还在 expanded，自动折回 talking
      if (mode === "expanded" && last && last.role === "assistant") {
        void nuwa.bubble.setMode("talking");
        setMode("talking");
      }
    }
  }, [chat.turns, mode, nuwa, buffer]);

  // ===== 订阅主进程广播 =====

  useEffect(() => {
    return nuwa.on.bubbleDirection((dir) => {
      setDirection(dir);
      setShowTick((n) => n + 1);
    });
  }, [nuwa]);

  useEffect(() => {
    return nuwa.on.bubbleMode((m) => {
      setMode(m);
      setShowTick((n) => n + 1);
    });
  }, [nuwa]);

  // ===== 自动隐藏（按 mode 分策略） =====
  // greeting + 当前 segment 来自 whisper：12s；其它 greeting：60s；talking/expanded：60s
  const segmentSource = currentSegment?.source;
  useEffect(() => {
    if (chat.streaming) return;
    if (direction === null) return;

    let delayMs: number;
    if (mode === "greeting") {
      delayMs =
        segmentSource === "whisper" ? AUTO_HIDE_GREETING_WHISPER_MS : AUTO_HIDE_GREETING_CLICK_MS;
    } else {
      delayMs = AUTO_HIDE_TALKING_MS;
    }

    let timer = window.setTimeout(() => void nuwa.bubble.hide(), delayMs);
    const reset = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void nuwa.bubble.hide(), delayMs);
    };
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [nuwa, chat.streaming, direction, showTick, mode, segmentSource]);

  // ===== Esc 收起 =====

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") void nuwa.bubble.hide();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nuwa]);

  // ===== 用户在气泡里的交互回调 =====

  const onAdvanceToTalking = useCallback(() => {
    if (mode !== "greeting") return;
    void nuwa.bubble.advanceToTalking();
    setMode("talking");
  }, [mode, nuwa]);

  const onToggleExpand = useCallback(() => {
    const next: BubbleMode = mode === "expanded" ? "talking" : "expanded";
    void nuwa.bubble.setMode(next);
    setMode(next);
  }, [mode, nuwa]);

  /** 用户点正文区域：如果 buffer 还有未播段，立刻跳到下一段；否则才是普通的 expand 切换。 */
  const onTapSaying = useCallback((): "advanced-segment" | "default" => {
    if (pendingCount > 0) {
      buffer.advance();
      return "advanced-segment";
    }
    return "default";
  }, [pendingCount, buffer]);

  // ===== morph 动画到 ChatWindow =====
  // 跨 BrowserWindow 没法真丝滑补间；用"气泡先放大消散 (180ms) → 主进程切窗 → ChatWindow 自身 fade-in"
  // 三段拼出"气泡膨胀变大成聊天窗"的视觉等效。
  const [morphing, setMorphing] = useState(false);
  const onOpenChat = useCallback(() => {
    if (morphing) return;
    setMorphing(true);
    // 等动画跑完一半再切窗，让 ChatWindow show 出来时气泡刚好消散到末端
    window.setTimeout(() => {
      void nuwa.pet.openChat();
    }, 160);
  }, [morphing, nuwa]);

  // 还没拿到角色 bundle 时不渲染。
  if (!bundle) return null;
  const effectiveDirection: BubbleDirection = direction ?? "BR";

  // 把 SegmentBuffer 出来的当前段适配成原 PetSpeechBubble 的 LatestSay。
  // 当 currentSegment 为空 + chat.streaming → 让 Saying 显示 typing 占位（由 PetSpeechBubble 自己处理）。
  const latest: LatestSay | null = currentSegment
    ? {
        id: currentSegment.id,
        text: currentSegment.text,
        source: currentSegment.source
      }
    : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch"
      }}
    >
      <PetSpeechBubble
        bundle={bundle}
        chat={chat}
        latest={latest}
        pendingCount={pendingCount}
        recentTurns={chat.turns.slice(-10)}
        mode={mode}
        direction={effectiveDirection}
        morphing={morphing}
        onAdvanceToTalking={onAdvanceToTalking}
        onToggleExpand={onToggleExpand}
        onTapSaying={onTapSaying}
        onClose={() => void nuwa.bubble.hide()}
        onOpenChat={onOpenChat}
      />
    </div>
  );
}
