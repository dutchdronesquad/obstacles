// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { useRef } from "react";
import { DotsThree, type Icon } from "@phosphor-icons/react";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";

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
  onTriggerRemoved,
}: {
  name: string;
  actions: LayerAction[];
  disabled?: boolean;
  onTriggerRemoved: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="icon"
          className="icon-button layer-more"
          disabled={disabled}
          aria-label={`Layer options for ${name}`}
        >
          <DotsThree size={18} weight="bold" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="layer-menu"
        onCloseAutoFocus={(event) => {
          if (!trigger.current?.isConnected) {
            event.preventDefault();
            onTriggerRemoved();
          }
        }}
        aria-label={`Actions for ${name}`}
        aria-labelledby={undefined}
      >
        {actions.map(({ icon: Icon, ...action }) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled}
            variant={action.destructive ? "destructive" : "default"}
            onSelect={action.onSelect}
            className="layer-menu-item"
          >
            <Icon size={16} aria-hidden />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
