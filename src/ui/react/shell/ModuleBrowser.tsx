import { useRef, useState } from "react";

import type { PluginManifest, RackSlotId } from "../../../contracts";
import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./Shell.module.css";

/**
 * Deterministic per-plugin bar heights, so each definition gets its own
 * original DOM thumbnail rather than one shared decoration. Pure arithmetic on
 * the plugin ID: no screenshots and no raster artwork (section 13.1).
 */
function thumbnailBars(pluginId: string): readonly number[] {
  let hash = 0;
  for (const character of pluginId) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 997;
  }
  return Array.from({ length: 5 }, (_, index) => {
    const value = (hash >> (index * 2)) % 13;
    return 6 + value;
  });
}

function typeDescription(manifest: PluginManifest): string {
  if (manifest.kind !== "instrument") return "Effect";
  return manifest.voices.length > 1
    ? `Drum machine, ${String(manifest.voices.length)} voices`
    : "Monophonic instrument";
}

/** One empty rack slot a card can land on, with the box measured at drag start. */
interface DropTarget {
  readonly element: Element;
  readonly slotId: RackSlotId;
  readonly rect: DOMRect;
}

/**
 * The unified module browser: one list, no tabs. Double-click adds to the first
 * empty slot. Each Add button is the keyboard path. The complete card drags a
 * definition into a specific rack slot (section 13.1).
 */
export function ModuleBrowser() {
  const { addablePluginIds, manifestFor, visibleSlotCount } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const addModule = useAppStore((state) => state.addModule);
  const [filter, setFilter] = useState("");
  const dropHint = useRef<Element | undefined>(undefined);
  const dropTargets = useRef<readonly DropTarget[]>([]);

  const visibleSlots = rackSlots.slice(0, visibleSlotCount);
  const firstEmpty = visibleSlots.find((slot) => slot.moduleId === undefined);

  const entries = addablePluginIds.flatMap((pluginId) => {
    const manifest = manifestFor(pluginId);
    if (manifest === undefined) return [];
    const query = filter.trim().toLowerCase();
    if (
      query.length > 0 &&
      !manifest.productName.toLowerCase().includes(query) &&
      !(manifest.shortLabel ?? "").toLowerCase().includes(query) &&
      !typeDescription(manifest).toLowerCase().includes(query)
    ) {
      return [];
    }
    return [{ pluginId, manifest }];
  });

  const clearDropHint = () => {
    dropHint.current?.removeAttribute("data-drop-hint");
    dropHint.current = undefined;
  };

  /**
   * Empty slot elements with their boxes, measured once when a drag starts.
   * Both the rack and the overview render their slots in project order, so an
   * element's index in its own list is its slot index. Section 21.9 keeps
   * layout measurement out of pointer-move handlers, so the gesture reads no
   * geometry and calls no hit test after this point.
   */
  const captureDropTargets = () => {
    const collect = (selector: string): DropTarget[] =>
      [...document.querySelectorAll(selector)].flatMap((element, index) => {
        const slot = visibleSlots[index];
        if (slot === undefined || slot.moduleId !== undefined) return [];
        const rect = element.getBoundingClientRect();
        return [{ element, slotId: slot.id, rect }];
      });
    dropTargets.current = [
      ...collect('[data-component="rack"] [data-component="rack-module"]'),
      ...collect('[data-component="rack-overview"] li'),
    ];
  };

  const slotIdUnderPointer = (clientX: number, clientY: number) => {
    clearDropHint();
    const hit = dropTargets.current.find(
      (target) =>
        clientX >= target.rect.left &&
        clientX <= target.rect.right &&
        clientY >= target.rect.top &&
        clientY <= target.rect.bottom,
    );
    if (hit === undefined) return undefined;
    hit.element.setAttribute("data-drop-hint", "true");
    dropHint.current = hit.element;
    return hit.slotId;
  };

  return (
    <aside
      className={styles.moduleBrowser}
      data-component="module-browser"
      aria-label="Module browser"
    >
      <header className={styles.panelHeader}>
        <span className={styles.statusLamp} aria-hidden="true" />
        <h2>All modules</h2>
      </header>
      <div className={styles.browserFilter}>
        <input
          type="search"
          aria-label="Filter modules"
          placeholder="Filter"
          value={filter}
          onChange={(event) => {
            setFilter(event.currentTarget.value);
          }}
        />
      </div>
      <div className={styles.moduleList}>
        {addablePluginIds.length === 0 ? (
          <p className={styles.browserEmpty}>
            No modules are registered. Reload Pulsebox to restore the built-in instruments.
          </p>
        ) : entries.length === 0 ? (
          <p className={styles.browserEmpty}>
            No modules match the filter.{" "}
            <button
              type="button"
              onClick={() => {
                setFilter("");
              }}
            >
              Clear filter
            </button>
          </p>
        ) : (
          entries.map(({ pluginId, manifest }) => (
            <article
              key={pluginId}
              className={styles.moduleChoice}
              style={{ "--module-accent": manifest.ui.moduleAccent.accent } as React.CSSProperties}
              aria-label={manifest.productName}
              title={`${typeDescription(manifest)}. Drag ${
                manifest.productName
              } into an empty rack slot.`}
              onPointerDown={(event) => {
                if (event.button !== 0 || (event.target as Element).closest("button") !== null)
                  return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                captureDropTargets();
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                slotIdUnderPointer(event.clientX, event.clientY);
              }}
              onPointerUp={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                event.currentTarget.releasePointerCapture(event.pointerId);
                const slotId = slotIdUnderPointer(event.clientX, event.clientY);
                clearDropHint();
                if (slotId !== undefined) addModule(slotId, pluginId);
              }}
              onPointerCancel={clearDropHint}
              onLostPointerCapture={clearDropHint}
              onDoubleClick={() => {
                if (firstEmpty !== undefined) addModule(firstEmpty.id, pluginId);
              }}
            >
              <div className={styles.moduleThumbnail} aria-hidden="true">
                {manifest.ui.icon !== undefined ? (
                  <svg
                    className={styles.moduleIcon}
                    viewBox={manifest.ui.icon.viewBox}
                    focusable="false"
                  >
                    <path d={manifest.ui.icon.path} fill="currentColor" fillRule="evenodd" />
                  </svg>
                ) : (
                  thumbnailBars(pluginId).map((height, index) => (
                    <i key={index} style={{ blockSize: `${String(height)}px` }} />
                  ))
                )}
              </div>
              <div className={styles.moduleChoiceText}>
                <strong>{manifest.shortLabel}</strong>
                <span>{manifest.productName}</span>
                <div className={styles.moduleChoiceActions}>
                  <button
                    type="button"
                    aria-label={`Add ${manifest.productName} to the first empty rack slot`}
                    title={
                      firstEmpty === undefined
                        ? "The rack is full."
                        : `Add ${manifest.productName} to the first empty rack slot.`
                    }
                    disabled={firstEmpty === undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (firstEmpty !== undefined) addModule(firstEmpty.id, pluginId);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </svg>
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
