import { useEffect, useLayoutEffect, useRef } from "react";

import { cx } from "../class-names";
import styles from "./PopupMenu.module.css";

export interface PopupMenuItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Marks a destructive command such as `Delete module`. */
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

export interface PopupMenuProps {
  /** Accessible name of the menu, e.g. "Silver Serpent module menu". */
  readonly label: string;
  readonly items: readonly PopupMenuItem[];
  /** Viewport coordinates the menu opens at. */
  readonly position: { readonly x: number; readonly y: number };
  readonly onClose: () => void;
}

/**
 * One popup menu for module context menus and empty-slot Add pickers. It is
 * focusable and keyboard-operable: arrows move, Home and End jump, Enter or
 * Space activates, and Escape or an outside press closes. Focus returns to the
 * element that opened it, so the right-click and Shift+F10 paths behave the
 * same way after the menu closes.
 */
export function PopupMenu({ label, items, position, onClose }: PopupMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  // Escape, Tab, and item activation return focus to the opener. An outside
  // press does not: the press already chose a new focus target, and pulling
  // focus back to the opener would fight the pointer.
  const restoreFocusRef = useRef(true);

  // Focus the first enabled item on open and restore the opener on close.
  useEffect(() => {
    openerRef.current = document.activeElement;
    const first = menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    first?.focus();
    return () => {
      if (!restoreFocusRef.current) return;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // A press outside the menu closes it without activating anything.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node) === true) return;
      restoreFocusRef.current = false;
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  // Keeps the menu inside the viewport when opened near an edge.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;
    const rect = menu.getBoundingClientRect();
    const overflowX = Math.max(0, rect.right - window.innerWidth + 4);
    const overflowY = Math.max(0, rect.bottom - window.innerHeight + 4);
    if (overflowX > 0) menu.style.left = `${String(Math.max(4, position.x - overflowX))}px`;
    if (overflowY > 0) menu.style.top = `${String(Math.max(4, position.y - overflowY))}px`;
  }, [position]);

  const moveFocus = (direction: 1 | -1 | "first" | "last") => {
    const menu = menuRef.current;
    if (menu === null) return;
    const enabled = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (enabled.length === 0) return;
    if (direction === "first") {
      enabled[0]?.focus();
      return;
    }
    if (direction === "last") {
      enabled[enabled.length - 1]?.focus();
      return;
    }
    const active = document.activeElement;
    const index = enabled.findIndex((item) => item === active);
    const next = enabled[(index + direction + enabled.length) % enabled.length];
    next?.focus();
  };

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={label}
      data-component="popup-menu"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        switch (event.key) {
          case "Escape":
          case "Tab":
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          case "ArrowDown":
            event.preventDefault();
            moveFocus(1);
            return;
          case "ArrowUp":
            event.preventDefault();
            moveFocus(-1);
            return;
          case "Home":
            event.preventDefault();
            moveFocus("first");
            return;
          case "End":
            event.preventDefault();
            moveFocus("last");
            return;
          default:
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={cx(styles.item, item.danger === true && styles.danger)}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
