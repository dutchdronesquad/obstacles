// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

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
  const selected =
    choices.find((choice) => choice.value === value) ?? choices[0];
  return (
    <div className={`select-control ${menuHeading ? "select-rich" : ""}`}>
      <Select
        value={String(selected?.value)}
        disabled={disabled || !selected}
        onValueChange={(next) => {
          const choice = choices.find(
            (choice) => String(choice.value) === next,
          );
          if (choice && choice.value !== value) onChange(choice.value);
        }}
      >
        <SelectTrigger className="select-trigger w-full" aria-label={label}>
          <SelectValue>
            {selected?.icon}
            <span>{selected?.label}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          aria-label={menuHeading ?? label}
          className={
            menuHeading
              ? "select-menu-rich w-[270px] max-w-[calc(100vw-24px)]"
              : "w-[var(--radix-select-trigger-width)]"
          }
        >
          <SelectGroup>
            {menuHeading && <SelectLabel>{menuHeading}</SelectLabel>}
            {choices.map((choice) => (
              <SelectItem
                key={choice.value}
                value={String(choice.value)}
                textValue={choice.label}
                aria-label={choice.label}
                aria-labelledby={undefined}
                className="select-option"
              >
                {choice.icon && (
                  <span className="select-option-icon" aria-hidden>
                    {choice.icon}
                  </span>
                )}
                <span className="select-option-copy">
                  <strong>{choice.label}</strong>
                  {choice.description && <span>{choice.description}</span>}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
