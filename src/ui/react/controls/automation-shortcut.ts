import type { KeyboardEvent, MouseEvent } from "react";

export interface AutomationShortcutHandlers {
  readonly ariaKeyShortcuts: string | undefined;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => boolean;
  readonly onContextMenu: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * Gives every automatable control the same keyboard and context-menu entry.
 * Shift+A opens the existing Piano Roll automation lane. The context menu has
 * one action, so it opens that same lane without a second editor surface.
 */
export function automationShortcut(
  onAutomate: (() => void) | undefined,
): AutomationShortcutHandlers {
  return {
    ariaKeyShortcuts: onAutomate === undefined ? undefined : "Shift+A",
    onKeyDown: (event) => {
      if (!event.shiftKey || event.key.toLowerCase() !== "a" || onAutomate === undefined) {
        return false;
      }
      event.preventDefault();
      onAutomate();
      return true;
    },
    onContextMenu: (event) => {
      if (onAutomate === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      onAutomate();
    },
  };
}
