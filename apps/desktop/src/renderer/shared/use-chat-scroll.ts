import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { StreamPhase } from "./use-chat-session.js";

const NEAR_BOTTOM_PX = 72;

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

function scrollToBottom(el: HTMLElement, smooth: boolean): void {
  if (smooth) {
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

export interface ChatScrollState {
  showScrollDown: boolean;
  scrollToLatest(): void;
  /** 用户主动发送等场景：下次内容更新时强制滚到底 */
  forceScrollOnNextUpdate(): void;
}

export function useChatScroll(
  listRef: RefObject<HTMLDivElement | null>,
  deps: {
    turnsLength: number;
    pending: string;
    phase: StreamPhase;
  }
): ChatScrollState {
  const [showScrollDown, setShowScrollDown] = useState(false);
  const pinnedBottomRef = useRef(true);
  const initialDoneRef = useRef(false);
  const forceNextRef = useRef(false);
  const prevTurnsLengthRef = useRef(0);

  const hasContent =
    deps.turnsLength > 0 || deps.pending.length > 0 || deps.phase !== "idle";

  const syncScrollDownVisible = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasContent) {
      setShowScrollDown(false);
      return;
    }
    const scrollable = el.scrollHeight - el.clientHeight > 8;
    setShowScrollDown(scrollable && !isNearBottom(el));
  }, [listRef, hasContent]);

  const scrollToLatest = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    scrollToBottom(el, true);
    pinnedBottomRef.current = true;
    setShowScrollDown(false);
  }, [listRef]);

  const forceScrollOnNextUpdate = useCallback(() => {
    forceNextRef.current = true;
    pinnedBottomRef.current = true;
    setShowScrollDown(false);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedBottomRef.current = isNearBottom(el);
      syncScrollDownVisible();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [listRef, syncScrollDownVisible]);

  useEffect(() => {
    if (deps.turnsLength === 0 && prevTurnsLengthRef.current > 0) {
      initialDoneRef.current = false;
      pinnedBottomRef.current = true;
      setShowScrollDown(false);
    }
    prevTurnsLengthRef.current = deps.turnsLength;
  }, [deps.turnsLength]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    if (!hasContent) {
      setShowScrollDown(false);
      return;
    }

    const shouldStick =
      forceNextRef.current || pinnedBottomRef.current || !initialDoneRef.current;
    forceNextRef.current = false;

    if (shouldStick) {
      const instant =
        !initialDoneRef.current || deps.phase === "streaming" || deps.phase === "thinking";
      scrollToBottom(el, !instant);
      pinnedBottomRef.current = true;
      initialDoneRef.current = true;
    }

    requestAnimationFrame(syncScrollDownVisible);
  }, [deps.turnsLength, deps.pending, deps.phase, listRef, hasContent, syncScrollDownVisible]);

  return { showScrollDown, scrollToLatest, forceScrollOnNextUpdate };
}
