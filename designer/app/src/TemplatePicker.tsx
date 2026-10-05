// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { createDesign, renderSheet } from "@track-assets/designer-core";
import { sheets, templates } from "./templates.ts";
import { withoutGuides } from "./browser.ts";
import { DropdownSelect } from "./DropdownSelect.tsx";

const preview = (id: string) =>
  `data:image/svg+xml,${encodeURIComponent(withoutGuides(renderSheet(templates, sheets[id], createDesign(templates, id))))}`;
const choices = [
  { value: "gate-standard-v1", description: "Left, top and right panels" },
  { value: "corner-flag-v1", description: "Front and back artwork" },
].map((choice) => ({
  ...choice,
  label: templates[choice.value].name,
  icon: (
    <img src={preview(choice.value)} className="template-type-icon" alt="" />
  ),
}));

export function TemplatePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="template-picker">
      <DropdownSelect
        label="Obstacle"
        menuHeading="Obstacle type"
        value={value}
        choices={choices}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}
