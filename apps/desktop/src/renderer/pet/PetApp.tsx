import { useCallback, useEffect, useRef, useState } from "react";
import type { SpriteEvent } from "@nuwa-pet/character-protocol";
import { useActiveCharacter, useNuwa } from "../shared/use-nuwa.js";
import { PetRenderer } from "../shared/pet-renderer.js";

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

const HATCH_SS_KEY_PREFIX = "nuwa.hatched.";

export function PetApp(): JSX.Element {
  const { bundle } = useActiveCharacter();
  const nuwa = useNuwa();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);

  // ===== 首次破壳 =====
  const [hatchKey, setHatchKey] = useState<number>(0);
  const [hatching, setHatching] = useState(false);
  useEffect(() => {
    if (!bundle) return;
    const k = HATCH_SS_KEY_PREFIX + bundle.card.id;
    if (sessionStorage.getItem(k) === "1") {
      setHatching(false);
      return;
    }
    setHatching(true);
    setHatchKey((n) => n + 1);
    const t = window.setTimeout(() => {
      setHatching(false);
      sessionStorage.setItem(k, "1");
    }, 820);
    return () => window.clearTimeout(t);
  }, [bundle?.card.id]);

  // ===== 鼠标穿透（仅在桌宠像素 BBox 内才接收事件） =====
  const draggingRef = useRef(false);
  useEffect(() => {
    let mouseInside = false;
    let ignored = true;
    const handler = (e: MouseEvent) => {
      if (draggingRef.current) return;
      const hitTargets = [wrapRef.current, menuLayerRef.current].filter(Boolean) as HTMLElement[];
      const inside = hitTargets.some((el) => {
        const rect = el.getBoundingClientRect();
        return (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        );
      });
      if (inside !== mouseInside) {
        mouseInside = inside;
        const nextIgnored = !inside;
        if (nextIgnored !== ignored) {
          ignored = nextIgnored;
          void nuwa.pet.setMouseIgnore(nextIgnored);
        }
      }
    };
    window.addEventListener("mousemove", handler, { passive: true });
    void nuwa.pet.setMouseIgnore(true);
    return () => window.removeEventListener("mousemove", handler);
  }, [nuwa]);

  // ===== 拖动 + 单击唤起 =====
  // 拖动判定：鼠标移动 ≥ 4px 即视为拖动（无延迟，完全跟手）。
  // 位移计算全在主进程（getCursorScreenPoint），彻底规避 HiDPI 下
  // 渲染进程 CSS 像素与 Electron 物理坐标系不一致的问题。
  const dragStateRef = useRef<{
    dragging: boolean;
    startScreenX: number;
    startScreenY: number;
  } | null>(null);
  const [externalEvent, setExternalEvent] = useState<{ kind: SpriteEvent; nonce: number } | null>(
    null
  );
  const sendSpriteEvent = useCallback((kind: SpriteEvent) => {
    setExternalEvent((prev) => ({ kind, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const onPetPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        dragging: false,
        startScreenX: e.screenX,
        startScreenY: e.screenY
      };
      void nuwa.pet.setMouseIgnore(false);
    },
    [nuwa]
  );

  const onPetPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragStateRef.current;
      if (!s) return;
      if (!s.dragging) {
        // 超过 4px 才判定为拖动，避免误把点击识别为拖动。
        if (Math.abs(e.screenX - s.startScreenX) < 4 && Math.abs(e.screenY - s.startScreenY) < 4) return;
        s.dragging = true;
        draggingRef.current = true;
        void (async () => {
          await nuwa.pet.dragStart();
          await nuwa.pet.dragMove();
        })();
        sendSpriteEvent("dragStart");
        return;
      }
      void nuwa.pet.dragMove();
    },
    [nuwa, sendSpriteEvent]
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
        void nuwa.pet.dragEnd();
        sendSpriteEvent("dragEnd");
      } else {
        void nuwa.pet.summon();
      }
    },
    [nuwa, sendSpriteEvent]
  );

  // ===== 托盘 / 快捷键唤起时震一下 =====
  const [nudgeNonce, setNudgeNonce] = useState(0);
  useEffect(() => {
    return nuwa.on.petSummon(() => {
      setNudgeNonce((n) => n + 1);
      sendSpriteEvent("chatOpen");
    });
  }, [nuwa, sendSpriteEvent]);

  useEffect(() => {
    return nuwa.on.proactiveWhisper((evt) => {
      if (!bundle || evt.characterId !== bundle.card.id) return;
      // 气泡渲染搬到独立窗口；桌宠这边只负责放一个 nudge + chatOpen 动画。
      setNudgeNonce((n) => n + 1);
      sendSpriteEvent("chatOpen");
    });
  }, [nuwa, bundle?.card.id, sendSpriteEvent]);

  // ===== 右键菜单 =====
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [starters, setStarters] = useState<Starter[]>([]);
  const [submenu, setSubmenu] = useState<null | "switch">(null);

  const onPetContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
      setSubmenu(null);
      const [list, st] = await Promise.all([
        nuwa.characters.list(),
        nuwa.characters.listStarters()
      ]);
      setCharacters(list);
      setStarters(st);
    },
    [nuwa]
  );

  // 点击菜单外 / Esc / 失焦：关闭
  useEffect(() => {
    if (!menu) return;
    const close = () => {
      setMenu(null);
      setSubmenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // ===== 空状态 =====
  if (!bundle) {
    return <EmptyPet onPickStarter={() => void nuwa.pet.openSettings()} />;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        pointerEvents: "none"
      }}
    >
      <div
        ref={wrapRef}
        key={`pet-wrap-${nudgeNonce}`}
        className={`${hatching ? "hatch" : ""} ${nudgeNonce > 0 ? "nudge-once" : ""}`}
        style={{
          pointerEvents: "auto",
          padding: 4,
          borderRadius: 18,
          filter: "drop-shadow(0 12px 24px rgba(31,58,58,0.4))",
          cursor: "grab",
          userSelect: "none"
        }}
        onPointerDown={onPetPointerDown}
        onPointerMove={onPetPointerMove}
        onPointerUp={onPetPointerUp}
        onPointerCancel={onPetPointerUp}
        onContextMenu={(e) => void onPetContextMenu(e)}
        title="左键点击唤起 · 拖动移动 · 右键菜单"
      >
        <PetRenderer
          key={`sprite-${hatchKey}-${bundle.card.id}`}
          program={bundle.sprite}
          externalEvent={externalEvent ?? undefined}
          hatching={hatching}
        />
      </div>

      {menu ? (
        <div ref={menuLayerRef} style={{ pointerEvents: "auto" }}>
          <PetContextMenu
            x={menu.x}
            y={menu.y}
            characters={characters}
            starters={starters}
            submenu={submenu}
            onSubmenu={(s) => setSubmenu(s)}
            onSummon={() => void nuwa.pet.summon()}
            onHush={() => {
              void nuwa.pet.hush(30 * 60 * 1000);
              void nuwa.bubble.hide();
              setMenu(null);
            }}
            onOpenSettings={() => void nuwa.pet.openSettings()}
            onHide={() => void nuwa.pet.hide()}
            onActivate={async (id) => {
              await nuwa.characters.activate(id);
              setMenu(null);
            }}
            onImportStarter={async (id) => {
              await nuwa.characters.importStarter(id);
              setMenu(null);
            }}
            onClose={() => setMenu(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

// =============================================================
// 空状态：没有任何角色时给一个明显的引导按钮 + 像素剪影
// =============================================================

function EmptyPet({ onPickStarter }: { onPickStarter: () => void }): JSX.Element {
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
      <button
        type="button"
        onClick={onPickStarter}
        className="fade-in-up"
        style={{
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px 14px",
          background: "rgba(31, 58, 58, 0.92)",
          color: "var(--paper)",
          borderRadius: 14,
          border: "1px solid rgba(245, 239, 226, 0.18)",
          fontFamily: "var(--font-body)",
          fontSize: 13,
          cursor: "pointer",
          boxShadow: "0 18px 36px -16px rgba(0,0,0,0.5)"
        }}
        title="还没有角色，点这里挑一只"
      >
        {/* 像素剪影：一只 chibi 形状 */}
        <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
          <rect x="9" y="3" width="6" height="6" fill="rgba(245,239,226,0.7)" />
          <rect x="7" y="9" width="10" height="8" fill="rgba(245,239,226,0.4)" />
          <rect x="8" y="17" width="3" height="4" fill="rgba(245,239,226,0.3)" />
          <rect x="13" y="17" width="3" height="4" fill="rgba(245,239,226,0.3)" />
        </svg>
        <span style={{ fontWeight: 500 }}>桌面还空着 · 点这里挑一只</span>
      </button>
    </div>
  );
}

// =============================================================
// 右键菜单
// =============================================================

interface MenuProps {
  x: number;
  y: number;
  characters: MyCharacter[];
  starters: Starter[];
  submenu: null | "switch";
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
  const {
    x,
    y,
    characters,
    starters,
    submenu,
    onSubmenu,
    onSummon,
    onHush,
    onOpenSettings,
    onHide,
    onActivate,
    onImportStarter
  } = props;

  const menuRef = useRef<HTMLDivElement | null>(null);
  // 菜单出现时把焦点交给第一个按钮，方便键盘操作
  useEffect(() => {
    const firstBtn = menuRef.current?.querySelector("button");
    (firstBtn as HTMLButtonElement | null)?.focus?.();
  }, []);

  return (
    <div
      ref={menuRef}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
      className="fade-in-up"
      style={{
        position: "fixed",
        left: Math.min(x, window.innerWidth - 240),
        top: Math.min(y, window.innerHeight - 280),
        pointerEvents: "auto",
        background: "var(--paper)",
        border: "1px solid var(--grid-strong)",
        borderRadius: 12,
        boxShadow: "0 22px 50px rgba(0,0,0,0.28)",
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--ink)",
        minWidth: 220,
        zIndex: 9999,
        overflow: "hidden"
      }}
    >
      <MenuItem label="唤起对话" hint="Ctrl+Shift+P" onClick={onSummon} delay={0} />
      <MenuItem label="安静 30 分钟" onClick={onHush} delay={20} />
      <MenuItem
        label="切换角色"
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
            <div style={{ padding: "8px 14px", color: "var(--ink-faint)" }}>仓库为空</div>
          ) : (
            characters.map((c, i) => (
              <MenuItem
                key={c.id}
                label={`${c.isActive ? "● " : "  "}${c.name}`}
                sub={c.track === "utility" ? "实用" : "陪伴"}
                onClick={() => onActivate(c.id)}
                delay={i * 24}
              />
            ))
          )}
          {starters.length > 0 ? (
            <>
              <div
                style={{
                  padding: "6px 14px 2px",
                  color: "var(--ink-faint)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase"
                }}
              >
                内置示例
              </div>
              {starters.map((s, i) => (
                <MenuItem
                  key={s.id}
                  label={`+ ${s.name}`}
                  sub={s.track === "utility" ? "实用" : "陪伴"}
                  onClick={() => onImportStarter(s.id)}
                  delay={(characters.length + i) * 24}
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      <MenuItem label="打开设置 / 角色仓库" onClick={onOpenSettings} delay={60} />
      <MenuItem label="隐藏到托盘" onClick={onHide} delay={90} />
    </div>
  );
}

function MenuItem({
  label,
  sub,
  hint,
  hasSubmenu,
  onClick,
  delay = 0
}: {
  label: string;
  sub?: string;
  hint?: string;
  hasSubmenu?: boolean;
  onClick: () => void;
  delay?: number;
}): JSX.Element {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className="fade-in-up"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "9px 14px",
        background: "transparent",
        border: "none",
        fontFamily: "inherit",
        fontSize: "inherit",
        color: "inherit",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 120ms var(--ease-out)",
        animationDelay: `${delay}ms`
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(178, 24, 88, 0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onFocus={(e) => (e.currentTarget.style.background = "rgba(178, 24, 88, 0.08)")}
      onBlur={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span>{label}</span>
      <span style={{ color: "var(--ink-faint)", fontSize: 11, marginLeft: 12 }}>
        {hint ?? sub ?? (hasSubmenu ? "▸" : "")}
      </span>
    </button>
  );
}
