import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpriteEvent } from "@bailin/character-protocol";
import { useActiveCharacter, useBailin } from "../shared/use-bailin.js";
import { PetRenderer } from "../shared/pet-renderer.js";
import {
  PET_DISPLAY_SCALE_DEFAULT,
  resolveAtlasPetPixelSize,
  resolveDslPetPixelSize
} from "../../shared/pet-display-scale.js";
import { useT } from "../shared/i18n/index.js";
import { useRafThrottle } from "../shared/use-raf-throttle.js";
import { useReducedMotion } from "../shared/use-reduced-motion.js";
import { Icon } from "../shared/icon.js";
import { usePetSpriteEvents } from "./use-pet-sprite-events.js";

const HATCH_SS_KEY_PREFIX = "bailin.hatched.";
/** 判定为「拖动」的最小位移（px）；略大于 0，避免手抖误触。 */
const DRAG_START_PX = 3;

export function PetApp(): JSX.Element | null {
  const t = useT();
  const { bundle } = useActiveCharacter();
  const bailin = useBailin();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [petDisplayScale, setPetDisplayScale] = useState(PET_DISPLAY_SCALE_DEFAULT);

  useEffect(() => {
    void bailin.proactive.getSettings().then((s) => {
      setPetDisplayScale(s.petDisplayScale ?? PET_DISPLAY_SCALE_DEFAULT);
    });
    return bailin.on.proactiveSettingsChanged((s) => {
      setPetDisplayScale(s.petDisplayScale ?? PET_DISPLAY_SCALE_DEFAULT);
    });
  }, [bailin]);

  const petPixelSize = useMemo(() => {
    if (!bundle?.sprite) return undefined;
    const program = bundle.sprite;
    if (program.mode === "atlas" && program.atlas) {
      return resolveAtlasPetPixelSize(program.atlas.cell, petDisplayScale);
    }
    return resolveDslPetPixelSize(
      program.size,
      program.displayScale,
      petDisplayScale
    );
  }, [bundle?.sprite, petDisplayScale]);

  // ===== 首次破壳 =====
  const reducedMotion = useReducedMotion();
  const [hatchKey, setHatchKey] = useState<number>(0);
  const [hatching, setHatching] = useState(false);
  useEffect(() => {
    if (!bundle) return;
    const k = HATCH_SS_KEY_PREFIX + bundle.card.id;
    if (sessionStorage.getItem(k) === "1") {
      setHatching(false);
      return;
    }
    // reduced-motion 用户跳过破壳动画：直接标记完成，立即显示桌宠。
    // （不要让他们卡在 820ms 静止画面等待。）
    if (reducedMotion) {
      setHatching(false);
      sessionStorage.setItem(k, "1");
      return;
    }
    setHatching(true);
    setHatchKey((n) => n + 1);
    const t = window.setTimeout(() => {
      setHatching(false);
      sessionStorage.setItem(k, "1");
    }, 820);
    return () => window.clearTimeout(t);
  }, [bundle?.card.id, reducedMotion]);

  // ===== 鼠标穿透（仅在桌宠像素 BBox 内才接收事件） =====
  // 用 rAF 节流：每帧最多 1 次 getBoundingClientRect + setMouseIgnore IPC，
  // 避免高频 mousemove（每秒 60+ 次）压主进程。
  // 快捷菜单已是独立窗，不再需要「菜单展开期间强制整窗可点」。
  const draggingRef = useRef(false);
  const checkMouseIgnore = useRafThrottle((clientX: number, clientY: number) => {
    if (draggingRef.current) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (inside !== mouseInsideRef.current) {
      mouseInsideRef.current = inside;
      const nextIgnored = !inside;
      if (nextIgnored !== ignoredRef.current) {
        ignoredRef.current = nextIgnored;
        void bailin.pet.setMouseIgnore(nextIgnored);
      }
    }
  });
  const mouseInsideRef = useRef(false);
  const ignoredRef = useRef(true);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      checkMouseIgnore(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", handler, { passive: true });
    void bailin.pet.setMouseIgnore(true);
    return () => window.removeEventListener("mousemove", handler);
  }, [bailin, checkMouseIgnore]);

  // ===== 拖动 + 单击唤起 =====
  const dragStateRef = useRef<{
    dragging: boolean;
    startScreenX: number;
    startScreenY: number;
    lastScreenX: number;
  } | null>(null);
  const [externalEvent, setExternalEvent] = useState<{ kind: SpriteEvent; nonce: number } | null>(
    null
  );
  const dragRunDirectionRef = useRef<"left" | "right">("right");
  const [dragRunDirection, setDragRunDirection] = useState<"left" | "right">("right");
  const sendSpriteEvent = useCallback((kind: SpriteEvent) => {
    setExternalEvent((prev) => ({ kind, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  usePetSpriteEvents(bundle?.card.id, sendSpriteEvent);

  const onPetPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        dragging: false,
        startScreenX: e.screenX,
        startScreenY: e.screenY,
        lastScreenX: e.screenX
      };
      void bailin.pet.setMouseIgnore(false);
    },
    [bailin]
  );

  const applyDragRunDelta = useCallback((deltaX: number) => {
    if (deltaX === 0) return;
    const dir: "left" | "right" = deltaX > 0 ? "right" : "left";
    if (dragRunDirectionRef.current === dir) return;
    dragRunDirectionRef.current = dir;
    setDragRunDirection(dir);
  }, []);

  const onPetPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragStateRef.current;
      if (!s) return;

      const deltaX =
        e.movementX !== 0 ? e.movementX : e.screenX - s.lastScreenX;
      s.lastScreenX = e.screenX;

      if (!s.dragging) {
        if (
          Math.abs(e.screenX - s.startScreenX) < DRAG_START_PX &&
          Math.abs(e.screenY - s.startScreenY) < DRAG_START_PX
        ) {
          return;
        }
        s.dragging = true;
        draggingRef.current = true;
        applyDragRunDelta(
          deltaX !== 0 ? deltaX : e.screenX - s.startScreenX
        );
        void (async () => {
          await bailin.pet.dragStart();
          await bailin.pet.dragMove();
        })();
        sendSpriteEvent("dragStart");
        return;
      }

      applyDragRunDelta(deltaX);
      void bailin.pet.dragMove();
    },
    [bailin, sendSpriteEvent, applyDragRunDelta]
  );

  const onPetPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragStateRef.current;
      if (!s) return;
      const wasDragging = s.dragging;
      dragStateRef.current = null;
      draggingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (wasDragging) {
        void bailin.pet.dragEnd();
        sendSpriteEvent("dragEnd");
      } else {
        sendSpriteEvent("click");
        window.setTimeout(() => {
          void bailin.pet.openChat();
          sendSpriteEvent("chatOpen");
        }, 420);
      }
    },
    [bailin, sendSpriteEvent]
  );

  // ===== 托盘 / 快捷键唤起时震一下 =====
  const [nudgeNonce, setNudgeNonce] = useState(0);
  useEffect(() => {
    return bailin.on.petSummon(() => {
      setNudgeNonce((n) => n + 1);
      sendSpriteEvent("chatOpen");
    });
  }, [bailin, sendSpriteEvent]);

  // ===== 右键菜单（独立窗，不改桌宠 bounds） =====
  const [menuOpen, setMenuOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  const refreshLibraryCount = useCallback(async () => {
    const list = await bailin.characters.list();
    setLibraryCount(list.length);
  }, [bailin]);

  useEffect(() => {
    void refreshLibraryCount();
    const off = bailin.on.activeCharacterChanged(() => void refreshLibraryCount());
    const onFocus = () => void refreshLibraryCount();
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [bailin, refreshLibraryCount]);

  useEffect(() => {
    const offOpen = bailin.on.petContextMenuOpen(() => setMenuOpen(true));
    const offClose = bailin.on.petContextMenuClose(() => setMenuOpen(false));
    return () => {
      offOpen();
      offClose();
    };
  }, [bailin]);

  const openContextMenu = useCallback(() => {
    void bailin.pet.setContextMenuOpen(true);
  }, [bailin]);

  const onPetContextMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      openContextMenu();
    },
    [openContextMenu]
  );

  const onPetKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sendSpriteEvent("click");
        window.setTimeout(() => {
          void bailin.pet.openChat();
          sendSpriteEvent("chatOpen");
        }, 420);
        return;
      }
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        e.preventDefault();
        openContextMenu();
      }
    },
    [bailin, sendSpriteEvent, openContextMenu]
  );

  if (!bundle) {
    if (libraryCount === 0) {
      return (
        <EmptyPet
          onPickStarter={() => void bailin.pet.openSettings()}
          onDismiss={() => void bailin.pet.hide()}
        />
      );
    }
    return null;
  }

  return (
    <div className="pet-root">
      <div className="pet-slot">
        <div className="pet-column">
          <div className="pet-wrap-zone">
            <div
              ref={wrapRef}
              key={`pet-wrap-${nudgeNonce}`}
              className={`pet-wrap ${hatching ? "hatch" : ""} ${nudgeNonce > 0 ? "nudge-once" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={
                bundle ? t("pet.ariaLabel", { name: bundle.card.meta.name }) : t("pet.dragHint")
              }
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={{
                pointerEvents: "auto",
                padding: 4,
                borderRadius: 18,
                cursor: "grab",
                userSelect: "none"
              }}
              onPointerDown={onPetPointerDown}
              onPointerEnter={() => void bailin.pet.setMouseIgnore(false)}
              onPointerLeave={() => {
                if (draggingRef.current) return;
                void bailin.pet.setMouseIgnore(true);
              }}
              onPointerMove={onPetPointerMove}
              onPointerUp={onPetPointerUp}
              onPointerCancel={onPetPointerUp}
              onContextMenu={onPetContextMenu}
              onKeyDown={onPetKeyDown}
              title={t("pet.dragHint")}
            >
              <PetRenderer
                key={`sprite-${hatchKey}-${bundle.card.id}`}
                program={bundle.sprite}
                externalEvent={externalEvent ?? undefined}
                runDirection={dragRunDirection}
                runDirectionRef={dragRunDirectionRef}
                hatching={hatching}
                width={petPixelSize?.width}
                height={petPixelSize?.height}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyPet({
  onPickStarter,
  onDismiss
}: {
  onPickStarter: () => void;
  onDismiss: () => void;
}): JSX.Element {
  const t = useT();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
        pointerEvents: "none"
      }}
    >
      <div className="fade-in-up pet-empty-cta">
        <button
          type="button"
          className="pet-empty-cta__dismiss btn btn--icon"
          onClick={onDismiss}
          aria-label={t("pet.emptyDismiss")}
        >
          <Icon name="close" size={14} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          onClick={onPickStarter}
          className="pet-empty-cta__trigger"
          aria-label={t("pet.emptyTitle")}
        >
          <span className="pet-empty-cta__eyebrow">{t("pet.emptyEyebrow")}</span>
          <span className="pet-empty-cta__title">{t("pet.emptyTitle")}</span>
          <span className="pet-empty-cta__body">{t("pet.emptyBody")}</span>
          <span className="pet-empty-cta__pip" aria-hidden="true">
            <Icon name="sparkle" size={14} strokeWidth={1.6} />
          </span>
        </button>
      </div>
    </div>
  );
}
