import { useCallback, useEffect, useRef } from "react";
import { useT } from "../shared/i18n/index.js";
import { Icon } from "../shared/icon.js";
import { usePlatformModKey } from "../shared/use-platform-mod-key.js";

export interface PetMenuStarter {
  id: string;
  name: string;
  sourceName: string;
  track: "utility" | "companion";
  blurb: string;
}

export interface PetMenuCharacter {
  id: string;
  name: string;
  sourceName?: string;
  track: "utility" | "companion";
  isSkeleton: boolean;
  isActive: boolean;
}

export interface PetContextMenuProps {
  chatOpen: boolean;
  characters: PetMenuCharacter[];
  starters: PetMenuStarter[];
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

export function PetContextMenu(props: PetContextMenuProps): JSX.Element {
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

  const getMenuItems = useCallback((): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(
      menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
  }, []);

  // 焦点落在菜单容器上，而不是首项——避免一打开就粉底高亮。
  // 方向键仍可从 activeIdx < 0 进入第一项（见下方键盘处理）。
  useEffect(() => {
    const id = window.setTimeout(() => {
      menuRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

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
      tabIndex={-1}
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
