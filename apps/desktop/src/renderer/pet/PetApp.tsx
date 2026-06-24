import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpriteEvent } from "@bailin/character-protocol";
import { useActiveCharacter, useBailin } from "../shared/use-bailin.js";
import { PetRenderer } from "../shared/pet-renderer.js";
import {
  PET_DISPLAY_SCALE_DEFAULT,
  PET_WINDOW_BASE_SIZE,
  resolveAtlasPetPixelSize,
  resolveDslPetPixelSize
} from "../../shared/pet-display-scale.js";
import { useT, useI18n } from "../shared/i18n/index.js";
import { useRafThrottle } from "../shared/use-raf-throttle.js";
import { useReducedMotion } from "../shared/use-reduced-motion.js";
import { Icon } from "../shared/icon.js";
import { usePlatformModKey } from "../shared/use-platform-mod-key.js";
import { usePetSpriteEvents } from "./use-pet-sprite-events.js";

interface Starter {
  id: string;
  name: string;
  sourceName: string;
  track: "utility" | "companion";
  blurb: string;
}

interface MyCharacter {
  id: string;
  name: string;
  sourceName?: string;
  track: "utility" | "companion";
  isSkeleton: boolean;
  isActive: boolean;
}

const HATCH_SS_KEY_PREFIX = "bailin.hatched.";
/** 判定为「拖动」的最小位移（px）；略大于 0，避免手抖误触。 */
const DRAG_START_PX = 3;

export function PetApp(): JSX.Element {
  const t = useT();
  const { resyncLocale } = useI18n();
  const { bundle } = useActiveCharacter();
  const bailin = useBailin();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);

  const [petDisplayScale, setPetDisplayScale] = useState(PET_DISPLAY_SCALE_DEFAULT);
  const [defaultHushMinutes, setDefaultHushMinutes] = useState(30);

  useEffect(() => {
    void bailin.proactive.getSettings().then((s) => {
      setPetDisplayScale(s.petDisplayScale ?? PET_DISPLAY_SCALE_DEFAULT);
      setDefaultHushMinutes(s.defaultHushMinutes ?? 30);
    });
    return bailin.on.proactiveSettingsChanged((s) => {
      setPetDisplayScale(s.petDisplayScale ?? PET_DISPLAY_SCALE_DEFAULT);
      setDefaultHushMinutes(s.defaultHushMinutes ?? 30);
    });
  }, [bailin]);

  const petSlotWidth = Math.round(PET_WINDOW_BASE_SIZE.width * petDisplayScale);

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
  //
  // 注意：rAF 节流只在 mouse 真在动时 fire 下一帧。如果鼠标静止 (如菜单展开后
  // hover 在某菜单项上不动)，纠正逻辑不会触发。所以菜单 / 拖拽这类「全局可点击」
  // 状态必须由下面的 useEffect 显式强制 setMouseIgnore(false)。
  const draggingRef = useRef(false);
  const menuOpenRef = useRef(false);
  const checkMouseIgnore = useRafThrottle((clientX: number, clientY: number) => {
    if (draggingRef.current || menuOpenRef.current) return;
    const hitTargets = [wrapRef.current, menuLayerRef.current].filter(Boolean) as HTMLElement[];
    const inside = hitTargets.some((el) => {
      const rect = el.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    });
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

  // ===== 右键菜单 =====
  const [menu, setMenu] = useState<{ chatOpen: boolean; side: "left" | "right" } | null>(null);
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [starters, setStarters] = useState<Starter[]>([]);
  const [submenu, setSubmenu] = useState<null | "switch">(null);
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  const refreshLibraryCount = useCallback(async () => {
    const list = await bailin.characters.list();
    setLibraryCount(list.length);
    setCharacters(list);
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

  const openContextMenu = useCallback(async () => {
    await resyncLocale();
    const [list, st, chatOpen] = await Promise.all([
      bailin.characters.list(),
      bailin.characters.listStarters(),
      bailin.chat.isVisible()
    ]);
    const side = await bailin.pet.setContextMenuOpen(true);
    setMenu({ chatOpen, side: side ?? "right" });
    setSubmenu(null);
    setCharacters(list);
    setStarters(st);
  }, [bailin, resyncLocale]);

  const onPetContextMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      void openContextMenu();
    },
    [openContextMenu]
  );

  const onPetKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // 拖拽工程是鼠标语义；键盘等价：Enter / Space 唤起聊天。
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sendSpriteEvent("click");
        window.setTimeout(() => {
          void bailin.pet.openChat();
          sendSpriteEvent("chatOpen");
        }, 420);
        return;
      }
      // Shift+F10 / ContextMenu 键：a11y 标准的右键替代触发。
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        e.preventDefault();
        void openContextMenu();
      }
    },
    [bailin, sendSpriteEvent, openContextMenu]
  );

  const closeMenu = useCallback(() => {
    setMenu(null);
    setSubmenu(null);
    void bailin.pet.setContextMenuOpen(false);
    // 菜单关闭后焦点回到桌宠，避免键盘用户焦点丢到 body。
    window.setTimeout(() => wrapRef.current?.focus(), 0);
  }, [bailin]);

  // 菜单展开期间强制整窗接收 mouse events（设 ignore=false）。否则当 mouse
  // 从桌宠移到菜单时，桌宠的 onPointerLeave 会先把 ignore 设回 true，菜单上
  // hover/cursor 还是 CSS 视觉响应（因为 forward:true），但 click 全部被穿透
  // 到下面的桌面 → 点不动菜单项。菜单关闭后 ignore 恢复默认 true，下一次
  // mouse 移到桌宠区域时 checkMouseIgnore 会再把它设回 false。
  useEffect(() => {
    menuOpenRef.current = menu !== null;
    if (menu) {
      ignoredRef.current = false;
      mouseInsideRef.current = true;
      void bailin.pet.setMouseIgnore(false);
    } else {
      ignoredRef.current = true;
      mouseInsideRef.current = false;
      void bailin.pet.setMouseIgnore(true);
    }
  }, [menu, bailin]);

  useEffect(() => {
    if (!menu) return;
    const onBlur = () => closeMenu();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [menu, closeMenu]);

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
    <div className={`pet-root${menu?.side === "left" ? " pet-root--menu-left" : ""}`}>
      <div
        className="pet-slot"
        style={{ width: menu ? petSlotWidth : "100%" }}
      >
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
              aria-expanded={menu !== null}
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
                // 菜单展开 / 拖拽中时，整窗都需要可点击；不要在这里 ignore，
                // 否则鼠标从桌宠移到菜单的瞬间会让菜单 click 失效。
                if (draggingRef.current || menu) return;
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

      {menu ? (
        <>
          <div className="pet-menu-backdrop" aria-hidden onMouseDown={closeMenu} />
          <div ref={menuLayerRef} className="pet-menu-column">
            <PetContextMenu
              chatOpen={menu.chatOpen}
              characters={characters}
              starters={starters}
              submenu={submenu}
              hushMinutes={defaultHushMinutes}
              onSubmenu={(s) => setSubmenu(s)}
              onSummon={() => {
                void bailin.pet.summon();
                closeMenu();
              }}
              onHush={() => {
                void bailin.pet.hush(defaultHushMinutes * 60 * 1000);
                void bailin.chat.hide();
                closeMenu();
              }}
              onOpenSettings={() => void bailin.pet.openSettings()}
              onHide={() => void bailin.pet.hide()}
              onActivate={async (id) => {
                await bailin.characters.activate(id);
                closeMenu();
              }}
              onImportStarter={async (id) => {
                await bailin.characters.importStarter(id);
                closeMenu();
              }}
              onClose={closeMenu}
            />
          </div>
        </>
      ) : null}
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

interface MenuProps {
  chatOpen: boolean;
  characters: MyCharacter[];
  starters: Starter[];
  submenu: null | "switch";
  hushMinutes: number;
  onSubmenu: (s: null | "switch") => void;
  onSummon: () => void;
  onHush: () => void;
  onOpenSettings: () => void;
  onHide: () => void;
  onActivate: (id: string) => void;
  onImportStarter: (id: string) => void;
  onClose: () => void;
}

function PetContextMenu(props: MenuProps): JSX.Element {
  const t = useT();
  const modKey = usePlatformModKey();
  const {
    chatOpen,
    characters,
    starters,
    submenu,
    onSubmenu,
    onSummon,
    onHush,
    hushMinutes,
    onOpenSettings,
    onHide,
    onActivate,
    onImportStarter,
    onClose
  } = props;
  const menuRef = useRef<HTMLDivElement>(null);

  // 实时查询当前可见的 menuitem（submenu 展开 / 收起会变）。
  const getMenuItems = useCallback((): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(
      menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
  }, []);

  // 打开时把焦点移入首项；setTimeout 0 让 DOM 渲染稳定后再 focus。
  useEffect(() => {
    const id = window.setTimeout(() => {
      const items = getMenuItems();
      items[0]?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [getMenuItems]);

  // 键盘导航：Esc 关闭；Arrow / Home / End 在 menuitem 间环形移动；
  // Tab / Shift+Tab 当作方向键（即焦点 trap 在 menu 内）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const items = getMenuItems();
      if (items.length === 0) return;
      const activeIdx = items.indexOf(document.activeElement as HTMLElement);

      const focusAt = (next: number): void => {
        e.preventDefault();
        items[next]?.focus();
      };

      if (e.key === "ArrowDown") {
        focusAt(activeIdx < 0 ? 0 : (activeIdx + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        focusAt(activeIdx < 0 ? items.length - 1 : (activeIdx - 1 + items.length) % items.length);
      } else if (e.key === "Home") {
        focusAt(0);
      } else if (e.key === "End") {
        focusAt(items.length - 1);
      } else if (e.key === "Tab") {
        const dir = e.shiftKey ? -1 : 1;
        focusAt(activeIdx < 0 ? 0 : (activeIdx + dir + items.length) % items.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, getMenuItems]);

  return (
    <div
      ref={menuRef}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
      aria-orientation="vertical"
      className="pet-menu-panel fade-in-up"
    >
      <MenuItem
        label={chatOpen ? t("pet.menuCloseChat") : t("pet.menuOpenChat")}
        hint={t("pet.summonShortcut", { mod: modKey })}
        onClick={onSummon}
        delay={0}
      />
      <MenuItem
        label={t("pet.menuHush", { minutes: hushMinutes })}
        onClick={onHush}
        delay={20}
      />
      <MenuItem
        label={t("pet.menuSwitchCharacter")}
        hasSubmenu
        onClick={() => onSubmenu(submenu === "switch" ? null : "switch")}
        delay={30}
      />
      {submenu === "switch" ? (
        <div
          className="fade-in"
          style={{
            borderTop: "1px solid var(--grid)",
            borderBottom: "1px solid var(--grid)",
            background: "var(--paper-deep)",
            maxHeight: 280,
            overflowY: "auto"
          }}
        >
          {characters.length === 0 ? (
            <div style={{ padding: "8px 14px", color: "var(--ink-faint)" }}>
              {t("pet.menuLibraryEmpty")}
            </div>
          ) : (
            characters.map((c, i) => (
              <MenuItem
                key={c.id}
                label={c.name}
                active={c.isActive}
                sub={
                  c.track === "utility" ? t("chat.trackUtility") : t("chat.trackCompanion")
                }
                onClick={() => onActivate(c.id)}
                delay={i * 24}
              />
            ))
          )}
          {starters.length > 0 ? (
            <>
              <div
                className="eyebrow"
                style={{
                  // 复用 .eyebrow 排版（mono + uppercase + tracking），但菜单上下文里
                  // 用 --ink-faint 替代默认 --magenta：避免与 active 角色的 magenta dot
                  // 视觉撞色（一个菜单不该出现两个 magenta 焦点）。
                  padding: "6px 14px 2px",
                  color: "var(--ink-faint)",
                  fontSize: 10
                }}
              >
                {t("pet.menuBuiltInStarters")}
              </div>
              {starters.map((s, i) => (
                <MenuItem
                  key={s.id}
                  label={`+ ${s.name}`}
                  sub={
                    s.track === "utility" ? t("chat.trackUtility") : t("chat.trackCompanion")
                  }
                  onClick={() => onImportStarter(s.id)}
                  delay={(characters.length + i) * 24}
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      <MenuItem label={t("pet.menuOpenSettings")} onClick={onOpenSettings} delay={60} />
      <MenuItem label={t("pet.menuHideToTray")} onClick={onHide} delay={90} />
    </div>
  );
}

function MenuItem({
  label,
  sub,
  hint,
  hasSubmenu,
  active,
  onClick,
  delay = 0
}: {
  label: string;
  sub?: string;
  hint?: string;
  hasSubmenu?: boolean;
  /** 标记当前 active（替代原来的 "● " 前导字符 + 空白对齐 hack）。 */
  active?: boolean;
  onClick: () => void;
  delay?: number;
}): JSX.Element {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      aria-current={active ? "true" : undefined}
      className="fade-in-up pet-menu-item"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "9px 14px",
        border: "none",
        fontFamily: "inherit",
        fontSize: "inherit",
        color: "inherit",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 120ms var(--ease-out)",
        animationDelay: `${delay}ms`
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {/* active 小圆点；inactive 也占位（统一对齐，不再依赖空白字符 hack）。 */}
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            width: 8,
            justifyContent: "center",
            color: "var(--magenta)"
          }}
        >
          {active ? <Icon name="dot" size={6} /> : null}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </span>
      <span
        style={{
          color: "var(--ink-faint)",
          fontSize: 11,
          marginLeft: 12,
          display: "inline-flex",
          alignItems: "center"
        }}
      >
        {hint ?? sub ?? (hasSubmenu ? <Icon name="chevron-right" size={12} /> : null)}
      </span>
    </button>
  );
}
