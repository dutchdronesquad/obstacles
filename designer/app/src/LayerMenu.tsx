// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { useId, useLayoutEffect, useRef, useState } from "react";
import { DotsThree, type Icon } from "@phosphor-icons/react";

export interface LayerAction {
  label: string;
  icon: Icon;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function LayerMenu({
  name,
  actions,
  disabled,
}: {
  name: string;
  actions: LayerAction[];
  disabled?: boolean;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const buttons = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
  const place = () => {
    const bounds = trigger.current!.getBoundingClientRect(),
      height = menu.current!.getBoundingClientRect().height;
    setPosition({
      left: Math.max(12, Math.min(bounds.right - 204, window.innerWidth - 216)),
      top:
        bounds.bottom + height + 6 < window.innerHeight - 12
          ? bounds.bottom + 6
          : Math.max(12, bounds.top - height - 6),
    });
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const close = () => {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <button
        ref={trigger}
        className="icon-button layer-more"
        aria-label={`Layer options for ${name}`}
        title={`Layer options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        popoverTarget={id}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            menu.current?.showPopover();
          }
        }}
      >
        <DotsThree size={18} weight="bold" aria-hidden />
      </button>
      <div
        ref={menu}
        id={id}
        role="menu"
        aria-label={`Actions for ${name}`}
        popover="auto"
        className="select-menu layer-menu"
        style={position}
        onBeforeToggle={(event) => setOpen(event.newState === "open")}
        onToggle={(event) => {
          if (event.newState === "open") place();
          if (
            event.newState === "open" &&
            document.activeElement === trigger.current
          )
            buttons()[0]?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          const items = buttons(),
            index = items.indexOf(document.activeElement as HTMLButtonElement);
          if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            items[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                    items.length
            ]?.focus();
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          } else if (event.key === "Tab")
            requestAnimationFrame(() => menu.current?.hidePopover());
        }}
      >
        {actions.map(
          ({ label, icon: IconComponent, onSelect, disabled, destructive }) => (
            <button
              key={label}
              role="menuitem"
              tabIndex={-1}
              disabled={disabled}
              className={`layer-menu-item ${destructive ? "destructive" : ""}`}
              onClick={() => {
                close();
                onSelect();
              }}
            >
              <IconComponent size={16} aria-hidden />
              {label}
            </button>
          ),
        )}
      </div>
    </>
  );
}
