// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CaretDown, Check } from "@phosphor-icons/react";

interface Choice<T> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export function DropdownSelect<T extends string | number>({
  label,
  value,
  choices,
  disabled = false,
  onChange,
  menuHeading,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
  menuHeading?: string;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]),
    openingIndex = useRef(0);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ top: 0, left: 0, width: 270 });
  const selectedIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.value === value),
  );
  const selected = choices[selectedIndex];
  useEffect(() => {
    if (disabled) menu.current?.hidePopover();
  }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const width = Math.min(
        menuHeading ? 270 : bounds.width,
        window.innerWidth - 24,
      );
      const height = menu.current!.getBoundingClientRect().height;
      setPosition({
        width,
        top:
          bounds.bottom + height + 8 <= window.innerHeight - 12
            ? bounds.bottom + 8
            : Math.max(12, bounds.top - height - 8),
        left: Math.max(
          12,
          Math.min(bounds.left, window.innerWidth - width - 12),
        ),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, menuHeading]);
  function focus(index: number) {
    options.current[index]?.focus({ preventScroll: true });
    options.current[index]?.scrollIntoView({ block: "nearest" });
  }
  function close() {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <div className={`select-control ${menuHeading ? "select-rich" : ""}`}>
      <button
        ref={trigger}
        className="select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id}
        disabled={disabled || !selected}
        popoverTarget={id}
        onClick={() => {
          openingIndex.current = selectedIndex;
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            openingIndex.current =
              event.key === "ArrowUp" || event.key === "End"
                ? choices.length - 1
                : event.key === "Home"
                  ? 0
                  : selectedIndex;
            menu.current?.showPopover();
          }
        }}
      >
        {selected?.icon}
        <span>{selected?.label}</span>
        <CaretDown size={13} className="select-caret" aria-hidden />
      </button>
      <div
        ref={menu}
        id={id}
        className={`select-menu ${menuHeading ? "select-menu-rich" : ""}`}
        role="listbox"
        aria-label={menuHeading ?? label}
        popover="auto"
        style={position}
        onBeforeToggle={(event) => setOpen(event.newState === "open")}
        onToggle={(event) => {
          if (
            event.newState === "open" &&
            document.activeElement === trigger.current
          )
            focus(openingIndex.current);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          const index = options.current.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            focus(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? choices.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      choices.length) %
                    choices.length,
            );
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          } else if (event.key === "Tab")
            requestAnimationFrame(() => menu.current?.hidePopover());
        }}
      >
        {menuHeading && <p className="select-menu-heading">{menuHeading}</p>}
        {choices.map((choice, index) => (
          <button
            key={choice.value}
            ref={(element) => {
              options.current[index] = element;
            }}
            role="option"
            aria-selected={choice.value === value}
            aria-label={choice.label}
            tabIndex={-1}
            className={`select-option ${choice.value === value ? "selected" : ""}`}
            onClick={() => {
              close();
              if (choice.value !== value) onChange(choice.value);
            }}
          >
            {choice.icon && (
              <span className="select-option-icon">{choice.icon}</span>
            )}
            <span className="select-option-copy">
              <strong>{choice.label}</strong>
              {choice.description && <span>{choice.description}</span>}
            </span>
            {choice.value === value && <Check size={16} aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}
