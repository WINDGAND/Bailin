import { useCallback, useEffect, useState } from "react";
import { useBailin } from "../shared/use-bailin.js";
import { useI18n } from "../shared/i18n/index.js";
import {
  PetContextMenu,
  type PetMenuCharacter,
  type PetMenuStarter
} from "../pet/PetContextMenu.js";

/**
 * 独立快捷菜单窗：桌宠窗不再扩宽/改锚定，从根上消除右键时的左右抽动与叠对话框。
 */
export function PetMenuApp(): JSX.Element {
  const bailin = useBailin();
  const { resyncLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [characters, setCharacters] = useState<PetMenuCharacter[]>([]);
  const [starters, setStarters] = useState<PetMenuStarter[]>([]);
  const [submenu, setSubmenu] = useState<null | "switch">(null);
  const [hushMinutes, setHushMinutes] = useState(30);

  const close = useCallback(() => {
    setOpen(false);
    setSubmenu(null);
    void bailin.pet.setContextMenuOpen(false);
  }, [bailin]);

  useEffect(() => {
    return bailin.on.petContextMenuOpen(() => {
      void (async () => {
        await resyncLocale();
        const [list, st, visible, settings] = await Promise.all([
          bailin.characters.list(),
          bailin.characters.listStarters(),
          bailin.chat.isVisible(),
          bailin.proactive.getSettings()
        ]);
        setCharacters(list);
        setStarters(st);
        setChatOpen(visible);
        setHushMinutes(settings.defaultHushMinutes ?? 30);
        setSubmenu(null);
        setOpen(true);
      })();
    });
  }, [bailin, resyncLocale]);

  useEffect(() => {
    return bailin.on.petContextMenuClose(() => {
      setOpen(false);
      setSubmenu(null);
    });
  }, [bailin]);

  useEffect(() => {
    if (!open) return;
    const onBlur = () => close();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [open, close]);

  if (!open) {
    return <div className="pet-menu-shell" aria-hidden />;
  }

  return (
    <div className="pet-menu-shell">
      <PetContextMenu
        chatOpen={chatOpen}
        characters={characters}
        starters={starters}
        submenu={submenu}
        hushMinutes={hushMinutes}
        onSubmenu={setSubmenu}
        onSummon={() => {
          void bailin.pet.summon();
          close();
        }}
        onHush={() => {
          void bailin.pet.hush(hushMinutes * 60 * 1000);
          void bailin.chat.hide();
          close();
        }}
        onOpenSettings={() => {
          void bailin.pet.openSettings();
          close();
        }}
        onHide={() => {
          void bailin.pet.hide();
          close();
        }}
        onActivate={async (id) => {
          await bailin.characters.activate(id);
          close();
        }}
        onImportStarter={async (id) => {
          await bailin.characters.importStarter(id);
          close();
        }}
        onClose={close}
      />
    </div>
  );
}
