// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { createDesign, renderSheet } from "@track-assets/designer-core";
import { sheets, templates } from "./templates.ts";
import { withoutGuides } from "./browser.ts";

const preview = (id: string) =>
  `data:image/svg+xml,${encodeURIComponent(withoutGuides(renderSheet(templates, sheets[id], createDesign(templates, id))))}`;
const choices = [
  { id: "gate-standard-v1", description: "Left, top and right panels" },
  { id: "corner-flag-v1", description: "Front and back artwork" },
].map((choice) => ({ ...choice, preview: preview(choice.id) }));

export function TemplatePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]),
    openingIndex = useRef(0);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ top: 0, left: 0 });
  const selectedIndex = choices.findIndex((choice) => choice.id === value);
  useEffect(() => {
    if (disabled) menu.current?.hidePopover();
  }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      setPosition({
        top: bounds.bottom + 8,
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - 282)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  function close() {
    menu.current?.hidePopover();
    trigger.current?.focus();
  }
  function choose(index: number) {
    close();
    if (choices[index].id !== value) onChange(choices[index].id);
  }
  return (
    <div className="template-picker">
      <button
        ref={trigger}
        className="template-trigger"
        role="combobox"
        aria-label="Obstacle"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id}
        disabled={disabled}
        popoverTarget={id}
        onClick={() => {
          openingIndex.current = selectedIndex;
        }}
        onKeyDown={(event) => {
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
        <img
          src={choices[selectedIndex].preview}
          className="template-type-icon"
          alt=""
        />
        <span>{templates[value].name}</span>
        <CaretDown size={13} className="template-caret" aria-hidden />
      </button>
      <div
        ref={menu}
        id={id}
        className="template-menu"
        role="listbox"
        aria-label="Obstacle type"
        popover="auto"
        style={position}
        onBeforeToggle={(event) => setOpen(event.newState === "open")}
        onToggle={(event) => {
          const opened = event.newState === "open";
          if (opened)
            requestAnimationFrame(() =>
              options.current[openingIndex.current]?.focus(),
            );
        }}
        onKeyDown={(event) => {
          const index = options.current.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? choices.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      choices.length) %
                    choices.length;
            options.current[next]?.focus();
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          } else if (event.key === "Tab")
            requestAnimationFrame(() => menu.current?.hidePopover());
        }}
      >
        <p className="template-menu-heading">Obstacle type</p>
        {choices.map((choice, index) => (
          <button
            key={choice.id}
            ref={(element) => {
              options.current[index] = element;
            }}
            role="option"
            aria-selected={choice.id === value}
            aria-label={templates[choice.id].name}
            tabIndex={-1}
            className={`template-option ${choice.id === value ? "selected" : ""}`}
            onClick={() => choose(index)}
          >
            <span className="template-option-icon">
              <img src={choice.preview} alt="" />
            </span>
            <span className="template-option-copy">
              <strong>{templates[choice.id].name}</strong>
              <span>{choice.description}</span>
            </span>
            {choice.id === value && <Check size={17} aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}
