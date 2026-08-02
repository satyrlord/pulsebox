import { useRef, useState } from "react";

import type { ModuleInstanceId, PluginId, RackSlotId } from "../../../contracts";
import { PopupMenu, type PopupMenuItem } from "../controls/PopupMenu";
import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./Shell.module.css";

interface OpenMenu {
  readonly kind: "add" | "module";
  readonly slotId: RackSlotId;
  readonly moduleId?: ModuleInstanceId;
  readonly x: number;
  readonly y: number;
}

function slotLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/**
 * Compact strips for all eight slots. The plus control in each empty slot is
 * the only visible Add action here, and a loaded module's context menu owns
 * `Delete module` (section 13.2).
 */
export function RackOverview() {
  const { addablePluginIds, manifestFor, visibleSlotCount } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const addModule = useAppStore((state) => state.addModule);
  const removeModule = useAppStore((state) => state.removeModule);
  const duplicateModule = useAppStore((state) => state.duplicateModule);
  const swapModule = useAppStore((state) => state.swapModule);
  const selectModule = useAppStore((state) => state.selectModule);

  const [openMenu, setOpenMenu] = useState<OpenMenu | undefined>(undefined);
  // True when a trigger press found its own menu already open. The menu's
  // outside-press handler closes it on pointerdown, so without this guard the
  // click that follows would reopen the menu instead of toggling it shut.
  const menuTogglePress = useRef(false);

  const visible = rackSlots.slice(0, visibleSlotCount);
  const firstEmpty = visible.find((slot) => slot.moduleId === undefined);

  const scrollModuleIntoView = (slotIndex: number) => {
    // Selecting a slot scrolls its full module into view (section 13.2). The
    // rack renders slots in the same order, so the index maps one to one.
    const sections = document.querySelectorAll(
      '[data-component="rack"] [data-component="rack-module"]',
    );
    sections[slotIndex]?.scrollIntoView({ block: "nearest" });
  };

  const addItems = (slotId: RackSlotId): readonly PopupMenuItem[] =>
    addablePluginIds.flatMap((pluginId): PopupMenuItem[] => {
      const manifest = manifestFor(pluginId);
      if (manifest === undefined) return [];
      return [
        {
          id: pluginId,
          label: manifest.productName,
          onSelect: () => {
            addModule(slotId, pluginId);
          },
        },
      ];
    });

  const swapItems = (moduleId: ModuleInstanceId, currentPluginId: PluginId): PopupMenuItem[] =>
    addablePluginIds.flatMap((pluginId): PopupMenuItem[] => {
      if (pluginId === currentPluginId) return [];
      const manifest = manifestFor(pluginId);
      if (manifest === undefined) return [];
      return [
        {
          id: `swap-${pluginId}`,
          label: `Swap to ${manifest.productName}`,
          onSelect: () => {
            swapModule(moduleId, pluginId);
          },
        },
      ];
    });

  const moduleItems = (moduleId: ModuleInstanceId, currentPluginId: PluginId): PopupMenuItem[] => [
    {
      id: "duplicate",
      label: "Duplicate",
      disabled: firstEmpty === undefined,
      onSelect: () => {
        if (firstEmpty !== undefined) duplicateModule(moduleId, firstEmpty.id);
      },
    },
    ...swapItems(moduleId, currentPluginId),
    {
      id: "delete",
      label: "Delete module",
      danger: true,
      onSelect: () => {
        removeModule(moduleId);
      },
    },
  ];

  return (
    <aside className={styles.rackOverview} data-component="rack-overview" aria-label="Rack slots">
      <header className={styles.panelHeader}>
        <h2>Slots</h2>
      </header>
      <ol className={styles.slotList}>
        {visible.map((slot, index) => {
          const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
          const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
          const selected = module !== undefined && module.id === selectedModuleId;
          return (
            <li key={slot.id} data-selected={selected || undefined}>
              <span>{slotLabel(index)}</span>
              {module === undefined || manifest === undefined ? (
                <button
                  type="button"
                  className={styles.emptySlot}
                  aria-haspopup="menu"
                  aria-expanded={openMenu?.kind === "add" && openMenu.slotId === slot.id}
                  aria-label={`Add module to rack slot ${slotLabel(index)}`}
                  onPointerDown={() => {
                    menuTogglePress.current =
                      openMenu?.kind === "add" && openMenu.slotId === slot.id;
                  }}
                  onClick={(event) => {
                    if (menuTogglePress.current) {
                      menuTogglePress.current = false;
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    setOpenMenu({
                      kind: "add",
                      slotId: slot.id,
                      x: rect.left,
                      y: rect.bottom + 2,
                    });
                  }}
                >
                  Empty +
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.occupiedSlot}
                  aria-pressed={selected}
                  aria-label={`Select ${manifest.productName} in rack slot ${slotLabel(index)}`}
                  style={
                    { "--module-accent": manifest.ui.moduleAccent.accent } as React.CSSProperties
                  }
                  onClick={() => {
                    selectModule(module.id);
                    scrollModuleIntoView(index);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setOpenMenu({
                      kind: "module",
                      slotId: slot.id,
                      moduleId: module.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setOpenMenu({
                        kind: "module",
                        slotId: slot.id,
                        moduleId: module.id,
                        x: rect.left,
                        y: rect.bottom + 2,
                      });
                    }
                  }}
                >
                  <span className={styles.slotCardMark} aria-hidden="true" />
                  <strong>{manifest.shortLabel}</strong>
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {openMenu === undefined ? null : (
        <PopupMenu
          label={
            openMenu.kind === "add" ? "Add module" : "Module menu"
          }
          position={{ x: openMenu.x, y: openMenu.y }}
          onClose={() => {
            setOpenMenu(undefined);
          }}
          items={(() => {
            if (openMenu.kind === "add") return addItems(openMenu.slotId);
            const module =
              openMenu.moduleId === undefined ? undefined : modules[openMenu.moduleId];
            if (module === undefined) return [];
            return moduleItems(module.id, module.pluginId);
          })()}
        />
      )}
    </aside>
  );
}
